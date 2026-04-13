import path from 'path'
import { promises as fs } from 'fs'

interface SaveTrainingCheckpointInput {
  sessionId: string
  userId: string
  botId: string
  status: string
  reason: 'periodic' | 'paused' | 'cancelled' | 'completed' | 'failed' | 'recovered'
  config: Record<string, unknown>
  metrics: unknown[]
  bestEpoch?: number | null
  bestValLoss?: number | null
}

interface TrainingCheckpointArtifact {
  artifactType: 'bot-crypto-ia-training-checkpoint'
  formatVersion: 1
  savedAt: string
  sessionId: string
  userId: string
  botId: string
  status: string
  reason: SaveTrainingCheckpointInput['reason']
  summary: {
    bestEpoch: number | null
    bestValLoss: number | null
    totalEpochs: number
    lastEpoch: number
  }
  config: Record<string, unknown>
  metrics: unknown[]
}

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'checkpoints')

function sanitizeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'checkpoint'
}

export function getTrainingCheckpointStorageDir(): string {
  return path.resolve(process.env.TRAINING_CHECKPOINT_STORAGE_DIR || DEFAULT_STORAGE_DIR)
}

export function buildTrainingCheckpointFilename(sessionId: string): string {
  return `checkpoint_${sanitizeSegment(sessionId)}.json`
}

async function ensureCheckpointStorageDir(): Promise<string> {
  const storageDir = getTrainingCheckpointStorageDir()
  await fs.mkdir(storageDir, { recursive: true })
  return storageDir
}

export async function saveTrainingCheckpoint(input: SaveTrainingCheckpointInput): Promise<{
  checkpointUrl: string
  filename: string
  absolutePath: string
  size: number
}> {
  const storageDir = await ensureCheckpointStorageDir()
  const filename = buildTrainingCheckpointFilename(input.sessionId)
  const absolutePath = path.join(storageDir, filename)
  const lastEpoch = input.metrics.length

  const artifact: TrainingCheckpointArtifact = {
    artifactType: 'bot-crypto-ia-training-checkpoint',
    formatVersion: 1,
    savedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    userId: input.userId,
    botId: input.botId,
    status: input.status,
    reason: input.reason,
    summary: {
      bestEpoch: input.bestEpoch ?? null,
      bestValLoss: input.bestValLoss ?? null,
      totalEpochs: input.metrics.length,
      lastEpoch,
    },
    config: input.config,
    metrics: input.metrics,
  }

  const buffer = Buffer.from(JSON.stringify(artifact, null, 2), 'utf-8')
  await fs.writeFile(absolutePath, buffer)

  return {
    checkpointUrl: `/checkpoints/${filename}`,
    filename,
    absolutePath,
    size: buffer.byteLength,
  }
}

export async function readTrainingCheckpoint(sessionId: string): Promise<TrainingCheckpointArtifact | null> {
  const absolutePath = path.join(getTrainingCheckpointStorageDir(), buildTrainingCheckpointFilename(sessionId))

  try {
    const buffer = await fs.readFile(absolutePath, 'utf-8')
    return JSON.parse(buffer) as TrainingCheckpointArtifact
  } catch {
    return null
  }
}
