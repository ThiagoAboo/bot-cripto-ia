import winston from 'winston'
import { prisma } from '../config/database'
import { getObservabilityContext } from './observability-context'

const { combine, timestamp, printf, colorize } = winston.format

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug ?? console.log).bind(console),
}

const REDACTED = '[REDACTED]'
const SYSTEM_USER_EMAIL = 'system@bot-cripto-ia.local'
const SYSTEM_USER_NAME = 'Sistema Interno'
const SYSTEM_USER_PASSWORD_HASH = '__SYSTEM_INTERNAL_ACCOUNT__'
const SENSITIVE_KEYS = new Set([
  'apikey',
  'secretkey',
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'refresh_token',
])

let consolePatched = false
let systemUserIdPromise: Promise<string | null> | null = null

const myFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const sanitizedMeta = { ...meta }
  delete sanitizedMeta.skipPersistence
  return `${ts} [${level}]: ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ''}`
})

export type LogMeta = Record<string, unknown> & {
  module?: string
  userId?: string
  skipPersistence?: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function stringifyForMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  try {
    return JSON.stringify(sanitizeForLogging(value))
  } catch {
    return String(value)
  }
}

function sanitizeForLogging(value: unknown, visited = new WeakSet<object>(), currentKey?: string): unknown {
  if (currentKey && SENSITIVE_KEYS.has(currentKey.toLowerCase())) {
    return REDACTED
  }

  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    const base: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }

    for (const [key, customValue] of Object.entries(value)) {
      base[key] = sanitizeForLogging(customValue, visited, key)
    }

    return base
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return {
      type: 'Buffer',
      length: value.length,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, visited))
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (typeof value !== 'object') {
    return value
  }

  if (visited.has(value as object)) {
    return '[Circular]'
  }

  visited.add(value as object)

  if (!isPlainObject(value)) {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => [
    key,
    sanitizeForLogging(entryValue, visited, key),
  ])

  return Object.fromEntries(sanitizedEntries)
}

function normalizeMeta(meta?: unknown): LogMeta {
  if (meta === undefined) {
    return {}
  }

  if (meta instanceof Error) {
    return { error: sanitizeForLogging(meta) }
  }

  if (Array.isArray(meta)) {
    return { args: sanitizeForLogging(meta) }
  }

  if (isPlainObject(meta)) {
    return sanitizeForLogging(meta) as LogMeta
  }

  return { value: sanitizeForLogging(meta) }
}

function safeJsonStringify(value: unknown): string | null {
  if (value === undefined) {
    return null
  }

  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ serializationError: true, preview: stringifyForMessage(value) })
  }
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

  if (meta.source === 'console') {
    return 'console'
  }

  return 'system'
}

function sanitizeMessage(message: string): string {
  return message.replace(/^\[[^\]]+\]\s*/, '').trim()
}

async function ensureSystemUserId(): Promise<string | null> {
  if (!systemUserIdPromise) {
    systemUserIdPromise = (async () => {
      try {
        const existing = await prisma.user.findUnique({
          where: { email: SYSTEM_USER_EMAIL },
          select: { id: true },
        })

        if (existing?.id) {
          return existing.id
        }

        const created = await prisma.user.create({
          data: {
            email: SYSTEM_USER_EMAIL,
            name: SYSTEM_USER_NAME,
            passwordHash: SYSTEM_USER_PASSWORD_HASH,
            preferences: JSON.stringify({ internal: true, theme: 'dark', notificationsEnabled: false }),
          },
          select: { id: true },
        })

        return created.id
      } catch (error) {
        try {
          const fallback = await prisma.user.findUnique({
            where: { email: SYSTEM_USER_EMAIL },
            select: { id: true },
          })

          return fallback?.id ?? null
        } catch {
          originalConsole.error('Erro ao resolver usuário técnico de logs:', sanitizeForLogging(error))
          return null
        }
      }
    })()
  }

  return systemUserIdPromise
}

