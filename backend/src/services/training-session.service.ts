import { prisma } from '../config/database'
import { emitTrainingLog, emitTrainingMetric, emitTrainingStatus } from './socket.service'
import {
  buildTrainingMetric,
  getBestMetric,
  type TrainingMetricEntry,
  type TrainingSessionConfig,
} from './training-evaluation.service'
import { readTrainingCheckpoint, saveTrainingCheckpoint } from './training-checkpoint.service'
import { logger } from '../utils/logger'

type TrainingLogLevel = 'INFO' | 'WARN' | 'ERROR'

interface TrainingLogEntry {
  timestamp: string
  level: TrainingLogLevel
  message: string
  epoch?: number
}

const TRAINING_TICK_MS = 350
const scheduledSessions = new Map<string, number>()
const processingSessions = new Set<string>()
const recoveredSessions = new Set<string>()

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

function getSessionPattern(sessionId: string): string {
  return `"sessionId":"${sessionId}"`
}

function clearScheduledSession(sessionId: string): void {
  scheduledSessions.delete(sessionId)
  processingSessions.delete(sessionId)
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

  emitTrainingLog(userId, sessionId, {
    timestamp: new Date().toISOString(),
    level,
    message,
    epoch,
  })
}

async function persistTrainingCheckpoint(
  input: {
    sessionId: string
    userId: string
    botId: string
    status: string
    reason: 'periodic' | 'paused' | 'cancelled' | 'completed' | 'failed' | 'recovered'
    config: TrainingSessionConfig
    metrics: TrainingMetricEntry[]
    bestEpoch?: number | null
    bestValLoss?: number | null
  },
): Promise<void> {
  await saveTrainingCheckpoint({
    sessionId: input.sessionId,
    userId: input.userId,
    botId: input.botId,
    status: input.status,
    reason: input.reason,
    config: input.config as Record<string, unknown>,
    metrics: input.metrics,
    bestEpoch: input.bestEpoch,
    bestValLoss: input.bestValLoss,
  })
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

async function completeTrainingSession(
  sessionId: string,
  userId: string,
  botId: string,
  config: TrainingSessionConfig,
  metrics: TrainingMetricEntry[],
): Promise<void> {
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

  emitTrainingStatus(userId, sessionId, 'completed')
  await persistTrainingCheckpoint({
    sessionId,
    userId,
    botId,
    status: 'completed',
    reason: 'completed',
    config,
    metrics,
    bestEpoch: bestMetric?.epoch ?? null,
    bestValLoss: bestMetric?.valLoss ?? null,
  })
  await persistTrainingLog(userId, sessionId, botId, 'INFO', 'Treinamento concluido com sucesso')
}

async function advanceTrainingSession(sessionId: string): Promise<void> {
  clearScheduledSession(sessionId)

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

  if (session.status === 'pending') {
    await prisma.trainingSession.update({
      where: { id: sessionId },
      data: {
        status: 'running',
        updatedAt: new Date(),
      },
    })

    emitTrainingStatus(session.userId, sessionId, 'running')
    await persistTrainingLog(
      session.userId,
      sessionId,
      session.botId,
      'INFO',
      `Iniciando treinamento ${config.architecture?.toUpperCase?.() ?? 'IA'} para ${config.includedPairs?.join(', ') ?? 'pares selecionados'}`,
    )
  }

  const nextEpoch = metrics.length + 1
  const nextMetric = buildTrainingMetric(sessionId, nextEpoch, totalEpochs, config, nextEpoch * TRAINING_TICK_MS)
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

  emitTrainingMetric(session.userId, sessionId, nextMetric)

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

  if (nextEpoch % 10 === 0) {
    await persistTrainingCheckpoint({
      sessionId,
      userId: session.userId,
      botId: session.botId,
      status: 'running',
      reason: 'periodic',
      config,
      metrics: nextMetrics,
      bestEpoch: bestMetric?.epoch ?? null,
      bestValLoss: bestMetric?.valLoss ?? null,
    })
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
    await completeTrainingSession(sessionId, session.userId, session.botId, config, nextMetrics)
    return
  }

  if (nextEpoch >= totalEpochs) {
    await completeTrainingSession(sessionId, session.userId, session.botId, config, nextMetrics)
    return
  }

  startTrainingSessionProcessing(sessionId)
}

async function recoverTrainingSessionsFromDatabase(): Promise<void> {
  const activeSessions = await prisma.trainingSession.findMany({
    where: {
      status: {
        in: ['pending', 'running'],
      },
    },
    select: {
      id: true,
      userId: true,
      botId: true,
      metrics: true,
      config: true,
      status: true,
    },
  })

  for (const session of activeSessions) {
    if (scheduledSessions.has(session.id) || processingSessions.has(session.id)) {
      continue
    }

    scheduledSessions.set(session.id, Date.now())

    if (recoveredSessions.has(session.id)) {
      continue
    }

    const metrics = safeJsonParse<TrainingMetricEntry[]>(session.metrics, [])
    const checkpoint = await readTrainingCheckpoint(session.id)

    if (session.status === 'running' && (metrics.length > 0 || checkpoint)) {
      const checkpointEpoch = checkpoint?.summary?.lastEpoch ?? metrics.length
      await persistTrainingLog(
        session.userId,
        session.id,
        session.botId,
        'INFO',
        `Sessão recuperada pelo worker a partir da epoca ${checkpointEpoch}`,
        checkpointEpoch > 0 ? checkpointEpoch : undefined,
      )
      await persistTrainingCheckpoint({
        sessionId: session.id,
        userId: session.userId,
        botId: session.botId,
        status: session.status,
        reason: 'recovered',
        config: safeJsonParse<TrainingSessionConfig>(session.config, {}),
        metrics,
        bestEpoch: getBestMetric(metrics)?.epoch ?? null,
        bestValLoss: getBestMetric(metrics)?.valLoss ?? null,
      })
    }

    recoveredSessions.add(session.id)
  }
}

export function startTrainingSessionProcessing(sessionId: string, delayMs: number = TRAINING_TICK_MS): void {
  scheduledSessions.set(sessionId, Date.now() + delayMs)
}

async function failTrainingSession(sessionId: string): Promise<void> {
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      botId: true,
      config: true,
      metrics: true,
    },
  })

  if (!session) {
    return
  }

  const metrics = safeJsonParse<TrainingMetricEntry[]>(session.metrics, [])
  const bestMetric = getBestMetric(metrics)

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      status: 'failed',
      endTime: new Date(),
      updatedAt: new Date(),
    },
  }).catch(() => undefined)

  emitTrainingStatus(session.userId, sessionId, 'failed')
  await persistTrainingCheckpoint({
    sessionId,
    userId: session.userId,
    botId: session.botId,
    status: 'failed',
    reason: 'failed',
    config: safeJsonParse<TrainingSessionConfig>(session.config, {}),
    metrics,
    bestEpoch: bestMetric?.epoch ?? null,
    bestValLoss: bestMetric?.valLoss ?? null,
  })
  await persistTrainingLog(session.userId, sessionId, session.botId, 'ERROR', 'Treinamento interrompido por erro interno')
}

