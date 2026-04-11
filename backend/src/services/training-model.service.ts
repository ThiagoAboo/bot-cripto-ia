import crypto from 'crypto'
import path from 'path'
import { promises as fs } from 'fs'

interface SaveTrainingModelArtifactInput {
  sessionId: string
  userId: string
  botId: string
  modelVersion: string
  config: Record<string, unknown>
  metrics: unknown[]
  bestEpoch?: number | null
  bestValLoss?: number | null
}

interface TrainingModelArtifact {
  artifactType: 'bot-crypto-ia-training-model'
  formatVersion: 1
  fingerprint: string
  savedAt: string
  sessionId: string
  userId: string
  botId: string
  modelVersion: string
  summary: {
    bestEpoch: number | null
    bestValLoss: number | null
    totalEpochs: number
  }
  config: Record<string, unknown>
  metrics: unknown[]
}

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'models')

function sanitizeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'model'
}

function buildArtifactFingerprint(config: Record<string, unknown>, metrics: unknown[]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ config, metrics }))
    .digest('hex')
}

export function getTrainingModelStorageDir(): string {
  return path.resolve(process.env.TRAINING_MODEL_STORAGE_DIR || DEFAULT_STORAGE_DIR)
}

export function buildTrainingModelFilename(sessionId: string, modelVersion: string): string {
  return `model_${sanitizeSegment(sessionId)}_${sanitizeSegment(modelVersion)}.h5`
}

async function ensureTrainingModelStorageDir(): Promise<string> {
  const storageDir = getTrainingModelStorageDir()
  await fs.mkdir(storageDir, { recursive: true })
  return storageDir
}

export async function saveTrainingModelArtifact(input: SaveTrainingModelArtifactInput): Promise<{
  modelUrl: string
  filename: string
  absolutePath: string
  size: number
}> {
  const storageDir = await ensureTrainingModelStorageDir()
  const filename = buildTrainingModelFilename(input.sessionId, input.modelVersion)
  const absolutePath = path.join(storageDir, filename)
  const artifact: TrainingModelArtifact = {
    artifactType: 'bot-crypto-ia-training-model',
    formatVersion: 1,
    fingerprint: buildArtifactFingerprint(input.config, input.metrics),
    savedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    userId: input.userId,
    botId: input.botId,
    modelVersion: input.modelVersion,
    summary: {
      bestEpoch: input.bestEpoch ?? null,
      bestValLoss: input.bestValLoss ?? null,
      totalEpochs: input.metrics.length,
    },
    config: input.config,
    metrics: input.metrics,
  }

  const buffer = Buffer.from(JSON.stringify(artifact, null, 2), 'utf-8')
  await fs.writeFile(absolutePath, buffer)

  return {
    modelUrl: `/models/${filename}`,
    filename,
    absolutePath,
    size: buffer.byteLength,
  }
}

export async function readTrainingModelArtifact(modelUrl: string): Promise<{
  filename: string
  buffer: Buffer
}> {
  const filename = path.basename(modelUrl)
  const absolutePath = path.join(getTrainingModelStorageDir(), filename)
  const buffer = await fs.readFile(absolutePath)

  return {
    filename,
    buffer,
  }
}
