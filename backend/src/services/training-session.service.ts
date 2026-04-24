import { prisma } from '../config/database'
import { emitTrainingLog, emitTrainingMetric, emitTrainingStatus } from './socket.service'
import {
  startPythonTrainingSessionStream,
  type PythonTrainingResult,
  type PythonTrainingRuntimeState,
} from './python-ml-engine.service'
import { collectTrainingData } from './training-data.service'
import {
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

interface ActiveTrainingSession {
  child: ReturnType<typeof startPythonTrainingSessionStream>['child']
  userId: string
  botId: string
  config: TrainingSessionConfig
  metrics: TrainingMetricEntry[]
  runtimeState?: PythonTrainingRuntimeState
  requestedStop?: 'paused' | 'cancelled'
  latestResult?: PythonTrainingResult
}

const TRAINING_START_DELAY_MS = 350
const scheduledSessions = new Map<string, number>()
const recoveredSessions = new Set<string>()
const activeSessions = new Map<string, ActiveTrainingSession>()
const bootstrappingSessions = new Set<string>()

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
  bootstrappingSessions.delete(sessionId)
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

async function persistTrainingCheckpoint(input: {
  sessionId: string
  userId: string
  botId: string
  status: string
  reason: 'periodic' | 'paused' | 'cancelled' | 'completed' | 'failed' | 'recovered'
  config: TrainingSessionConfig
  metrics: TrainingMetricEntry[]
  bestEpoch?: number | null
  bestValLoss?: number | null
  runtimeState?: PythonTrainingRuntimeState
  result?: PythonTrainingResult
}): Promise<void> {
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
    runtimeState: input.runtimeState,
    evaluation: input.result?.evaluation,
    enginePackage: input.result?.enginePackage,
  })
}

async function updateSessionMetrics(
  sessionId: string,
  metric: TrainingMetricEntry,
  activeSession: ActiveTrainingSession,
): Promise<void> {
  activeSession.metrics = [...activeSession.metrics, metric]
  const bestMetric = getBestMetric(activeSession.metrics)

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      status: 'running',
      metrics: JSON.stringify(activeSession.metrics),
      bestEpoch: bestMetric?.epoch ?? null,
      bestValLoss: bestMetric?.valLoss ?? null,
      updatedAt: new Date(),
    },
  })

  emitTrainingMetric(activeSession.userId, sessionId, metric)
}

async function completeTrainingSession(
  sessionId: string,
  activeSession: ActiveTrainingSession,
  result: PythonTrainingResult,
): Promise<void> {
  activeSession.latestResult = result
  const metrics = result.metrics as TrainingMetricEntry[]
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

  emitTrainingStatus(activeSession.userId, sessionId, 'completed')
  await persistTrainingCheckpoint({
    sessionId,
    userId: activeSession.userId,
    botId: activeSession.botId,
    status: 'completed',
    reason: 'completed',
    config: activeSession.config,
    metrics,
    bestEpoch: bestMetric?.epoch ?? null,
    bestValLoss: bestMetric?.valLoss ?? null,
    runtimeState: activeSession.runtimeState,
    result,
  })
  await persistTrainingLog(activeSession.userId, sessionId, activeSession.botId, 'INFO', 'Treinamento concluido com sucesso')
}

async function failTrainingSession(sessionId: string, errorMessage: string): Promise<void> {
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
    metrics: safeJsonParse<TrainingMetricEntry[]>(session.metrics, []),
    bestEpoch: session.bestEpoch ?? null,
    bestValLoss: session.bestValLoss ?? null,
  })
  await persistTrainingLog(session.userId, sessionId, session.botId, 'ERROR', errorMessage)
}

