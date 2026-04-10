import crypto from 'crypto'

import { logger } from '../utils/logger'
import { CircuitBreaker, ExternalApiError, requestJson, sleep } from './external-http.service'

interface BinanceCredentials {
  apiKey: string
  secretKey: string
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

interface BinanceTickerPriceResponse {
  symbol: string
  price: string
}

interface BinanceServerTimeResponse {
  serverTime: number
}

interface BinanceExchangeInfoSymbol {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  isSpotTradingAllowed?: boolean
  permissions?: string[]
}

interface BinanceExchangeInfoResponse {
  timezone: string
  serverTime: number
  symbols: BinanceExchangeInfoSymbol[]
}

interface BinanceKline extends Array<string | number> {
  0: number
  1: string
  2: string
  3: string
  4: string
  5: string
  6: number
}

interface BinanceBalanceEntry {
  asset: string
  free: string
  locked: string
}

interface BinanceAccountResponse {
  makerCommission: number
  takerCommission: number
  buyerCommission: number
  sellerCommission: number
  canTrade: boolean
  canWithdraw: boolean
  canDeposit: boolean
  accountType: string
  balances: BinanceBalanceEntry[]
}

interface BinanceOrderResponse {
  symbol: string
  orderId: number
  clientOrderId: string
  transactTime?: number
  price: string
  origQty: string
  executedQty: string
  cummulativeQuoteQty: string
  status: string
  timeInForce?: string
  type: string
  side: string
}

interface CreateOrderParams {
  pair: string
  side: 'BUY' | 'SELL'
  quantity: number
  price?: number
  recvWindow?: number
}

interface CancelOrderParams {
  pair: string
  orderId: string | number
  recvWindow?: number
}

interface HistoricalCandlesParams {
  pair: string
  interval: string
  startTime: number
  endTime: number
}

const QUOTE_ASSET_PRIORITY = ['USDT', 'FDUSD', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'BRL', 'TRY']
const DEFAULT_BINANCE_TIMEOUT = Number(process.env.BINANCE_TIMEOUT ?? 30000)
const DEFAULT_RECV_WINDOW = Number(process.env.BINANCE_RECV_WINDOW ?? 5000)
const CACHE_TTL_PRICE = Number(process.env.CACHE_TTL_PRICE ?? 5000)
const CACHE_TTL_CANDLES = Number(process.env.CACHE_TTL_CANDLES ?? 300000)
const CACHE_TTL_PAIRS = Number(process.env.CACHE_TTL_PAIRS ?? 3600000)
const CACHE_TTL_BALANCE = 30000
const BINANCE_BASE_URL = process.env.BINANCE_TESTNET === 'true'
  ? 'https://testnet.binance.vision'
  : (process.env.BINANCE_BASE_URL || 'https://api.binance.com')

const priceCache = new Map<string, CacheEntry<number>>()
const candlesCache = new Map<string, CacheEntry<Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>>>()
const pairsCache = new Map<string, CacheEntry<string[]>>()
const exchangeInfoCache = new Map<string, CacheEntry<BinanceExchangeInfoResponse>>()
const accountCache = new Map<string, CacheEntry<BinanceAccountResponse>>()

const binanceCircuitBreaker = new CircuitBreaker('binance')

class BinanceRateLimiter {
  private requests: number[] = []
  private orderRequests: number[] = []
  private readonly maxWeight = 1200
  private readonly maxOrders = 50
  private readonly windowMs = 60000
  private readonly orderWindowMs = 10000

  async waitForWeight(weight: number = 1): Promise<void> {
    const now = Date.now()
    this.requests = this.requests.filter((timestamp) => now - timestamp < this.windowMs)

    if (this.requests.length + weight > this.maxWeight) {
      const oldest = this.requests[0]
      const waitTime = Math.max(100, this.windowMs - (now - oldest))
      await sleep(waitTime)
      return this.waitForWeight(weight)
    }

    for (let index = 0; index < weight; index += 1) {
      this.requests.push(now)
    }
  }

