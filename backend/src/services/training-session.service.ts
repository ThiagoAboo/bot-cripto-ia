import { io } from '../app'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'

type TrainingLogLevel = 'INFO' | 'WARN' | 'ERROR'

interface TrainingLogEntry {
  timestamp: string
  level: TrainingLogLevel
  message: string
  epoch?: number
}

interface TrainingMetricEntry {
  epoch: number
  trainLoss: number
  valLoss: number
  trainAccuracy?: number
  valAccuracy?: number
  learningRate: number
  duration: number
}

interface TrainingSessionConfig {
  architecture?: string
  timeframe?: string
  includedPairs?: string[]
  indicators?: string[]
  hyperparameters?: {
    epochs?: number
    learningRate?: number
    earlyStopping?: {
      enabled?: boolean
      patience?: number
    }
  }
}

const TRAINING_TICK_MS = 350
const trainingTimers = new Map<string, NodeJS.Timeout>()

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeTrainingLogLevel(level: unknown): TrainingLogLevel {
  if (level === 'WARN') {
    return 'WARN'
  }

  if (level === 'ERROR') {
    return 'ERROR'
  }

  return 'INFO'
}

function toFixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function getSessionPattern(sessionId: string): string {
  return `"sessionId":"${sessionId}"`
}

function clearTrainingTimer(sessionId: string): void {
  const currentTimer = trainingTimers.get(sessionId)
  if (currentTimer) {
    clearTimeout(currentTimer)
    trainingTimers.delete(sessionId)
  }
}

function emitTrainingStatus(sessionId: string, status: string): void {
  io.to(`training:${sessionId}`).emit('training:status', { sessionId, status })
}

function emitTrainingMetric(sessionId: string, metric: TrainingMetricEntry): void {
  io.to(`training:${sessionId}`).emit('training:metrics', { sessionId, metrics: metric })
}

function emitTrainingLog(sessionId: string, log: TrainingLogEntry): void {
  io.to(`training:${sessionId}`).emit('training:log', { sessionId, log })
}

async function persistTrainingLog(
  userId: string,
  sessionId: string,
  botId: string,
  level: TrainingLogLevel,
  message: string,
  epoch?: number,
): Promise<void> {
  const logPayload = {
    module: 'training',
    event: 'training_session_runtime',
    userId,
    sessionId,
    botId,
    epoch,
  }

  if (level === 'WARN') {
    logger.warn(`[training] ${message}`, logPayload)
  } else if (level === 'ERROR') {
    logger.error(`[training] ${message}`, logPayload)
  } else {
    logger.info(`[training] ${message}`, logPayload)
  }

  emitTrainingLog(sessionId, {
    timestamp: new Date().toISOString(),
    level,
    message,
    epoch,
  })
}

function buildMetric(sessionId: string, epoch: number, totalEpochs: number, learningRate: number): TrainingMetricEntry {
  const seed = sessionId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const progress = epoch / totalEpochs
  const wave = Math.sin((epoch + seed) * 0.55)
  const drift = Math.cos((epoch + seed) * 0.21)

  const trainLoss = toFixedNumber(Math.max(0.0025, 0.12 * Math.exp(-progress * 3.4) + Math.abs(wave) * 0.003), 6)
  const valLoss = toFixedNumber(Math.max(0.0035, trainLoss + 0.002 + Math.abs(drift) * 0.0025), 6)
  const trainAccuracy = toFixedNumber(Math.min(99.4, 53 + (progress * 42) + (wave * 1.5)), 2)
  const valAccuracy = toFixedNumber(Math.max(0, trainAccuracy - 1.8 - Math.abs(drift) * 1.2), 2)

  return {
    epoch,
    trainLoss,
    valLoss,
    trainAccuracy,
    valAccuracy,
    learningRate: toFixedNumber(learningRate, 6),
    duration: epoch * TRAINING_TICK_MS,
  }
}

function getBestMetric(metrics: TrainingMetricEntry[]): TrainingMetricEntry | null {
  if (metrics.length === 0) {
    return null
  }

  return metrics.reduce((best, current) => (current.valLoss < best.valLoss ? current : best), metrics[0])
}

function shouldStopEarly(metrics: TrainingMetricEntry[], patience: number): boolean {
  if (metrics.length <= patience) {
    return false
  }

  const recentMetrics = metrics.slice(-patience)
  const baseline = metrics.slice(0, -patience)
  const bestBeforeWindow = getBestMetric(baseline)
  if (!bestBeforeWindow) {
    return false
  }

  return recentMetrics.every((metric) => metric.valLoss >= bestBeforeWindow.valLoss)
}

async function completeTrainingSession(sessionId: string, userId: string, botId: string, metrics: TrainingMetricEntry[]): Promise<void> {
  const bestMetric = getBestMetric(metrics)

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      endTime: new Date(),
      metrics: JSON.stringify(metrics),
      bestEpoch: bestMetric?.epoch ?? null,
      bestValLoss: bestMetric?.valLoss ?? null,
      updatedAt: new Date(),
    },
  })

  emitTrainingStatus(sessionId, 'completed')
  await persistTrainingLog(userId, sessionId, botId, 'INFO', 'Treinamento concluido com sucesso')
}

