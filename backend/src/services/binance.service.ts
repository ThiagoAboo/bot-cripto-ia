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

interface BinanceOrderBookResponse {
  lastUpdateId: number
  bids: Array<[string, string]>
  asks: Array<[string, string]>
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
  filters?: BinanceExchangeInfoFilter[]
}

interface BinanceExchangeInfoFilter {
  filterType: string
  minPrice?: string
  maxPrice?: string
  tickSize?: string
  minQty?: string
  maxQty?: string
  stepSize?: string
  minNotional?: string
  maxNotional?: string
  applyToMarket?: boolean
  applyMinToMarket?: boolean
  applyMaxToMarket?: boolean
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
  updateTime?: number
  price: string
  origQty: string
  executedQty: string
  cummulativeQuoteQty: string
  status: string
  timeInForce?: string
  type: string
  side: string
  fills?: BinanceOrderFill[]
}

interface BinanceOrderFill {
  price: string
  qty: string
  commission: string
  commissionAsset: string
  tradeId?: number
}

interface BinanceUserDataStreamResponse {
  listenKey: string
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

interface GetOrderParams {
  pair: string
  orderId?: string | number
  origClientOrderId?: string
  recvWindow?: number
}

interface HistoricalCandlesParams {
  pair: string
  interval: string
  startTime: number
  endTime: number
}

export interface BinanceTradeFill {
  id: number
  orderId: number
  price: string
  qty: string
  quoteQty: string
  commission: string
  commissionAsset: string
  time: number
  isBuyer: boolean
  isMaker: boolean
  isBestMatch: boolean
}

export interface BinanceSpotTradingRules {
  pair: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  minQty: number
  maxQty?: number
  stepSize: number
  minPrice?: number
  maxPrice?: number
  tickSize?: number
  minNotional?: number
  maxNotional?: number
}

export interface BinanceOrderBookSnapshot {
  lastUpdateId: number
  bids: Array<[number, number]>
  asks: Array<[number, number]>
}

export interface PreparedSpotOrderRequest {
  isValid: boolean
  quantity?: number
  price?: number
  notional?: number
  rejectionReason?: string
  adjustments: string[]
  rules: BinanceSpotTradingRules
}

export type LocalExchangeOrderStatus = 'pending' | 'partially_filled' | 'executed' | 'cancelled' | 'rejected'

const QUOTE_ASSET_PRIORITY = ['USDT', 'FDUSD', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'BRL', 'TRY']
const DEFAULT_BINANCE_TIMEOUT = Number(process.env.BINANCE_TIMEOUT ?? 30000)
const DEFAULT_RECV_WINDOW = Number(process.env.BINANCE_RECV_WINDOW ?? 5000)
const CACHE_TTL_PRICE = Number(process.env.CACHE_TTL_PRICE ?? 5000)
const CACHE_TTL_CANDLES = Number(process.env.CACHE_TTL_CANDLES ?? 300000)
const CACHE_TTL_ORDERBOOK = Number(process.env.CACHE_TTL_ORDERBOOK ?? 3000)
const CACHE_TTL_PAIRS = Number(process.env.CACHE_TTL_PAIRS ?? 3600000)
const CACHE_TTL_BALANCE = 30000
const BINANCE_BASE_URL = process.env.BINANCE_TESTNET === 'true'
  ? 'https://testnet.binance.vision'
  : (process.env.BINANCE_BASE_URL || 'https://api.binance.com')

const priceCache = new Map<string, CacheEntry<number>>()
const candlesCache = new Map<string, CacheEntry<Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>>>()
const orderBookCache = new Map<string, CacheEntry<BinanceOrderBookSnapshot>>()
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

function countDecimals(value: number | string | undefined): number {
  if (value === undefined || value === null) {
    return 0
  }

  const stringValue = String(value)
  if (!stringValue.includes('.')) {
    return 0
  }

  return stringValue.replace(/0+$/, '').split('.')[1]?.length ?? 0
}

function normalizeDownToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(increment) || increment <= 0) {
    return value
  }

  const decimals = Math.max(countDecimals(increment), countDecimals(value))
  const scale = 10 ** Math.min(decimals, 8)
  const scaledValue = Math.floor((value + 1e-12) * scale)
  const scaledIncrement = Math.max(1, Math.round(increment * scale))
  const normalizedScaled = Math.floor(scaledValue / scaledIncrement) * scaledIncrement

  return Number((normalizedScaled / scale).toFixed(Math.min(countDecimals(increment), 8)))
}

function parseFilterNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
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

async function apiKeyRequest<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE',
  credentials: Pick<BinanceCredentials, 'apiKey'>,
  params: Record<string, string | number | boolean | undefined> = {},
  options: { weight?: number; timeoutMs?: number } = {},
): Promise<T> {
  const queryString = buildQueryString(params)
  const url = queryString
    ? `${BINANCE_BASE_URL}${endpoint}?${queryString}`
    : `${BINANCE_BASE_URL}${endpoint}`

  await rateLimiter.waitForWeight(options.weight ?? 1)

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

function normalizeOrderBookLimit(limit: number): number {
  const supportedLimits = [5, 10, 20, 50, 100, 500, 1000, 5000]
  const normalized = Math.max(5, Math.min(5000, Math.round(Number(limit) || 20)))

  if (supportedLimits.includes(normalized)) {
    return normalized
  }

  return supportedLimits.find((candidate) => candidate >= normalized) ?? 5000
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

export async function getSpotTradingRules(pair: string): Promise<BinanceSpotTradingRules> {
  const normalizedPair = normalizePair(pair)
  const exchangeInfo = await getExchangeInfo()
  const symbolInfo = exchangeInfo.symbols.find((symbol) => normalizePair(symbol.symbol) === normalizedPair)

  if (!symbolInfo) {
    throw new ExternalApiError(`Par não encontrado na Binance: ${pair}`)
  }

  const priceFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'PRICE_FILTER')
  const lotSizeFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'LOT_SIZE')
  const marketLotSizeFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'MARKET_LOT_SIZE')
  const minNotionalFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL')
  const notionalFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'NOTIONAL')

  const stepSize = parseFilterNumber(marketLotSizeFilter?.stepSize)
    ?? parseFilterNumber(lotSizeFilter?.stepSize)
    ?? 0.00000001
  const minQty = parseFilterNumber(marketLotSizeFilter?.minQty)
    ?? parseFilterNumber(lotSizeFilter?.minQty)
    ?? stepSize

  return {
    pair: formatPair(symbolInfo.symbol, symbolInfo.baseAsset, symbolInfo.quoteAsset),
    symbol: symbolInfo.symbol,
    baseAsset: symbolInfo.baseAsset,
    quoteAsset: symbolInfo.quoteAsset,
    minQty,
    maxQty: parseFilterNumber(marketLotSizeFilter?.maxQty) ?? parseFilterNumber(lotSizeFilter?.maxQty),
    stepSize,
    minPrice: parseFilterNumber(priceFilter?.minPrice),
    maxPrice: parseFilterNumber(priceFilter?.maxPrice),
    tickSize: parseFilterNumber(priceFilter?.tickSize),
    minNotional: parseFilterNumber(notionalFilter?.minNotional) ?? parseFilterNumber(minNotionalFilter?.minNotional),
    maxNotional: parseFilterNumber(notionalFilter?.maxNotional),
  }
}

