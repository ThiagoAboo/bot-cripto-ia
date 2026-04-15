import crypto from 'crypto'
import path from 'path'
import { promises as fs } from 'fs'
import {
  buildTrainingEvaluationSummary,
  type TrainingEvaluationSummary,
  type TrainingMetricEntry,
  type TrainingSessionConfig,
} from './training-evaluation.service'
import type { PythonEnginePackage } from './python-ml-engine.service'

interface SaveTrainingModelArtifactInput {
  sessionId: string
  userId: string
  botId: string
  modelVersion: string
  config: Record<string, unknown>
  metrics: unknown[]
  bestEpoch?: number | null
  bestValLoss?: number | null
  evaluationOverride?: TrainingEvaluationSummary
  enginePackage?: PythonEnginePackage
}

export interface TrainingModelArtifact {
  artifactType: 'bot-crypto-ia-training-model'
  formatVersion: 4
  fingerprint: string
  savedAt: string
  sessionId: string
  userId: string
  botId: string
  modelVersion: string
  summary: {
    architecture: string | null
    dataSource: string | null
    timeframe: string | null
    bestEpoch: number | null
    bestValLoss: number | null
    totalEpochs: number
    validationStrategy: 'holdout' | 'walk_forward'
  }
  evaluation: ReturnType<typeof buildTrainingEvaluationSummary>
  reproducibility: {
    configFingerprint: string
    metricsFingerprint: string
    featureFingerprint: string
    datasetFingerprint: string
    validationSplit: number | null
    walkForwardFolds: number
    forecastHorizonCandles: number
    buyThresholdPercent: number
    sellThresholdPercent: number
    includedPairs: string[]
    indicators: string[]
    trainingPeriod?: {
      startDate?: string
      endDate?: string
    }
  }
  config: Record<string, unknown>
  metrics: unknown[]
  enginePackage?: PythonEnginePackage
}

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'models')

function sanitizeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'model'
}

function buildArtifactFingerprint(
  config: Record<string, unknown>,
  metrics: unknown[],
  enginePackage?: PythonEnginePackage,
): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ config, metrics, enginePackage }))
    .digest('hex')
}

function buildHash(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

export function getTrainingModelStorageDir(): string {
  return path.resolve(process.env.TRAINING_MODEL_STORAGE_DIR || DEFAULT_STORAGE_DIR)
}

export function resolveTrainingModelArtifactPath(modelUrl: string): string {
  return path.join(getTrainingModelStorageDir(), path.basename(modelUrl))
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
  const config = input.config as TrainingSessionConfig
  const metrics = input.metrics as TrainingMetricEntry[]
  const evaluation = input.evaluationOverride ?? buildTrainingEvaluationSummary(config, metrics, {
    bestEpoch: input.bestEpoch ?? null,
    bestValLoss: input.bestValLoss ?? null,
  })
  const artifact: TrainingModelArtifact = {
    artifactType: 'bot-crypto-ia-training-model',
    formatVersion: 4,
    fingerprint: buildArtifactFingerprint(input.config, input.metrics, input.enginePackage),
    savedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    userId: input.userId,
    botId: input.botId,
    modelVersion: input.modelVersion,
    summary: {
      architecture: typeof input.config.architecture === 'string' ? input.config.architecture : null,
      dataSource: typeof input.config.dataSource === 'string' ? input.config.dataSource : null,
      timeframe: typeof input.config.timeframe === 'string' ? input.config.timeframe : null,
      bestEpoch: input.bestEpoch ?? null,
      bestValLoss: input.bestValLoss ?? null,
      totalEpochs: input.metrics.length,
      validationStrategy: evaluation.validationStrategy,
    },
    evaluation,
    reproducibility: {
      configFingerprint: buildHash(input.config),
      metricsFingerprint: buildHash(input.metrics),
      featureFingerprint: buildHash({
        indicators: input.config.indicators,
        timeframe: input.config.timeframe,
        architecture: input.config.architecture,
      }),
      datasetFingerprint: buildHash({
        dataSource: input.config.dataSource,
        includedPairs: input.config.includedPairs,
        trainingPeriod: input.config.trainingPeriod,
        uploadedFileUrl: input.config.uploadedFileUrl,
      }),
      validationSplit: typeof (input.config.hyperparameters as { validationSplit?: unknown } | undefined)?.validationSplit === 'number'
        ? (input.config.hyperparameters as { validationSplit: number }).validationSplit
        : null,
      walkForwardFolds: evaluation.walkForwardFolds,
      forecastHorizonCandles: evaluation.labelConfiguration.horizonCandles,
      buyThresholdPercent: evaluation.labelConfiguration.buyThresholdPercent,
      sellThresholdPercent: evaluation.labelConfiguration.sellThresholdPercent,
      includedPairs: Array.isArray(input.config.includedPairs)
        ? input.config.includedPairs.filter((entry): entry is string => typeof entry === 'string')
        : [],
      indicators: Array.isArray(input.config.indicators)
        ? input.config.indicators.filter((entry): entry is string => typeof entry === 'string')
        : [],
      trainingPeriod: typeof input.config.trainingPeriod === 'object' && input.config.trainingPeriod !== null
        ? {
            startDate: typeof (input.config.trainingPeriod as { startDate?: unknown }).startDate === 'string'
              ? (input.config.trainingPeriod as { startDate: string }).startDate
              : undefined,
            endDate: typeof (input.config.trainingPeriod as { endDate?: unknown }).endDate === 'string'
              ? (input.config.trainingPeriod as { endDate: string }).endDate
              : undefined,
          }
        : undefined,
    },
    config: input.config,
    metrics: input.metrics,
    enginePackage: input.enginePackage,
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
  const absolutePath = resolveTrainingModelArtifactPath(modelUrl)
  const buffer = await fs.readFile(absolutePath)

  return {
    filename,
    buffer,
  }
}

export async function readTrainingModelArtifactJson(modelUrl: string): Promise<TrainingModelArtifact> {
  const { buffer } = await readTrainingModelArtifact(modelUrl)
  return JSON.parse(buffer.toString('utf-8')) as TrainingModelArtifact
}