async function resolvePersistedUserId(meta: LogMeta): Promise<string | null> {
  if (typeof meta.userId === 'string' && meta.userId.trim()) {
    return meta.userId.trim()
  }

  const context = getObservabilityContext()
  if (context?.userId) {
    return context.userId
  }

  return ensureSystemUserId()
}

async function persistLog(level: string, message: string, meta: LogMeta): Promise<void> {
  if (meta.skipPersistence) {
    return
  }

  const userId = await resolvePersistedUserId(meta)
  if (!userId) {
    return
  }

  const context = getObservabilityContext()
  const detailsPayload: Record<string, unknown> = {
    ...meta,
    traceId: context?.traceId ?? null,
    parentTraceId: context?.parentTraceId ?? null,
    functionName: context?.functionName ?? null,
  }

  delete detailsPayload.skipPersistence
  delete detailsPayload.userId
  delete detailsPayload.module

  const details = safeJsonStringify(detailsPayload)

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
    originalConsole.error('Erro ao persistir log no banco:', sanitizeForLogging(error))
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

    const messageText = typeof message === 'string' ? message : stringifyForMessage(message)

    original(messageText, printableMeta)
    void persistLog(level, messageText, normalizedMeta)
    return baseLogger
  }) as winston.LeveledLogMethod
}

baseLogger.info = wrapLogMethod('info', 'INFO')
baseLogger.warn = wrapLogMethod('warn', 'WARN')
baseLogger.error = wrapLogMethod('error', 'ERROR')
baseLogger.debug = wrapLogMethod('debug', 'DEBUG')

function normalizeConsoleCall(args: unknown[], consoleMethod: string): { message: string; meta: LogMeta } {
  if (args.length === 0) {
    return {
      message: '',
      meta: { module: 'console', source: 'console', consoleMethod },
    }
  }

  if (typeof args[0] === 'string') {
    const [message, ...rest] = args

    if (rest.length === 0) {
      return {
        message,
        meta: { module: 'console', source: 'console', consoleMethod },
      }
    }

    if (rest.length === 1 && isPlainObject(rest[0])) {
      return {
        message,
        meta: {
          module: 'console',
          source: 'console',
          consoleMethod,
          ...normalizeMeta(rest[0]),
        },
      }
    }

    return {
      message,
      meta: {
        module: 'console',
        source: 'console',
        consoleMethod,
        args: sanitizeForLogging(rest),
      },
    }
  }

  return {
    message: args.map((arg) => stringifyForMessage(arg)).join(' '),
    meta: {
      module: 'console',
      source: 'console',
      consoleMethod,
      args: sanitizeForLogging(args),
    },
  }
}

export function installConsolePersistence(): void {
  if (consolePatched) {
    return
  }

  consolePatched = true

  console.log = (...args: unknown[]) => {
    const { message, meta } = normalizeConsoleCall(args, 'log')
    baseLogger.info(message, meta)
  }

  console.info = (...args: unknown[]) => {
    const { message, meta } = normalizeConsoleCall(args, 'info')
    baseLogger.info(message, meta)
  }

  console.warn = (...args: unknown[]) => {
    const { message, meta } = normalizeConsoleCall(args, 'warn')
    baseLogger.warn(message, meta)
  }

  console.error = (...args: unknown[]) => {
    const { message, meta } = normalizeConsoleCall(args, 'error')
    baseLogger.error(message, meta)
  }

  console.debug = (...args: unknown[]) => {
    const { message, meta } = normalizeConsoleCall(args, 'debug')
    baseLogger.debug(message, meta)
  }
}

installConsolePersistence()

export const logger = baseLogger

export async function getSystemLogUserId(): Promise<string | null> {
  return ensureSystemUserId()
}

export function logInfo(module: string, message: string, details?: unknown): void {
  logger.info(`[${module}] ${message}`, { module, ...normalizeMeta(details) })
}

export function logWarn(module: string, message: string, details?: unknown): void {
  logger.warn(`[${module}] ${message}`, { module, ...normalizeMeta(details) })
}

export function logError(module: string, message: string, error?: unknown): void {
  logger.error(`[${module}] ${message}`, { module, ...normalizeMeta(error) })
}
