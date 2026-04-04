import winston from 'winston'
import { prisma } from '../config/database'
import { getObservabilityContext } from './observability-context'

const { combine, timestamp, printf } = winston.format

export const SYSTEM_LOG_EMAIL = 'system.logs@bot-cripto-ia.local'
const SYSTEM_LOG_NAME = 'System Logs'
const SYSTEM_LOG_PASSWORD_HASH = '__system_logs_not_for_login__'

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug ?? console.log).bind(console),
}

const sensitiveKeyPattern = /(password|passwordHash|secret|apiKey|token|authorization|cookie|accessToken|refreshToken)/i

const myFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const sanitizedMeta = sanitizeForLogging({ ...meta }) as Record<string, unknown>
  delete sanitizedMeta.skipPersistence
  delete sanitizedMeta.skipConsoleCapture

  return `${ts} [${level}]: ${message} ${Object.keys(sanitizedMeta).length ? safeStringify(sanitizedMeta) : ''}`
})

export type LogMeta = Record<string, unknown> & {
  module?: string
  userId?: string | null
  skipPersistence?: boolean
  skipConsoleCapture?: boolean
}

let consoleCaptureInstalled = false
let systemUserIdPromise: Promise<string> | null = null

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return sanitizeForLogging(error)
}

function sanitizeForLogging(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]'
    }

    seen.add(value as object)

    const output: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveKeyPattern.test(key)) {
        output[key] = '[REDACTED]'
        continue
      }

      output[key] = sanitizeForLogging(entryValue, seen)
    }

    seen.delete(value as object)
    return output
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  return value
}

function normalizeMeta(meta?: unknown): LogMeta {
  if (!meta) {
    return {}
  }

  if (meta instanceof Error) {
    return { error: serializeError(meta) }
  }

  if (typeof meta === 'object' && !Array.isArray(meta)) {
    return sanitizeForLogging(meta) as LogMeta
  }

  return { value: sanitizeForLogging(meta) }
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

async function ensureSystemLogUserId(): Promise<string> {
  if (!systemUserIdPromise) {
    systemUserIdPromise = prisma.user
      .upsert({
        where: { email: SYSTEM_LOG_EMAIL },
        update: {
          name: SYSTEM_LOG_NAME,
          passwordHash: SYSTEM_LOG_PASSWORD_HASH,
          preferences: '{}',
        },
        create: {
          email: SYSTEM_LOG_EMAIL,
          name: SYSTEM_LOG_NAME,
          passwordHash: SYSTEM_LOG_PASSWORD_HASH,
          preferences: '{}',
        },
        select: { id: true },
      })
      .then((user) => user.id)
      .catch((error) => {
        systemUserIdPromise = null
        throw error
      })
  }

  return systemUserIdPromise
}

export async function getSystemLogUserId(): Promise<string> {
  return ensureSystemLogUserId()
}

async function resolveUserId(meta: LogMeta): Promise<string | undefined> {
  if (typeof meta.userId === 'string' && meta.userId.trim()) {
    return meta.userId.trim()
  }

  const context = getObservabilityContext()
  if (context?.userId?.trim()) {
    return context.userId.trim()
  }

  return ensureSystemLogUserId()
}

function writeToTerminal(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta: LogMeta): void {
  const printableMeta = sanitizeForLogging({ ...meta }) as Record<string, unknown>
  delete printableMeta.skipPersistence
  delete printableMeta.skipConsoleCapture

  const line = `${new Date().toISOString()} [${level}]: ${message} ${Object.keys(printableMeta).length ? safeStringify(printableMeta) : ''}`.trimEnd()

  if (level === 'error') {
    originalConsole.error(line)
    return
  }

  if (level === 'warn') {
    originalConsole.warn(line)
    return
  }

  if (level === 'debug') {
    originalConsole.debug(line)
    return
  }

  originalConsole.info(line)
}

async function persistLog(level: string, message: string, meta: LogMeta): Promise<void> {
  if (meta.skipPersistence) {
    return
  }

  const context = getObservabilityContext()
  const userId = await resolveUserId(meta)

  if (!userId) {
    return
  }

  const detailsPayload = sanitizeForLogging({
    ...meta,
    traceId: context?.traceId ?? null,
    parentTraceId: context?.parentTraceId ?? null,
    functionName: context?.functionName ?? null,
    contextUserId: context?.userId ?? null,
  }) as Record<string, unknown>

  delete detailsPayload.skipPersistence
  delete detailsPayload.skipConsoleCapture
  delete detailsPayload.userId
  delete detailsPayload.module

  const details = Object.keys(detailsPayload).length > 0 ? safeStringify(detailsPayload) : null

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
    originalConsole.error('Erro ao persistir log no banco:', serializeError(error))
  }
}

