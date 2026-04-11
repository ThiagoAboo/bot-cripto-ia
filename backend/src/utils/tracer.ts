import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../config/database'
import { emitTraceNew } from '../services/socket.service'
import {
  getObservabilityContext,
  setObservabilityContext,
  updateObservabilityContext,
  type ObservabilityContext,
} from './observability-context'
import { logger } from './logger'

export type TraceLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface TraceExtra {
  botId?: string | null
  currentPair?: string | null
  recommendedAction?: string | null
  confidence?: number | null
  errorFlag?: boolean
  userId?: string | null
  [key: string]: unknown
}

const FRONTEND_TRACE_MODULES = new Set([
  'dashboard',
  'configurations',
  'training',
  'transactions',
  'bot',
  'system',
  'api',
  'database',
])

function isTraceEnabled(): boolean {
  return process.env.TRACE_ENABLED !== 'false'
}

async function saveTrace(
  level: TraceLevel,
  module: string,
  functionName: string,
  message: string,
  durationMs: number,
  extra?: TraceExtra,
): Promise<void> {
  if (!isTraceEnabled()) {
    return
  }

  const context = getObservabilityContext()

  if (!context) {
    logger.warn('[tracer] Tentativa de salvar trace sem contexto', {
      module: 'tracer',
      message,
      skipPersistence: true,
    })
    return
  }

  const userId = extra?.userId ?? context.userId ?? undefined

  if (!userId) {
    logger.debug('[tracer] Trace sem userId persistível; mantendo apenas em arquivo/console', {
      module: 'tracer',
      traceId: context.traceId,
      functionName,
      skipPersistence: true,
    })
    return
  }

  try {
    const persistedTrace = await prisma.trace.create({
      data: {
        traceId: context.traceId,
        parentTraceId: context.parentTraceId ?? null,
        level,
        module,
        functionName,
        message,
        durationMs,
        userId,
        botId: extra?.botId ?? null,
        currentPair: extra?.currentPair ?? null,
        recommendedAction: extra?.recommendedAction ?? null,
        confidence: extra?.confidence ?? null,
        errorFlag: extra?.errorFlag ?? level === 'ERROR',
      },
    })

    emitTraceNew(userId, {
      id: persistedTrace.id,
      timestamp: persistedTrace.timestamp.toISOString(),
      level: persistedTrace.level === 'DEBUG' ? 'DEBUG' : 'TRACE',
      module: FRONTEND_TRACE_MODULES.has(persistedTrace.module) ? persistedTrace.module : 'system',
      traceId: persistedTrace.traceId,
      parentTraceId: persistedTrace.parentTraceId ?? undefined,
      functionName: persistedTrace.functionName,
      message: persistedTrace.message,
      durationMs: persistedTrace.durationMs,
      botId: persistedTrace.botId ?? undefined,
      currentPair: persistedTrace.currentPair ?? undefined,
      recommendedAction: persistedTrace.recommendedAction ?? undefined,
      confidence: persistedTrace.confidence ?? undefined,
      errorFlag: persistedTrace.errorFlag,
    })
  } catch (error) {
    logger.error('[tracer] Erro ao salvar trace no banco', {
      module: 'tracer',
      traceId: context.traceId,
      functionName,
      error,
      skipPersistence: true,
    })
  }
}

export function startTrace(
  userId: string | null | undefined,
  functionName: string,
  module: string,
): string {
  const previousContext = getObservabilityContext()

  const context: ObservabilityContext = {
    traceId: uuidv4(),
    parentTraceId: previousContext?.traceId ?? null,
    startTime: Date.now(),
    userId: userId ?? previousContext?.userId ?? null,
    module,
    functionName,
    previousContext,
  }

  setObservabilityContext(context)

  void saveTrace('TRACE', module, functionName, `Iniciando ${functionName}`, 0)

  logger.info(`[${module}] Trace iniciado: ${functionName}`, {
    module,
    traceId: context.traceId,
    parentTraceId: context.parentTraceId ?? null,
    userId: context.userId ?? undefined,
    skipPersistence: true,
  })

  return context.traceId
}

export function setCurrentTraceUserId(userId: string): void {
  updateObservabilityContext({ userId })
}

export function trace(
  level: TraceLevel,
  module: string,
  functionName: string,
  message: string,
  durationMs: number,
  extra?: TraceExtra,
): void {
  const context = getObservabilityContext()

  if (!context) {
    logger.warn(`[${module}] Trace sem contexto: ${message}`, {
      module,
      functionName,
      skipPersistence: true,
    })
    return
  }

  void saveTrace(level, module, functionName, message, durationMs, extra)

  const logMeta = {
    module,
    functionName,
    traceId: context.traceId,
    durationMs,
    ...extra,
    skipPersistence: true,
  }

  if (level === 'ERROR') {
    logger.error(`[${module}] ${functionName}: ${message}`, logMeta)
    return
  }

  if (level === 'WARN') {
    logger.warn(`[${module}] ${functionName}: ${message}`, logMeta)
    return
  }

  if (level === 'INFO') {
    logger.info(`[${module}] ${functionName}: ${message}`, logMeta)
    return
  }

  logger.debug(`[${module}] ${functionName}: ${message}`, logMeta)
}

export function endTrace(functionName: string, extra?: TraceExtra): void {
  const context = getObservabilityContext()

  if (!context) {
    return
  }

  const durationMs = Date.now() - context.startTime
  const finalFunctionName = functionName || context.functionName

  void saveTrace(
    extra?.errorFlag ? 'ERROR' : 'TRACE',
    context.module,
    finalFunctionName,
    `Finalizando ${finalFunctionName}`,
    durationMs,
    extra,
  )

  logger.info(`[${context.module}] Trace finalizado: ${finalFunctionName}`, {
    module: context.module,
    traceId: context.traceId,
    durationMs,
    userId: context.userId ?? undefined,
    errorFlag: extra?.errorFlag ?? false,
    skipPersistence: true,
  })

  setObservabilityContext(context.previousContext ?? null)
}

export function getCurrentTraceId(): string | null {
  return getObservabilityContext()?.traceId ?? null
}
