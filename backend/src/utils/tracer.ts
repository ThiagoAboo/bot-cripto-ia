import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'
import { prisma } from '../config/database'

interface TraceContext {
  traceId: string
  parentTraceId?: string
  startTime: number
  userId: string
  module: string
  functionName: string
}

let currentContext: TraceContext | null = null

// Salvar trace no banco de dados
async function saveTrace(
  level: string,
  module: string,
  functionName: string,
  message: string,
  durationMs: number,
  extra?: any
) {
  if (!currentContext) {
    logger.warn('Tentativa de salvar trace sem contexto')
    return
  }

  try {
    const traceData = {
      traceId: currentContext.traceId,
      parentTraceId: currentContext.parentTraceId || null,
      level,
      module,
      functionName,
      message,
      durationMs,
      userId: currentContext.userId,
      botId: extra?.botId || null,
      currentPair: extra?.currentPair || null,
      recommendedAction: extra?.recommendedAction || null,
      confidence: extra?.confidence || null,
      errorFlag: extra?.errorFlag || false
    }

    await prisma.trace.create({ data: traceData })
    logger.debug(`Trace salvo: ${currentContext.traceId} - ${functionName} - ${durationMs}ms`)
  } catch (error) {
    logger.error('Erro ao salvar trace:', error)
  }
}

export function startTrace(userId: string, functionName: string, module: string): string {
  const traceId = uuidv4()
  currentContext = {
    traceId,
    startTime: Date.now(),
    userId,
    module,
    functionName
  }

  // Salvar trace inicial sem aguardar
  saveTrace('TRACE', module, functionName, `Iniciando ${functionName}`, 0).catch(console.error)

  logger.info(`[TRACE] Iniciado: ${traceId} - ${functionName} por usuário ${userId}`)
  return traceId
}

export function trace(
  level: 'TRACE' | 'DEBUG',
  module: string,
  functionName: string,
  message: string,
  durationMs: number,
  extra?: any
) {
  if (!currentContext) {
    logger.warn(`Trace sem contexto: ${message}`)
    return
  }

  // Salvar trace sem aguardar
  saveTrace(level, module, functionName, message, durationMs, extra).catch(console.error)

  // Log no console para debug
  const prefix = level === 'DEBUG' ? '🔍' : '📊'
  logger.debug(`${prefix} [${module}] ${functionName}: ${message} (${durationMs}ms)`)
}

export function endTrace(functionName: string) {
  if (!currentContext) return

  const duration = Date.now() - currentContext.startTime
  trace('TRACE', currentContext.module, functionName, `Finalizando ${functionName}`, duration)
  currentContext = null
}

export function getCurrentTraceId(): string | null {
  return currentContext?.traceId || null
}