async function advanceTrainingSession(sessionId: string): Promise<void> {
  clearTrainingTimer(sessionId)

  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      botId: true,
      status: true,
      config: true,
      metrics: true,
      bestEpoch: true,
      bestValLoss: true,
    },
  })

  if (!session || ['paused', 'cancelled', 'completed', 'failed'].includes(session.status)) {
    return
  }

  const config = safeJsonParse<TrainingSessionConfig>(session.config, {})
  const metrics = safeJsonParse<TrainingMetricEntry[]>(session.metrics, [])
  const totalEpochs = Math.max(1, Math.min(config.hyperparameters?.epochs ?? 20, 120))
  const learningRate = config.hyperparameters?.learningRate ?? 0.001

  if (session.status === 'pending') {
    await prisma.trainingSession.update({
      where: { id: sessionId },
      data: {
        status: 'running',
        updatedAt: new Date(),
      },
    })

    emitTrainingStatus(sessionId, 'running')
    await persistTrainingLog(
      session.userId,
      sessionId,
      session.botId,
      'INFO',
      `Iniciando treinamento ${config.architecture?.toUpperCase?.() ?? 'IA'} para ${config.includedPairs?.join(', ') ?? 'pares selecionados'}`,
    )
  }

  const nextEpoch = metrics.length + 1
  const nextMetric = buildMetric(sessionId, nextEpoch, totalEpochs, learningRate)
  const nextMetrics = [...metrics, nextMetric]
  const bestMetric = getBestMetric(nextMetrics)
  const patience = Math.max(3, config.hyperparameters?.earlyStopping?.patience ?? 10)
  const stopEarly = config.hyperparameters?.earlyStopping?.enabled ? shouldStopEarly(nextMetrics, patience) : false

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      status: 'running',
      metrics: JSON.stringify(nextMetrics),
      bestEpoch: bestMetric?.epoch ?? null,
      bestValLoss: bestMetric?.valLoss ?? null,
      updatedAt: new Date(),
    },
  })

  emitTrainingMetric(sessionId, nextMetric)

  if (nextEpoch === 1 || nextEpoch % 10 === 0 || nextEpoch === totalEpochs) {
    await persistTrainingLog(
      session.userId,
      sessionId,
      session.botId,
      'INFO',
      `Epoca ${nextEpoch} concluida. Train loss ${nextMetric.trainLoss}, val loss ${nextMetric.valLoss}`,
      nextEpoch,
    )
  }

  if (stopEarly) {
    await persistTrainingLog(
      session.userId,
      sessionId,
      session.botId,
      'WARN',
      `Early stopping acionado na epoca ${nextEpoch}`,
      nextEpoch,
    )
    await completeTrainingSession(sessionId, session.userId, session.botId, nextMetrics)
    return
  }

  if (nextEpoch >= totalEpochs) {
    await completeTrainingSession(sessionId, session.userId, session.botId, nextMetrics)
    return
  }

  startTrainingSessionProcessing(sessionId)
}

export function startTrainingSessionProcessing(sessionId: string, delayMs: number = TRAINING_TICK_MS): void {
  clearTrainingTimer(sessionId)

  const timer = setTimeout(() => {
    trainingTimers.delete(sessionId)
    void advanceTrainingSession(sessionId).catch((error) => {
      clearTrainingTimer(sessionId)

      logger.error('[training] Erro no processamento da sessao de treinamento', {
        module: 'training',
        event: 'training_session_runtime_error',
        sessionId,
        error,
      })

      void prisma.trainingSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, botId: true },
      }).then(async (session) => {
        if (!session) {
          return
        }

        await prisma.trainingSession.update({
          where: { id: sessionId },
          data: {
            status: 'failed',
            endTime: new Date(),
            updatedAt: new Date(),
          },
        }).catch(() => undefined)

        emitTrainingStatus(sessionId, 'failed')
        await persistTrainingLog(session.userId, sessionId, session.botId, 'ERROR', 'Treinamento interrompido por erro interno')
      }).catch(() => undefined)
    })
  }, delayMs)

  trainingTimers.set(sessionId, timer)
}

export function pauseTrainingSessionProcessing(sessionId: string): void {
  clearTrainingTimer(sessionId)
}

export function cancelTrainingSessionProcessing(sessionId: string): void {
  clearTrainingTimer(sessionId)
}

export async function getTrainingSessionLogs(userId: string, sessionId: string): Promise<TrainingLogEntry[]> {
  const logs = await prisma.log.findMany({
    where: {
      userId,
      module: 'training',
      details: {
        contains: getSessionPattern(sessionId),
      },
    },
    orderBy: { timestamp: 'asc' },
    take: 250,
  })

  return logs.map((entry) => {
    const details = safeJsonParse<Record<string, unknown>>(entry.details, {})

    return {
      timestamp: entry.timestamp.toISOString(),
      level: normalizeTrainingLogLevel(entry.level),
      message: entry.message,
      epoch: typeof details.epoch === 'number' ? details.epoch : undefined,
    }
  })
}