export async function prepareSpotOrderRequest(params: {
  pair: string
  quantity: number
  orderType: 'MARKET' | 'LIMIT'
  price?: number
  referencePrice?: number
}): Promise<PreparedSpotOrderRequest> {
  const rules = await getSpotTradingRules(params.pair)
  const adjustments: string[] = []
  const normalizedQuantity = normalizeDownToIncrement(params.quantity, rules.stepSize)

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    return {
      isValid: false,
      rejectionReason: 'Quantidade inválida após aplicar stepSize da Binance',
      adjustments,
      rules,
    }
  }

  if (Math.abs(normalizedQuantity - params.quantity) > 1e-8) {
    adjustments.push(`Quantidade ajustada de ${params.quantity} para ${normalizedQuantity} por stepSize`)
  }

  if (normalizedQuantity < rules.minQty) {
    return {
      isValid: false,
      rejectionReason: `Quantidade ${normalizedQuantity} abaixo do mínimo ${rules.minQty} exigido pela Binance`,
      adjustments,
      rules,
    }
  }

  if (typeof rules.maxQty === 'number' && normalizedQuantity > rules.maxQty) {
    return {
      isValid: false,
      rejectionReason: `Quantidade ${normalizedQuantity} acima do máximo ${rules.maxQty} permitido pela Binance`,
      adjustments,
      rules,
    }
  }

  let normalizedPrice = params.price
  if (params.orderType === 'LIMIT') {
    if (!Number.isFinite(normalizedPrice) || !normalizedPrice || normalizedPrice <= 0) {
      return {
        isValid: false,
        rejectionReason: 'Preço é obrigatório para ordem LIMIT',
        adjustments,
        rules,
      }
    }

    if (rules.tickSize) {
      const adjustedPrice = normalizeDownToIncrement(normalizedPrice, rules.tickSize)
      if (Math.abs(adjustedPrice - normalizedPrice) > 1e-8) {
        adjustments.push(`Preço ajustado de ${normalizedPrice} para ${adjustedPrice} por tickSize`)
      }
      normalizedPrice = adjustedPrice
    }

    if (typeof rules.minPrice === 'number' && normalizedPrice < rules.minPrice) {
      return {
        isValid: false,
        rejectionReason: `Preço ${normalizedPrice} abaixo do mínimo ${rules.minPrice} da Binance`,
        adjustments,
        rules,
      }
    }

    if (typeof rules.maxPrice === 'number' && normalizedPrice > rules.maxPrice) {
      return {
        isValid: false,
        rejectionReason: `Preço ${normalizedPrice} acima do máximo ${rules.maxPrice} da Binance`,
        adjustments,
        rules,
      }
    }
  }

  const referencePrice = params.orderType === 'LIMIT'
    ? normalizedPrice
    : (params.referencePrice ?? params.price ?? await getTickerPrice(params.pair))
  const notional = normalizedQuantity * (referencePrice ?? 0)

  if (!Number.isFinite(notional) || notional <= 0) {
    return {
      isValid: false,
      rejectionReason: 'Não foi possível calcular o notional da ordem',
      adjustments,
      rules,
    }
  }

  if (typeof rules.minNotional === 'number' && notional + 1e-8 < rules.minNotional) {
    return {
      isValid: false,
      rejectionReason: `Notional ${notional.toFixed(8)} abaixo do mínimo ${rules.minNotional} da Binance`,
      adjustments,
      rules,
    }
  }

  if (typeof rules.maxNotional === 'number' && notional - 1e-8 > rules.maxNotional) {
    return {
      isValid: false,
      rejectionReason: `Notional ${notional.toFixed(8)} acima do máximo ${rules.maxNotional} da Binance`,
      adjustments,
      rules,
    }
  }

  return {
    isValid: true,
    quantity: normalizedQuantity,
    price: normalizedPrice,
    notional,
    adjustments,
    rules,
  }
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

export async function getOrderBook(
  pair: string,
  limit: number = 20,
): Promise<BinanceOrderBookSnapshot> {
  const symbol = normalizePair(pair)
  const normalizedLimit = normalizeOrderBookLimit(limit)
  const cacheKey = `orderbook:${symbol}:${normalizedLimit}`
  const cached = getCacheValue(orderBookCache, cacheKey, CACHE_TTL_ORDERBOOK)
  if (cached) {
    return cached
  }

  const data = await publicRequest<BinanceOrderBookResponse>('/api/v3/depth', {
    symbol,
    limit: normalizedLimit,
  }, { weight: normalizedLimit >= 500 ? 25 : 5 })

  const snapshot: BinanceOrderBookSnapshot = {
    lastUpdateId: data.lastUpdateId,
    bids: (data.bids ?? [])
      .map(([price, quantity]) => [Number(price), Number(quantity)] as [number, number])
      .filter(([price, quantity]) => Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity >= 0),
    asks: (data.asks ?? [])
      .map(([price, quantity]) => [Number(price), Number(quantity)] as [number, number])
      .filter(([price, quantity]) => Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity >= 0),
  }

  return setCacheValue(orderBookCache, cacheKey, snapshot)
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

export async function getAccountInfo(
  apiKey: string,
  secretKey: string,
  options: { forceRefresh?: boolean } = {},
): Promise<BinanceAccountResponse> {
  const cacheKey = getAccountCacheKey(apiKey)
  const cached = options.forceRefresh ? null : getCacheValue(accountCache, cacheKey, CACHE_TTL_BALANCE)
  if (cached) {
    return cached
  }

  const data = await signedRequest<BinanceAccountResponse>('/api/v3/account', 'GET', {}, { apiKey, secretKey }, { weight: 10 })
  return setCacheValue(accountCache, cacheKey, data)
}

export async function getAccountBalances(
  apiKey: string,
  secretKey: string,
  options: { forceRefresh?: boolean } = {},
): Promise<Array<{ currency: string; available: number; reserved: number; total: number }>> {
  const account = await getAccountInfo(apiKey, secretKey, options)

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
    newOrderRespType: normalizedPrice !== undefined ? 'RESULT' : 'FULL',
  }

  if (normalizedPrice !== undefined) {
    payload.price = normalizedPrice.toString()
    payload.timeInForce = 'GTC'
  }

  const response = await signedRequest<BinanceOrderResponse>('/api/v3/order', 'POST', payload, { apiKey, secretKey }, { weight: 1, isOrder: true })
  accountCache.delete(getAccountCacheKey(apiKey))
  return response
}