async function bootstrapTrainingSession(sessionId: string): Promise<void> {
  if (activeSessions.has(sessionId) || bootstrappingSessions.has(sessionId)) {
    return
  }

  bootstrappingSessions.add(sessionId)
  clearScheduledSession(sessionId)

  try {
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        botId: true,
        status: true,
        config: true,
        metrics: true,
      },
    })

    if (!session || !['pending', 'running'].includes(session.status)) {
      return
    }

    const config = safeJsonParse<TrainingSessionConfig>(session.config, {})
    const checkpoint = await readTrainingCheckpoint(sessionId)
    const metrics = checkpoint?.metrics
      ? (checkpoint.metrics as TrainingMetricEntry[])
      : safeJsonParse<TrainingMetricEntry[]>(session.metrics, [])

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
    } else if (!recoveredSessions.has(sessionId) && (metrics.length > 0 || checkpoint?.runtimeState)) {
      const recoveredEpoch = checkpoint?.summary?.lastEpoch ?? metrics.length
      await persistTrainingLog(
        session.userId,
        sessionId,
        session.botId,
        'INFO',
        `Sessão recuperada pelo worker a partir da epoca ${recoveredEpoch}`,
        recoveredEpoch > 0 ? recoveredEpoch : undefined,
      )
      await persistTrainingCheckpoint({
        sessionId,
        userId: session.userId,
        botId: session.botId,
        status: session.status,
        reason: 'recovered',
        config,
        metrics,
        bestEpoch: checkpoint?.summary?.bestEpoch ?? null,
        bestValLoss: checkpoint?.summary?.bestValLoss ?? null,
        runtimeState: checkpoint?.runtimeState,
      })
    }

    const datasets = await collectTrainingData({
      dataSource: config.dataSource ?? 'exchange',
      includedPairs: config.includedPairs ?? [],
      timeframe: config.timeframe ?? '1h',
      trainingPeriod: {
        startDate: config.trainingPeriod?.startDate ?? new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
        endDate: config.trainingPeriod?.endDate ?? new Date().toISOString().slice(0, 10),
      },
      uploadedFileUrl: config.uploadedFileUrl,
    })

    const stream = startPythonTrainingSessionStream(
      {
        config,
        datasets,
        runtimeState: checkpoint?.runtimeState,
      },
      {
        onLog: (entry) => {
          void persistTrainingLog(session.userId, sessionId, session.botId, entry.level, entry.message, entry.epoch)
        },
        onMetric: (metric) => {
          const active = activeSessions.get(sessionId)
          if (!active) {
            return
          }

          void updateSessionMetrics(sessionId, metric as TrainingMetricEntry, active)
        },
        onCheckpoint: (entry) => {
          const active = activeSessions.get(sessionId)
          if (!active) {
            return
          }

          active.runtimeState = entry.runtimeState
          void persistTrainingCheckpoint({
            sessionId,
            userId: active.userId,
            botId: active.botId,
            status: active.requestedStop ?? 'running',
            reason: 'periodic',
            config: active.config,
            metrics: active.metrics,
            bestEpoch: entry.bestEpoch ?? null,
            bestValLoss: entry.bestValLoss ?? null,
            runtimeState: entry.runtimeState,
          })
        },
        onResult: (result) => {
          const active = activeSessions.get(sessionId)
          if (!active) {
            return
          }

          void completeTrainingSession(sessionId, active, result)
        },
      },
    )

    activeSessions.set(sessionId, {
      child: stream.child,
      userId: session.userId,
      botId: session.botId,
      config,
      metrics,
      runtimeState: checkpoint?.runtimeState,
    })
    recoveredSessions.add(sessionId)

    void stream.completed
      .catch(async (error) => {
        const active = activeSessions.get(sessionId)
        if (!active) {
          return
        }

        if (active.requestedStop === 'paused' || active.requestedStop === 'cancelled') {
          await persistTrainingCheckpoint({
            sessionId,
            userId: active.userId,
            botId: active.botId,
            status: active.requestedStop,
            reason: active.requestedStop,
            config: active.config,
            metrics: active.metrics,
            bestEpoch: getBestMetric(active.metrics)?.epoch ?? null,
            bestValLoss: getBestMetric(active.metrics)?.valLoss ?? null,
            runtimeState: active.runtimeState,
            result: active.latestResult,
          }).catch(() => undefined)
          return
        }

        logger.error('[training] Erro no processamento da sessao de treinamento', {
          module: 'training',
          event: 'training_session_runtime_error',
          sessionId,
          error,
        })
        await failTrainingSession(sessionId, 'Treinamento interrompido por erro interno').catch(() => undefined)
      })
      .finally(() => {
        activeSessions.delete(sessionId)
        bootstrappingSessions.delete(sessionId)
      })
  } catch (error) {
    bootstrappingSessions.delete(sessionId)
    logger.error('[training] Falha ao inicializar a sessão de treinamento', {
      module: 'training',
      event: 'training_session_bootstrap_error',
      sessionId,
      error,
    })
    await failTrainingSession(sessionId, 'Treinamento interrompido por erro interno').catch(() => undefined)
  }
}