  async waitForOrder(): Promise<void> {
    const now = Date.now()
    this.orderRequests = this.orderRequests.filter((timestamp) => now - timestamp < this.orderWindowMs)

    if (this.orderRequests.length >= this.maxOrders) {
      const oldest = this.orderRequests[0]
      const waitTime = Math.max(100, this.orderWindowMs - (now - oldest))
      await sleep(waitTime)
      return this.waitForOrder()
    }

    this.orderRequests.push(now)
  }
}

const rateLimiter = new BinanceRateLimiter()

function getCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number): T | null {
  const cached = cache.get(key)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp >= ttlMs) {
    cache.delete(key)
    return null
  }

  return cached.value
}

function setCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, {
    value,
    timestamp: Date.now(),
  })

  return value
}

function normalizePair(pair: string): string {
  return pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function formatPair(symbol: string, baseAsset?: string, quoteAsset?: string): string {
  if (baseAsset && quoteAsset) {
    return `${baseAsset}/${quoteAsset}`
  }

  const normalizedSymbol = normalizePair(symbol)
  const matchedQuote = QUOTE_ASSET_PRIORITY.find((candidate) => normalizedSymbol.endsWith(candidate))

  if (!matchedQuote) {
    return normalizedSymbol
  }

  const base = normalizedSymbol.slice(0, normalizedSymbol.length - matchedQuote.length)
  return `${base}/${matchedQuote}`
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams()

  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .forEach(([key, value]) => {
      searchParams.append(key, String(value))
    })

  return searchParams.toString()
}

function signQueryString(queryString: string, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex')
}

function getAccountCacheKey(apiKey: string): string {
  return crypto.createHash('sha1').update(apiKey).digest('hex')
}

async function publicRequest<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: { weight?: number; timeoutMs?: number } = {},
): Promise<T> {
  const queryString = buildQueryString(params)
  const url = queryString ? `${BINANCE_BASE_URL}${endpoint}?${queryString}` : `${BINANCE_BASE_URL}${endpoint}`

  await rateLimiter.waitForWeight(options.weight ?? 1)

  return binanceCircuitBreaker.execute(async () => requestJson<T>(url, {
    method: 'GET',
    timeoutMs: options.timeoutMs ?? DEFAULT_BINANCE_TIMEOUT,
    retries: 3,
    retryDelayMs: 800,
    module: 'binance',
    requestName: endpoint,
  }))
}

async function signedRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE',
  params: Record<string, string | number | boolean | undefined>,
  credentials: BinanceCredentials,
  options: { weight?: number; isOrder?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const queryString = buildQueryString({
    ...params,
    timestamp: Date.now(),
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  })
  const signature = signQueryString(queryString, credentials.secretKey)
  const url = `${BINANCE_BASE_URL}${endpoint}?${queryString}&signature=${signature}`

  await rateLimiter.waitForWeight(options.weight ?? 1)
  if (options.isOrder) {
    await rateLimiter.waitForOrder()
  }

  return binanceCircuitBreaker.execute(async () => requestJson<T>(url, {
    method,
    timeoutMs: options.timeoutMs ?? DEFAULT_BINANCE_TIMEOUT,
    retries: 3,
    retryDelayMs: 800,
    headers: {
      'X-MBX-APIKEY': credentials.apiKey,
    },
    module: 'binance',
    requestName: endpoint,
  }))
}

function normalizeInterval(interval: string): string {
  const normalized = interval.trim().toLowerCase()
  const supported = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'])
  if (!supported.has(interval) && !supported.has(normalized)) {
    throw new ExternalApiError(`Intervalo inválido para Binance: ${interval}`)
  }
  return supported.has(interval) ? interval : normalized
}

export async function getServerTime(): Promise<number> {
  const response = await publicRequest<BinanceServerTimeResponse>('/api/v3/time', {}, { weight: 1 })
  return response.serverTime
}