export async function cancelSpotOrder(apiKey: string, secretKey: string, params: CancelOrderParams): Promise<BinanceOrderResponse> {
  return signedRequest<BinanceOrderResponse>('/api/v3/order', 'DELETE', {
    symbol: normalizePair(params.pair),
    orderId: params.orderId,
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  }, { apiKey, secretKey }, { weight: 1, isOrder: true })
}

export async function getSpotOrder(apiKey: string, secretKey: string, params: GetOrderParams): Promise<BinanceOrderResponse> {
  if (!params.orderId && !params.origClientOrderId) {
    throw new ExternalApiError('É necessário informar orderId ou origClientOrderId para consultar a ordem')
  }

  return signedRequest<BinanceOrderResponse>('/api/v3/order', 'GET', {
    symbol: normalizePair(params.pair),
    orderId: params.orderId,
    origClientOrderId: params.origClientOrderId,
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  }, { apiKey, secretKey }, { weight: 1, isOrder: true })
}

export async function getSpotOrderTrades(apiKey: string, secretKey: string, params: {
  pair: string
  orderId: string | number
  recvWindow?: number
}): Promise<BinanceTradeFill[]> {
  return signedRequest<BinanceTradeFill[]>('/api/v3/myTrades', 'GET', {
    symbol: normalizePair(params.pair),
    orderId: params.orderId,
    recvWindow: params.recvWindow ?? DEFAULT_RECV_WINDOW,
  }, { apiKey, secretKey }, { weight: 10 })
}

export async function createUserDataStream(apiKey: string): Promise<string> {
  const response = await apiKeyRequest<BinanceUserDataStreamResponse>(
    '/api/v3/userDataStream',
    'POST',
    { apiKey },
    {},
    { weight: 1 },
  )

  return response.listenKey
}

export async function keepaliveUserDataStream(apiKey: string, listenKey: string): Promise<void> {
  await apiKeyRequest<BinanceUserDataStreamResponse>(
    '/api/v3/userDataStream',
    'PUT',
    { apiKey },
    { listenKey },
    { weight: 1 },
  )
}

export async function closeUserDataStream(apiKey: string, listenKey: string): Promise<void> {
  await apiKeyRequest<BinanceUserDataStreamResponse>(
    '/api/v3/userDataStream',
    'DELETE',
    { apiKey },
    { listenKey },
    { weight: 1 },
  )
}

export function mapBinanceOrderStatusToLocalStatus(status: string, executedQuantity: number): LocalExchangeOrderStatus {
  const normalizedStatus = status.trim().toUpperCase()

  if (normalizedStatus === 'FILLED') {
    return 'executed'
  }

  if (normalizedStatus === 'PARTIALLY_FILLED') {
    return 'partially_filled'
  }

  if (normalizedStatus === 'REJECTED') {
    return 'rejected'
  }

  if (['CANCELED', 'EXPIRED', 'EXPIRED_IN_MATCH'].includes(normalizedStatus)) {
    return executedQuantity > 0 ? 'cancelled' : 'cancelled'
  }

  return 'pending'
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
