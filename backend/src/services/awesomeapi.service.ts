import { logger } from '../utils/logger'
import { CircuitBreaker, ExternalApiError, requestJson } from './external-http.service'

interface AwesomeApiRateEntry {
  code: string
  codein: string
  name: string
  high: string
  low: string
  varBid: string
  pctChange: string
  bid: string
  ask: string
  timestamp: string
  create_date: string
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

export interface ExchangeRateResult {
  from: string
  to: string
  rate: number
  pctChange: number
  lastUpdate: string
}

const AWESOMEAPI_BASE_URL = process.env.AWESOMEAPI_BASE_URL || 'https://economia.awesomeapi.com.br'
const AWESOMEAPI_TIMEOUT = Number(process.env.AWESOMEAPI_TIMEOUT ?? 5000)
const CACHE_TTL_RATE = Number(process.env.CACHE_TTL_RATE ?? 60000)
const awesomeCircuitBreaker = new CircuitBreaker('awesomeapi')
const rateCache = new Map<string, CacheEntry<ExchangeRateResult>>()

function getCacheValue<T>(key: string, ttlMs: number): T | null {
  const cached = rateCache.get(key) as CacheEntry<T> | undefined
  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp >= ttlMs) {
    rateCache.delete(key)
    return null
  }

  return cached.value
}

function setCacheValue<T>(key: string, value: T): T {
  rateCache.set(key, {
    value: value as any,
    timestamp: Date.now(),
  })

  return value
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase()
}

async function fetchDirectRate(from: string, to: string): Promise<ExchangeRateResult> {
  const normalizedFrom = normalizeCurrency(from)
  const normalizedTo = normalizeCurrency(to)
  const cacheKey = `${normalizedFrom}-${normalizedTo}`
  const cached = getCacheValue<ExchangeRateResult>(cacheKey, CACHE_TTL_RATE)
  if (cached) {
    return cached
  }

  const pair = `${normalizedFrom}-${normalizedTo}`
  const url = `${AWESOMEAPI_BASE_URL}/json/last/${pair}`

  const data = await awesomeCircuitBreaker.execute(async () => requestJson<Record<string, AwesomeApiRateEntry>>(url, {
    method: 'GET',
    timeoutMs: AWESOMEAPI_TIMEOUT,
    retries: 2,
    retryDelayMs: 500,
    module: 'awesomeapi',
    requestName: pair,
    retryOnStatuses: [408, 425, 429, 500, 502, 503, 504],
  }))

  const entryKey = `${normalizedFrom}${normalizedTo}`
  const entry = data[entryKey]

  if (!entry) {
    throw new ExternalApiError(`Cotação não encontrada para ${pair}`)
  }

  const rate = Number(entry.bid)
  const pctChange = Number(entry.pctChange)
  const lastUpdate = entry.create_date ? new Date(entry.create_date.replace(' ', 'T')).toISOString() : new Date(Number(entry.timestamp) * 1000).toISOString()

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ExternalApiError(`Cotação inválida recebida da AwesomeAPI para ${pair}`)
  }

  return setCacheValue(cacheKey, {
    from: normalizedFrom,
    to: normalizedTo,
    rate,
    pctChange: Number.isFinite(pctChange) ? pctChange : 0,
    lastUpdate,
  })
}

export async function getExchangeRate(from: string, to: string): Promise<ExchangeRateResult> {
  const normalizedFrom = normalizeCurrency(from)
  const normalizedTo = normalizeCurrency(to)

  if (!normalizedFrom || !normalizedTo) {
    throw new ExternalApiError('Parâmetros from e to são obrigatórios')
  }

  if (normalizedFrom === normalizedTo) {
    return {
      from: normalizedFrom,
      to: normalizedTo,
      rate: 1,
      pctChange: 0,
      lastUpdate: new Date().toISOString(),
    }
  }

  try {
    return await fetchDirectRate(normalizedFrom, normalizedTo)
  } catch (directError) {
    logger.debug('[awesomeapi] Falha em cotação direta, tentando inversa', {
      module: 'awesomeapi',
      event: 'exchange_rate_inverse_fallback',
      from: normalizedFrom,
      to: normalizedTo,
      error: directError,
      skipPersistence: true,
    })
  }

  try {
    const inverse = await fetchDirectRate(normalizedTo, normalizedFrom)
    return {
      from: normalizedFrom,
      to: normalizedTo,
      rate: 1 / inverse.rate,
      pctChange: inverse.pctChange,
      lastUpdate: inverse.lastUpdate,
    }
  } catch (inverseError) {
    logger.debug('[awesomeapi] Falha em cotação inversa, tentando BRL como pivô', {
      module: 'awesomeapi',
      event: 'exchange_rate_brl_fallback',
      from: normalizedFrom,
      to: normalizedTo,
      error: inverseError,
      skipPersistence: true,
    })
  }

  const fromToBrl = normalizedFrom === 'BRL'
    ? {
        from: 'BRL',
        to: 'BRL',
        rate: 1,
        pctChange: 0,
        lastUpdate: new Date().toISOString(),
      }
    : await fetchDirectRate(normalizedFrom, 'BRL')

  const toToBrl = normalizedTo === 'BRL'
    ? {
        from: 'BRL',
        to: 'BRL',
        rate: 1,
        pctChange: 0,
        lastUpdate: new Date().toISOString(),
      }
    : await fetchDirectRate(normalizedTo, 'BRL')

  const derivedRate = fromToBrl.rate / toToBrl.rate
  if (!Number.isFinite(derivedRate) || derivedRate <= 0) {
    throw new ExternalApiError(`Não foi possível derivar a cotação ${normalizedFrom}/${normalizedTo}`)
  }

  return {
    from: normalizedFrom,
    to: normalizedTo,
    rate: derivedRate,
    pctChange: fromToBrl.pctChange,
    lastUpdate: fromToBrl.lastUpdate > toToBrl.lastUpdate ? fromToBrl.lastUpdate : toToBrl.lastUpdate,
  }
}

export async function getRateToBrl(currency: string): Promise<number> {
  const normalizedCurrency = normalizeCurrency(currency)

  if (normalizedCurrency === 'BRL') {
    return 1
  }

  const result = await getExchangeRate(normalizedCurrency, 'BRL')
  return result.rate
}