export async function testBinanceConnection(apiKey: string, secretKey: string): Promise<{
  accountType: string
  canTrade: boolean
  canDeposit: boolean
  canWithdraw: boolean
  balancesCount: number
}> {
  const account = await signedRequest<BinanceAccountResponse>('/api/v3/account', 'GET', {}, { apiKey, secretKey }, { weight: 10 })

  return {
    accountType: account.accountType,
    canTrade: account.canTrade,
    canDeposit: account.canDeposit,
    canWithdraw: account.canWithdraw,
    balancesCount: Array.isArray(account.balances) ? account.balances.length : 0,
  }
}

export async function getExchangeInfo(): Promise<BinanceExchangeInfoResponse> {
  const cached = getCacheValue(exchangeInfoCache, 'exchange-info', CACHE_TTL_PAIRS)
  if (cached) {
    return cached
  }

  const data = await publicRequest<BinanceExchangeInfoResponse>('/api/v3/exchangeInfo', {}, { weight: 10 })
  return setCacheValue(exchangeInfoCache, 'exchange-info', data)
}

export async function getAvailablePairs(): Promise<string[]> {
  const cached = getCacheValue(pairsCache, 'available-pairs', CACHE_TTL_PAIRS)
  if (cached) {
    return cached
  }

  const exchangeInfo = await getExchangeInfo()
  const pairs = exchangeInfo.symbols
    .filter((symbol) => symbol.status === 'TRADING')
    .filter((symbol) => symbol.isSpotTradingAllowed !== false)
    .filter((symbol) => !Array.isArray(symbol.permissions) || symbol.permissions.length === 0 || symbol.permissions.includes('SPOT'))
    .map((symbol) => formatPair(symbol.symbol, symbol.baseAsset, symbol.quoteAsset))
    .sort((left, right) => left.localeCompare(right, 'en'))

  return setCacheValue(pairsCache, 'available-pairs', pairs)
}

export async function getTickerPrice(pair: string): Promise<number> {
  const symbol = normalizePair(pair)
  const cacheKey = `ticker:${symbol}`
  const cached = getCacheValue(priceCache, cacheKey, CACHE_TTL_PRICE)
  if (cached !== null) {
    return cached
  }

  const data = await publicRequest<BinanceTickerPriceResponse>('/api/v3/ticker/price', { symbol }, { weight: 1 })
  const price = Number(data.price)

  if (!Number.isFinite(price) || price <= 0) {
    throw new ExternalApiError(`Preço inválido retornado pela Binance para ${symbol}`)
  }

  return setCacheValue(priceCache, cacheKey, price)
}

export async function getCandles(
  pair: string,
  interval: string,
  limit: number = 100,
): Promise<Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>> {
  const symbol = normalizePair(pair)
  const normalizedInterval = normalizeInterval(interval)
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 100))
  const cacheKey = `candles:${symbol}:${normalizedInterval}:${normalizedLimit}`
  const cached = getCacheValue(candlesCache, cacheKey, CACHE_TTL_CANDLES)
  if (cached) {
    return cached
  }

  const data = await publicRequest<BinanceKline[]>('/api/v3/klines', {
    symbol,
    interval: normalizedInterval,
    limit: normalizedLimit,
  }, { weight: 2 })

  const candles = data.map((entry) => ({
    timestamp: new Date(Number(entry[0])).toISOString(),
    open: Number(entry[1]),
    high: Number(entry[2]),
    low: Number(entry[3]),
    close: Number(entry[4]),
    volume: Number(entry[5]),
  }))

  return setCacheValue(candlesCache, cacheKey, candles)
}

export async function getAccountInfo(apiKey: string, secretKey: string): Promise<BinanceAccountResponse> {
  const cacheKey = getAccountCacheKey(apiKey)
  const cached = getCacheValue(accountCache, cacheKey, CACHE_TTL_BALANCE)
  if (cached) {
    return cached
  }

  const data = await signedRequest<BinanceAccountResponse>('/api/v3/account', 'GET', {}, { apiKey, secretKey }, { weight: 10 })
  return setCacheValue(accountCache, cacheKey, data)
}

