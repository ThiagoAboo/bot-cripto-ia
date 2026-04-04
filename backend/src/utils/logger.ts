import winston from 'winston'
import { prisma } from '../config/database'
import { getObservabilityContext } from './observability-context'

const { combine, timestamp, printf, colorize } = winston.format

const myFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const sanitizedMeta = { ...meta }
  delete sanitizedMeta.skipPersistence

  return `${ts} [${level}]: ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ''}`
})

type LogMeta = Record<string, unknown> & {
  module?: string
  userId?: string
  skipPersistence?: boolean
}

function normalizeMeta(meta?: unknown): LogMeta {
  if (!meta) {
    return {}
  }

  if (meta instanceof Error) {
    return {
      error: serializeError(meta),
    }
  }

  if (typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) }
  }

  return { value: meta }
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return error
}

function extractModule(message: string, meta: LogMeta): string {
  if (typeof meta.module === 'string' && meta.module.trim()) {
    return meta.module.trim()
  }

  const context = getObservabilityContext()
  if (context?.module) {
    return context.module
  }

  const moduleMatch = /^\[([^\]]+)\]/.exec(message)
  if (moduleMatch?.[1]) {
    return moduleMatch[1].trim()
  }

  return 'system'
}

function sanitizeMessage(message: string): string {
  return message.replace(/^\[[^\]]+\]\s*/, '').trim()
}

async function persistLog(level: string, message: string, meta: LogMeta): Promise<void> {
  if (meta.skipPersistence) {
    return
  }

  const context = getObservabilityContext()
  const userId = typeof meta.userId === 'string' && meta.userId.trim()
    ? meta.userId.trim()
    : context?.userId ?? undefined

  if (!userId) {
    return
  }

  const detailsPayload: Record<string, unknown> = {
    ...meta,
    traceId: context?.traceId ?? null,
    parentTraceId: context?.parentTraceId ?? null,
    functionName: context?.functionName ?? null,
  }

  delete detailsPayload.skipPersistence
  delete detailsPayload.userId
  delete detailsPayload.module

  const details = Object.keys(detailsPayload).length > 0
    ? JSON.stringify(detailsPayload)
    : null

  try {
    await prisma.log.create({
      data: {
        level,
        module: extractModule(message, meta),
        message: sanitizeMessage(message),
        details,
        userId,
      },
    })
  } catch (error) {
    // Evita recursão no logger em caso de falha ao persistir logs.
    // eslint-disable-next-line no-console
    console.error('Erro ao persistir log no banco:', serializeError(error))
  }
}

const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), myFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp(), myFormat),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})

function wrapLogMethod(
  methodName: 'info' | 'warn' | 'error' | 'debug',
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
): winston.LeveledLogMethod {
  const original = baseLogger[methodName].bind(baseLogger)

  return ((message: unknown, meta?: unknown) => {
    const normalizedMeta = normalizeMeta(meta)
    const printableMeta = { ...normalizedMeta }
    delete printableMeta.skipPersistence

    const messageText = typeof message === 'string'
      ? message
      : JSON.stringify(message)

    original(messageText, printableMeta)
    void persistLog(level, messageText, normalizedMeta)

    return baseLogger
  }) as winston.LeveledLogMethod
}

baseLogger.info = wrapLogMethod('info', 'INFO')
baseLogger.warn = wrapLogMethod('warn', 'WARN')
baseLogger.error = wrapLogMethod('error', 'ERROR')
baseLogger.debug = wrapLogMethod('debug', 'DEBUG')

export const logger = baseLogger

export function logInfo(module: string, message: string, details?: unknown) {
  logger.info(`[${module}] ${message}`, normalizeMeta(details))
}

export function logWarn(module: string, message: string, details?: unknown) {
  logger.warn(`[${module}] ${message}`, normalizeMeta(details))
}

export function logError(module: string, message: string, error?: unknown) {
  logger.error(`[${module}] ${message}`, normalizeMeta(error))
}