const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), myFormat),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})

function wrapLogMethod(
  methodName: 'info' | 'warn' | 'error' | 'debug',
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
): winston.LeveledLogMethod {
  return ((message: unknown, meta?: unknown) => {
    const normalizedMeta = normalizeMeta(meta)
    const printableMeta = sanitizeForLogging({ ...normalizedMeta }) as LogMeta
    delete printableMeta.skipConsoleCapture

    const messageText = typeof message === 'string' ? message : safeStringify(sanitizeForLogging(message))

    writeToTerminal(methodName, messageText, printableMeta)
    baseLogger.log(methodName, messageText, printableMeta)
    void persistLog(level, messageText, normalizedMeta)

    return baseLogger
  }) as winston.LeveledLogMethod
}

baseLogger.info = wrapLogMethod('info', 'INFO')
baseLogger.warn = wrapLogMethod('warn', 'WARN')
baseLogger.error = wrapLogMethod('error', 'ERROR')
baseLogger.debug = wrapLogMethod('debug', 'DEBUG')

export const logger = baseLogger

function buildConsolePayload(args: unknown[]): { message: string; meta?: LogMeta } {
  if (args.length === 0) {
    return { message: '' }
  }

  const sanitizedArgs = args.map((arg) => sanitizeForLogging(arg))
  const [firstArg, ...restArgs] = sanitizedArgs

  const message = typeof firstArg === 'string' ? firstArg : safeStringify(firstArg)

  if (restArgs.length === 0) {
    return {
      message,
      meta: {
        consoleMethodArgs: [],
      },
    }
  }

  return {
    message,
    meta: {
      consoleMethodArgs: restArgs,
    },
  }
}

export function installConsoleCapture(): void {
  if (consoleCaptureInstalled) {
    return
  }

  consoleCaptureInstalled = true

  console.log = ((...args: unknown[]) => {
    const { message, meta } = buildConsolePayload(args)
    logger.info(message, { ...meta, consoleMethod: 'log' })
  }) as typeof console.log

  console.info = ((...args: unknown[]) => {
    const { message, meta } = buildConsolePayload(args)
    logger.info(message, { ...meta, consoleMethod: 'info' })
  }) as typeof console.info

  console.warn = ((...args: unknown[]) => {
    const { message, meta } = buildConsolePayload(args)
    logger.warn(message, { ...meta, consoleMethod: 'warn' })
  }) as typeof console.warn

  console.error = ((...args: unknown[]) => {
    const { message, meta } = buildConsolePayload(args)
    logger.error(message, { ...meta, consoleMethod: 'error' })
  }) as typeof console.error

  console.debug = ((...args: unknown[]) => {
    const { message, meta } = buildConsolePayload(args)
    logger.debug(message, { ...meta, consoleMethod: 'debug' })
  }) as typeof console.debug
}

installConsoleCapture()

export function logInfo(module: string, message: string, details?: unknown) {
  logger.info(`[${module}] ${message}`, { module, ...normalizeMeta(details) })
}

export function logWarn(module: string, message: string, details?: unknown) {
  logger.warn(`[${module}] ${message}`, { module, ...normalizeMeta(details) })
}

export function logError(module: string, message: string, error?: unknown) {
  logger.error(`[${module}] ${message}`, { module, ...normalizeMeta(error) })
}