export async function getAccountBalances(apiKey: string, secretKey: string): Promise<Array<{ currency: string; available: number; reserved: number; total: number }>> {
  const account = await getAccountInfo(apiKey, secretKey)

  return account.balances
    .map((balance) => {
      const available = Number(balance.free)
      const reserved = Number(balance.locked)
      const total = available + reserved

      return {
        currency: balance.asset,
        available,
        reserved,
        total,
      }
    })
    .filter((balance) => balance.total > 0)
    .sort((left, right) => right.total - left.total)
}

export async function createSpotOrder(apiKey: string, secretKey: string, params: CreateOrderParams): Promise<BinanceOrderResponse> {
  const normalizedPrice = params.price !== undefined ? Number(params.price) : undefined
  const quantity = Number(params.quantity)

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ExternalApiError('Quantidade inválida para criação de ordem')
  }

  const payload: Record<string, string | number | boolean | undefined> = {
    symbol: normalizePair(params.pair),
    side: params.side,
    type: normalizedPrice !== undefined ? 'LIMIT' : 'MARKET',
    quantity: quantity.toString(),
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  }

  if (normalizedPrice !== undefined) {
    payload.price = normalizedPrice.toString()
    payload.timeInForce = 'GTC'
  }

  return signedRequest<BinanceOrderResponse>('/api/v3/order', 'POST', payload, { apiKey, secretKey }, { weight: 1, isOrder: true })
}

export async function cancelSpotOrder(apiKey: string, secretKey: string, params: CancelOrderParams): Promise<BinanceOrderResponse> {
  return signedRequest<BinanceOrderResponse>('/api/v3/order', 'DELETE', {
    symbol: normalizePair(params.pair),
    orderId: params.orderId,
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  }, { apiKey, secretKey }, { weight: 1, isOrder: true })
}

export async function fetchHistoricalCandles(params: HistoricalCandlesParams): Promise<Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>> {
  const symbol = normalizePair(params.pair)
  const interval = normalizeInterval(params.interval)
  const result: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }> = []

  let currentStart = params.startTime
  while (currentStart < params.endTime) {
    const data = await publicRequest<BinanceKline[]>('/api/v3/klines', {
      symbol,
      interval,
      startTime: currentStart,
      endTime: params.endTime,
      limit: 1000,
    }, { weight: 2, timeoutMs: Math.max(DEFAULT_BINANCE_TIMEOUT, 60000) })

    if (!Array.isArray(data) || data.length === 0) {
      break
    }

    result.push(...data.map((entry) => ({
      timestamp: new Date(Number(entry[0])).toISOString(),
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5]),
    })))

    currentStart = Number(data[data.length - 1][0]) + 1
    if (data.length < 1000) {
      break
    }
  }

  return result.filter((entry) => new Date(entry.timestamp).getTime() <= params.endTime)
}

export async function getSymbolPriceInUsdt(asset: string): Promise<number> {
  const normalizedAsset = asset.trim().toUpperCase()

  if (normalizedAsset === 'USDT') {
    return 1
  }

  const directPair = `${normalizedAsset}/USDT`
  try {
    return await getTickerPrice(directPair)
  } catch (directError) {
    logger.debug('[binance] Falha ao buscar preço direto em USDT, tentando inverso', {
      module: 'binance',
      event: 'symbol_price_inverse_fallback',
      asset: normalizedAsset,
      error: directError,
      skipPersistence: true,
    })
  }

  const inversePair = `USDT/${normalizedAsset}`
  const inverseRate = await getTickerPrice(inversePair)
  if (!Number.isFinite(inverseRate) || inverseRate <= 0) {
    throw new ExternalApiError(`Não foi possível obter preço em USDT para ${normalizedAsset}`)
  }

  return 1 / inverseRate
}
