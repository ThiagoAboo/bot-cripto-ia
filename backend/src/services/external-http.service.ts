import { logger } from '../utils/logger'

export class ExternalApiError extends Error {
  readonly status?: number
  readonly code?: number | string
  readonly payload?: unknown

  constructor(message: string, options?: { status?: number; code?: number | string; payload?: unknown }) {
    super(message)
    this.name = 'ExternalApiError'
    this.status = options?.status
    this.code = options?.code
    this.payload = options?.payload
  }
}

export interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
  retryOnStatuses?: number[]
  module?: string
  requestName?: string
}

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504]
const fetchFn = (globalThis as any).fetch as ((input: string, init?: any) => Promise<any>) | undefined

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>
    if (typeof candidate.msg === 'string' && candidate.msg.trim()) {
      return candidate.msg
    }
    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return candidate.message
    }
    if (typeof candidate.error === 'string' && candidate.error.trim()) {
      return candidate.error
    }
  }

  return fallback
}

function shouldRetry(error: unknown, retryStatuses: Set<number>): boolean {
  if (error instanceof ExternalApiError) {
    return typeof error.status === 'number' && retryStatuses.has(error.status)
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || /timeout/i.test(error.message)
  }

  return false
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithTimeout(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }, timeoutMs: number): Promise<any> {
  if (!fetchFn) {
    throw new ExternalApiError('Fetch não está disponível no ambiente atual')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchFn(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function requestJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 3
  const retryDelayMs = options.retryDelayMs ?? 1000
  const retryStatuses = new Set(options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES)
  const timeoutMs = options.timeoutMs ?? 30000
  const moduleName = options.module ?? 'external-http'
  const requestName = options.requestName ?? 'requestJson'

  let attempt = 0

  while (true) {
    try {
      const response = await fetchWithTimeout(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
      }, timeoutMs)

      const text = await response.text()
      const payload = text ? safeParseJson(text) : null

      if (!response.ok) {
        throw new ExternalApiError(
          getErrorMessage(payload, `Falha na chamada externa (${response.status})`),
          {
            status: response.status,
            code: payload && typeof payload === 'object' ? (payload as Record<string, unknown>).code as number | string | undefined : undefined,
            payload,
          },
        )
      }

      return payload as T
    } catch (error) {
      const currentAttempt = attempt + 1
      const canRetry = currentAttempt <= retries && shouldRetry(error, retryStatuses)

      logger.warn(`[${moduleName}] Falha em chamada externa`, {
        module: moduleName,
        event: 'external_request_failed',
        requestName,
        url,
        attempt: currentAttempt,
        retries,
        canRetry,
        error,
        skipPersistence: true,
      })

      if (!canRetry) {
        throw error
      }

      const delay = retryDelayMs * Math.pow(2, attempt)
      await sleep(delay)
      attempt += 1
    }
  }
}

export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private readonly moduleName: string,
    private readonly failureThreshold: number = 5,
    private readonly timeoutMs: number = 60000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed >= this.timeoutMs) {
        this.state = 'HALF_OPEN'
      } else {
        throw new ExternalApiError('Integração externa temporariamente indisponível por excesso de falhas')
      }
    }

    try {
      const result = await fn()
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED'
      }
      this.failures = 0
      return result
    } catch (error) {
      this.failures += 1
      this.lastFailureTime = Date.now()

      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN'
      }

      logger.warn(`[${this.moduleName}] Circuit breaker registrou falha`, {
        module: this.moduleName,
        event: 'circuit_breaker_failure',
        failures: this.failures,
        state: this.state,
        error,
        skipPersistence: true,
      })

      throw error
    }
  }
}