export async function processTrainingQueueCycle(): Promise<void> {
  await recoverTrainingSessionsFromDatabase()

  const dueSessions = Array.from(scheduledSessions.entries())
    .filter(([, nextRunAt]) => nextRunAt <= Date.now())
    .sort((left, right) => left[1] - right[1])
    .map(([sessionId]) => sessionId)

  for (const sessionId of dueSessions) {
    if (processingSessions.has(sessionId)) {
      continue
    }

    processingSessions.add(sessionId)
    scheduledSessions.delete(sessionId)

    try {
      await advanceTrainingSession(sessionId)
    } catch (error) {
      logger.error('[training] Erro no processamento da sessao de treinamento', {
        module: 'training',
        event: 'training_session_runtime_error',
        sessionId,
        error,
      })

      await failTrainingSession(sessionId).catch(() => undefined)
    } finally {
      processingSessions.delete(sessionId)
    }
  }
}

export function pauseTrainingSessionProcessing(sessionId: string): void {
  clearScheduledSession(sessionId)
}

export function cancelTrainingSessionProcessing(sessionId: string): void {
  clearScheduledSession(sessionId)
}

export function stopTrainingSessionProcessing(): void {
  scheduledSessions.clear()
  processingSessions.clear()
  recoveredSessions.clear()
}

export async function captureTrainingSessionCheckpoint(
  sessionId: string,
  reason: 'paused' | 'cancelled',
): Promise<void> {
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

  if (!session) {
    return
  }

  await persistTrainingCheckpoint({
    sessionId: session.id,
    userId: session.userId,
    botId: session.botId,
    status: session.status,
    reason,
    config: safeJsonParse<TrainingSessionConfig>(session.config, {}),
    metrics: safeJsonParse<TrainingMetricEntry[]>(session.metrics, []),
    bestEpoch: session.bestEpoch ?? null,
    bestValLoss: session.bestValLoss ?? null,
  })
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
