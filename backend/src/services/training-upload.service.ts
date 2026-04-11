import path from 'path'
import { promises as fs } from 'fs'
import type { Request } from 'express'

export class TrainingUploadError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 400) {
    super(message)
    this.name = 'TrainingUploadError'
    this.statusCode = statusCode
  }
}

const DEFAULT_TRAINING_UPLOAD_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'uploads')

function sanitizeFilenameSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'dataset'
}

function getTimestampLabel(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

function extractMultipartBoundary(contentType: string | undefined): string {
  if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw new TrainingUploadError('Content-Type multipart/form-data é obrigatório')
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]

  if (!boundary) {
    throw new TrainingUploadError('Boundary do multipart não encontrado')
  }

  return boundary
}

async function readRequestBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', resolve)
    req.on('error', reject)
  })

  return Buffer.concat(chunks)
}

function parseMultipartFile(body: Buffer, boundary: string): {
  filename: string
  mimeType: string
  buffer: Buffer
} {
  const boundaryToken = `--${boundary}`
  const rawParts = body.toString('utf-8').split(boundaryToken)

  for (const rawPart of rawParts) {
    const normalizedPart = rawPart.trim()
    if (!normalizedPart || normalizedPart === '--') {
      continue
    }

    const [rawHeaders, ...rawValueParts] = normalizedPart.split('\r\n\r\n')
    if (!rawHeaders || rawValueParts.length === 0) {
      continue
    }

    const headers = rawHeaders.split('\r\n')
    const disposition = headers.find((header) => header.toLowerCase().startsWith('content-disposition:'))
    const contentTypeHeader = headers.find((header) => header.toLowerCase().startsWith('content-type:'))

    if (!disposition || !/name="file"/i.test(disposition)) {
      continue
    }

    const filenameMatch = disposition.match(/filename="([^"]+)"/i)
    const originalFilename = filenameMatch?.[1]?.trim()
    if (!originalFilename) {
      throw new TrainingUploadError('Arquivo CSV não enviado')
    }

    const mimeType = contentTypeHeader?.split(':')[1]?.trim() || 'text/csv'
    const rawValue = rawValueParts.join('\r\n\r\n').replace(/\r\n$/, '')
    const fileBuffer = Buffer.from(rawValue, 'utf-8')

    if (fileBuffer.byteLength === 0) {
      throw new TrainingUploadError('O arquivo enviado está vazio')
    }

    return {
      filename: originalFilename,
      mimeType,
      buffer: fileBuffer,
    }
  }

  throw new TrainingUploadError('Campo file não encontrado no multipart')
}

export function getTrainingUploadStorageDir(): string {
  return path.resolve(process.env.TRAINING_UPLOAD_STORAGE_DIR || DEFAULT_TRAINING_UPLOAD_STORAGE_DIR)
}

export async function parseTrainingUploadRequest(req: Request): Promise<{
  filename: string
  mimeType: string
  buffer: Buffer
}> {
  const boundary = extractMultipartBoundary(req.headers['content-type'])
  const rawBody = await readRequestBody(req)

  if (rawBody.byteLength === 0) {
    throw new TrainingUploadError('Nenhum conteúdo foi enviado no upload')
  }

  const file = parseMultipartFile(rawBody, boundary)
  const normalizedFilename = sanitizeFilenameSegment(file.filename)

  if (!normalizedFilename.toLowerCase().endsWith('.csv')) {
    throw new TrainingUploadError('Apenas arquivos CSV são suportados')
  }

  return {
    ...file,
    filename: normalizedFilename,
  }
}

export async function saveTrainingUpload(input: {
  filename: string
  buffer: Buffer
}): Promise<{
  url: string
  filename: string
  absolutePath: string
  size: number
}> {
  const storageDir = getTrainingUploadStorageDir()
  await fs.mkdir(storageDir, { recursive: true })

  const filename = `dataset_${getTimestampLabel()}_${sanitizeFilenameSegment(path.basename(input.filename))}`
  const absolutePath = path.join(storageDir, filename)

  await fs.writeFile(absolutePath, input.buffer)

  return {
    url: `/uploads/${filename}`,
    filename,
    absolutePath,
    size: input.buffer.byteLength,
  }
}

export function resolveTrainingUploadPath(uploadUrl: string): string {
  const filename = path.basename(uploadUrl)
  if (!filename || filename === '.' || filename === '..') {
    throw new TrainingUploadError('URL de upload inválida', 400)
  }

  return path.join(getTrainingUploadStorageDir(), filename)
}

export async function assertTrainingUploadExists(uploadUrl: string): Promise<void> {
  const absolutePath = resolveTrainingUploadPath(uploadUrl)

  try {
    await fs.access(absolutePath)
  } catch {
    throw new TrainingUploadError('Arquivo de dataset não encontrado', 404)
  }
}

export async function readTrainingUpload(uploadUrl: string): Promise<{
  filename: string
  content: string
}> {
  const absolutePath = resolveTrainingUploadPath(uploadUrl)

  try {
    const content = await fs.readFile(absolutePath, 'utf-8')
    return {
      filename: path.basename(absolutePath),
      content,
    }
  } catch {
    throw new TrainingUploadError('Arquivo de dataset não encontrado', 404)
  }
}
