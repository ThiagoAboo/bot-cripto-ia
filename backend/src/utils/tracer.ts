import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'

interface TraceContext {
  traceId: string
  parentTraceId?: string
  startTime: number
  userId: string
}

let currentContext: TraceContext | null = null

export function startTrace(userId: string, functionName: string, module: string): string {
  const traceId = uuidv4()
  currentContext = {
    traceId,
    startTime: Date.now(),
    userId
  }
  
  trace('TRACE', module, functionName, `Iniciando ${functionName}`, 0)
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
  if (!currentContext) return
  
  const traceData = {
    traceId: currentContext.traceId,
    functionName,
    message,
    durationMs,
    module,
    level,
    userId: currentContext.userId,
    ...extra
  }
  
  if (level === 'DEBUG') {
    logger.debug(`[TRACE] ${JSON.stringify(traceData)}`)
  } else {
    logger.verbose(`[TRACE] ${JSON.stringify(traceData)}`)
  }
}

export function endTrace(functionName: string) {
  if (!currentContext) return
  
  const duration = Date.now() - currentContext.startTime
  trace('TRACE', 'system', functionName, `Finalizando ${functionName}`, duration)
  currentContext = null
}

export function getCurrentTraceId(): string | null {
  return currentContext?.traceId || null
}