async function recoverTrainingSessionsFromDatabase(): Promise<void> {
  const activeSessionsFromDatabase = await prisma.trainingSession.findMany({
    where: {
      status: {
        in: ['pending', 'running'],
      },
    },
    select: {
      id: true,
    },
  })

  for (const session of activeSessionsFromDatabase) {
    if (scheduledSessions.has(session.id) || activeSessions.has(session.id) || bootstrappingSessions.has(session.id)) {
      continue
    }

    scheduledSessions.set(session.id, Date.now())
  }
}

export function startTrainingSessionProcessing(sessionId: string, delayMs: number = TRAINING_START_DELAY_MS): void {
  scheduledSessions.set(sessionId, Date.now() + delayMs)
}

export async function processTrainingQueueCycle(): Promise<void> {
  await recoverTrainingSessionsFromDatabase()

  const dueSessions = Array.from(scheduledSessions.entries())
    .filter(([, nextRunAt]) => nextRunAt <= Date.now())
    .sort((left, right) => left[1] - right[1])
    .map(([sessionId]) => sessionId)

  for (const sessionId of dueSessions) {
    await bootstrapTrainingSession(sessionId)
  }
}

export function pauseTrainingSessionProcessing(sessionId: string): void {
  clearScheduledSession(sessionId)
  const active = activeSessions.get(sessionId)
  if (!active) {
    return
  }

  active.requestedStop = 'paused'
  active.child.kill()
}

export function cancelTrainingSessionProcessing(sessionId: string): void {
  clearScheduledSession(sessionId)
  const active = activeSessions.get(sessionId)
  if (!active) {
    return
  }

  active.requestedStop = 'cancelled'
  active.child.kill()
}

export function stopTrainingSessionProcessing(): void {
  scheduledSessions.clear()
  recoveredSessions.clear()
  bootstrappingSessions.clear()

  for (const active of activeSessions.values()) {
    active.requestedStop = 'cancelled'
    active.child.kill()
  }
  activeSessions.clear()
}

export async function captureTrainingSessionCheckpoint(
  sessionId: string,
  reason: 'paused' | 'cancelled',
): Promise<void> {
  const active = activeSessions.get(sessionId)
  if (active) {
    await persistTrainingCheckpoint({
      sessionId,
      userId: active.userId,
      botId: active.botId,
      status: reason,
      reason,
      config: active.config,
      metrics: active.metrics,
      bestEpoch: getBestMetric(active.metrics)?.epoch ?? null,
      bestValLoss: getBestMetric(active.metrics)?.valLoss ?? null,
      runtimeState: active.runtimeState,
      result: active.latestResult,
    })
    return
  }

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

  const checkpoint = await readTrainingCheckpoint(sessionId)
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
    runtimeState: checkpoint?.runtimeState,
    result: checkpoint?.enginePackage && checkpoint?.evaluation ? {
      metrics: safeJsonParse<TrainingMetricEntry[]>(session.metrics, []),
      evaluation: checkpoint.evaluation,
      enginePackage: checkpoint.enginePackage,
    } : undefined,
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
