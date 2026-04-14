import { prisma } from '../config/database'
import { analyzeBotInstance, type BotAnalysisResponse } from './bot-analysis.service'
import {
  executeOrderForUser,
  getAssetPriceInQuote,
  getUserExchangeCredentials,
  reconcileOpenExchangeOrdersForUser,
  syncExternalBalances,
  upsertExchangeOrderSnapshot,
  type ExecutedOrderPayload,
} from '../controllers/transactions.controller'
import {
  createSpotOrder,
  getAccountBalances,
  getCandles,
  getTickerPrice,
  mapBinanceOrderStatusToLocalStatus,
  prepareSpotOrderRequest,
} from './binance.service'
import { getCurrencyRateToBrl } from './market-valuation.service'
import { recordBalanceHistorySnapshot } from './portfolio.service'
import { emitDashboardUpdate } from './socket.service'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'

type BotExecutionMode = 'paper' | 'semi_auto' | 'full_auto'

export interface BotCycleExecution {
  mode: BotExecutionMode
  status: 'skipped' | 'suggested' | 'submitted' | 'executed'
  reason: string
  pair?: string
  action?: 'buy' | 'sell' | 'hold'
  quantity?: number
  transaction?: ExecutedOrderPayload
}

export interface BotCycleResult {
  botId: string
  botName: string
  generatedAt: string
  analysis: BotAnalysisResponse
  execution: BotCycleExecution
}

interface TradePlan {
  shouldExecute: boolean
  reason: string
  quantity?: number
}

interface PositionLot {
  remainingQuantity: number
  unitCostInQuote: number
}

interface OpenPositionSnapshot {
  pair: string
  quantity: number
  averageEntryPrice: number
  currentPrice: number
  pnlPercent: number
}

interface BotRiskConfig {
  stopLossPercent: number
  takeProfitPercent: number
  circuitBreakerDailyLossPercent: number
  circuitBreakerCooldownMinutes: number
  maxConsecutiveLosses: number
  maxPositionSize: number
  maxExposurePerCoin: number
  maxTotalExposure: number
  maxConcurrentTrades: number
  minCorrelationThreshold: number
  atrPeriod: number
  targetAtrPercent: number
  minAtrPositionFactor: number
  correlationLookbackCandles: number
}

interface RiskDecision {
  overrideOpportunity?: {
    pair: string
    action: 'sell'
    confidence: number
    price: number
    reason: string
  }
  skipReason?: string
}

interface BinanceFeeBreakdown {
  fee?: number
  feeCurrency?: string
  feeInQuote?: number
  feeRateApplied?: number
  feeDiscountSource?: 'bnb' | 'standard'
}

interface PortfolioExposureSnapshot {
  totalPortfolioBrl: number
  totalExposureBrl: number
  openPositionsCount: number
  pairExposureBrl: Map<string, number>
}

const BOT_WORKER_POLL_MS = Math.max(1000, Number(process.env.BOT_WORKER_POLL_MS || 15000))
const BOT_TRADE_COOLDOWN_MS = Math.max(1000, Number(process.env.BOT_TRADE_COOLDOWN_MS || 300000))
const DEFAULT_MIN_CONFIDENCE = Number(process.env.BOT_MIN_CONFIDENCE || 68)
const DEFAULT_ATR_PERIOD = 14
const DEFAULT_TARGET_ATR_PERCENT = 0.025
const DEFAULT_MIN_ATR_POSITION_FACTOR = 0.35
const DEFAULT_CORRELATION_THRESHOLD = 0.85
const DEFAULT_CORRELATION_LOOKBACK_CANDLES = 48
const QUANTITY_EPSILON = 1e-8

let workerInterval: NodeJS.Timeout | null = null
let isCycleRunning = false
const processingBots = new Set<string>()
const reconcilingUsers = new Set<string>()

function getPairCurrencies(pair: string): { baseCurrency: string; quoteCurrency: string } {
  const [baseCurrency, quoteCurrency = 'USDT'] = pair
    .split('/')
    .map((value) => value.trim().toUpperCase())

  return {
    baseCurrency,
    quoteCurrency,
  }
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(8))
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function normalizePairs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ))
}

function resolveEffectiveAllowedPairs(
  parameters: Record<string, unknown>,
  fallbackPairs: string[],
): string[] {
  const botPairs = normalizePairs(parameters.allowedPairs)
  if (botPairs.length > 0) {
    return botPairs
  }

  return fallbackPairs
}

function resolveTimeframe(parameters: Record<string, unknown>): '1m' | '5m' | '15m' | '1h' | '4h' | '1d' {
  const timeframe = typeof parameters.timeframe === 'string' ? parameters.timeframe : '1h'
  if (['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe)) {
    return timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  }

  return '1h'
}

function calculateAtrRatio(
  candles: Array<{ high: number; low: number; close: number }>,
  period: number,
  referencePrice: number,
): number | null {
  if (!Array.isArray(candles) || candles.length <= period) {
    return null
  }

  const trueRanges: number[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]
    const previous = candles[index - 1]
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    )

    if (Number.isFinite(trueRange)) {
      trueRanges.push(trueRange)
    }
  }

  if (trueRanges.length < period) {
    return null
  }

  const atrWindow = trueRanges.slice(trueRanges.length - period)
  const atr = atrWindow.reduce((sum, value) => sum + value, 0) / atrWindow.length
  const price = referencePrice > QUANTITY_EPSILON
    ? referencePrice
    : candles[candles.length - 1]?.close ?? 0

  if (!Number.isFinite(atr) || atr <= QUANTITY_EPSILON || price <= QUANTITY_EPSILON) {
    return null
  }

  return atr / price
}

function buildReturnSeries(
  candles: Array<{ close: number }>,
  lookbackCandles: number,
): number[] {
  if (!Array.isArray(candles) || candles.length < 3) {
    return []
  }

  const window = candles.slice(-Math.max(lookbackCandles, 3))
  const returns: number[] = []

  for (let index = 1; index < window.length; index += 1) {
    const previousClose = window[index - 1]?.close ?? 0
    const currentClose = window[index]?.close ?? 0

    if (previousClose <= QUANTITY_EPSILON || !Number.isFinite(currentClose)) {
      continue
    }

    returns.push((currentClose - previousClose) / previousClose)
  }

  return returns
}

function calculatePearsonCorrelation(left: number[], right: number[]): number | null {
  const length = Math.min(left.length, right.length)
  if (length < 3) {
    return null
  }

  const leftSeries = left.slice(left.length - length)
  const rightSeries = right.slice(right.length - length)
  const leftMean = leftSeries.reduce((sum, value) => sum + value, 0) / length
  const rightMean = rightSeries.reduce((sum, value) => sum + value, 0) / length

  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0

  for (let index = 0; index < length; index += 1) {
    const leftDelta = leftSeries[index] - leftMean
    const rightDelta = rightSeries[index] - rightMean
    numerator += leftDelta * rightDelta
    leftVariance += leftDelta ** 2
    rightVariance += rightDelta ** 2
  }

  if (leftVariance <= QUANTITY_EPSILON || rightVariance <= QUANTITY_EPSILON) {
    return null
  }

  return numerator / Math.sqrt(leftVariance * rightVariance)
}

function consumePositionLots(lots: PositionLot[], quantityToConsume: number): void {
  let remainingQuantity = quantityToConsume

  while (remainingQuantity > QUANTITY_EPSILON) {
    const currentLot = lots[0]
    if (!currentLot) {
      break
    }

    const consumedQuantity = Math.min(currentLot.remainingQuantity, remainingQuantity)
    currentLot.remainingQuantity -= consumedQuantity
    remainingQuantity -= consumedQuantity

    if (currentLot.remainingQuantity <= QUANTITY_EPSILON) {
      lots.shift()
    }
  }
}

function resolveRiskConfig(parameters: Record<string, unknown>, configuration?: {
  stopLossPercent: number
  takeProfitPercent: number
} | null): BotRiskConfig {
  return {
    stopLossPercent: safeNumber(parameters.stopLossPercent, configuration?.stopLossPercent ?? 5),
    takeProfitPercent: safeNumber(parameters.takeProfitPercent, configuration?.takeProfitPercent ?? 10),
    circuitBreakerDailyLossPercent: safeNumber(parameters.circuitBreakerDailyLossPercent, 6),
    circuitBreakerCooldownMinutes: safeNumber(parameters.circuitBreakerCooldownMinutes, 60),
    maxConsecutiveLosses: Math.max(1, Math.round(safeNumber(parameters.maxConsecutiveLosses, 3))),
    maxPositionSize: Math.max(0, safeNumber(parameters.maxPositionSize, 500)),
    maxExposurePerCoin: Math.max(0, safeNumber(parameters.maxExposurePerCoin, 0.2)),
    maxTotalExposure: Math.max(0, safeNumber(parameters.maxTotalExposure, 0.8)),
    maxConcurrentTrades: Math.max(1, Math.round(safeNumber(parameters.maxConcurrentTrades, 5))),
    minCorrelationThreshold: clampNumber(
      safeNumber(parameters.minCorrelationThreshold, DEFAULT_CORRELATION_THRESHOLD),
      0,
      0.999,
    ),
    atrPeriod: Math.max(5, Math.round(safeNumber(parameters.atrPeriod, DEFAULT_ATR_PERIOD))),
    targetAtrPercent: Math.max(0.001, safeNumber(parameters.targetAtrPercent, DEFAULT_TARGET_ATR_PERCENT)),
    minAtrPositionFactor: clampNumber(
      safeNumber(parameters.minAtrPositionFactor, DEFAULT_MIN_ATR_POSITION_FACTOR),
      0.05,
      1,
    ),
    correlationLookbackCandles: Math.max(
      12,
      Math.round(safeNumber(parameters.correlationLookbackCandles, DEFAULT_CORRELATION_LOOKBACK_CANDLES)),
    ),
  }
}

async function getPortfolioTotalBrl(userId: string): Promise<number> {
  const latestSnapshot = await prisma.balanceHistory.findFirst({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    select: { totalBrl: true },
  })

  if (latestSnapshot?.totalBrl && latestSnapshot.totalBrl > 0) {
    return latestSnapshot.totalBrl
  }

  const balances = await prisma.balance.findMany({
    where: { userId },
    select: {
      currency: true,
      available: true,
    },
  })

  if (balances.length === 0) {
    return 0
  }

  const rateEntries = await Promise.all(
    balances.map(async (balance) => {
      const rate = await getCurrencyRateToBrl(balance.currency).catch(() => 0)
      return rate * balance.available
    }),
  )

  return rateEntries.reduce((sum, value) => sum + value, 0)
}

async function getOpenPositionSnapshot(
  userId: string,
  pair: string,
  currentPrice: number,
): Promise<OpenPositionSnapshot | null> {
  const historicalTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      pair,
      status: 'executed',
    },
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      type: true,
      quantity: true,
      total: true,
      fee: true,
    },
  })

  const lots: PositionLot[] = []

  for (const transaction of historicalTransactions) {
    if (transaction.quantity <= QUANTITY_EPSILON) {
      continue
    }

    if (transaction.type === 'buy') {
      lots.push({
        remainingQuantity: transaction.quantity,
        unitCostInQuote: (transaction.total + transaction.fee) / transaction.quantity,
      })
      continue
    }

    consumePositionLots(lots, transaction.quantity)
  }

  const quantity = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0)
  if (quantity <= QUANTITY_EPSILON) {
    return null
  }

  const totalCost = lots.reduce((sum, lot) => sum + (lot.remainingQuantity * lot.unitCostInQuote), 0)
  const averageEntryPrice = totalCost / quantity
  if (!Number.isFinite(averageEntryPrice) || averageEntryPrice <= 0) {
    return null
  }

  const pnlPercent = ((currentPrice - averageEntryPrice) / averageEntryPrice) * 100

  return {
    pair,
    quantity: roundQuantity(quantity),
    averageEntryPrice,
    currentPrice,
    pnlPercent,
  }
}

async function getPortfolioExposureSnapshot(userId: string): Promise<PortfolioExposureSnapshot> {
  const totalPortfolioBrl = await getPortfolioTotalBrl(userId)
  const trackedPairs = await prisma.transaction.findMany({
    where: {
      userId,
      status: 'executed',
    },
    distinct: ['pair'],
    select: {
      pair: true,
    },
  })

  const pairExposureEntries = await Promise.all(
    trackedPairs.map(async ({ pair }) => {
      try {
        const currentPrice = await getTickerPrice(pair)
        const position = await getOpenPositionSnapshot(userId, pair, currentPrice)
        if (!position) {
          return null
        }

        const { quoteCurrency } = getPairCurrencies(pair)
        const rateToBrl = await getCurrencyRateToBrl(quoteCurrency).catch(() => 0)
        const exposureBrl = position.quantity * position.currentPrice * rateToBrl

        if (!Number.isFinite(exposureBrl) || exposureBrl <= QUANTITY_EPSILON) {
          return null
        }

        return {
          pair,
          exposureBrl,
        }
      } catch {
        return null
      }
    }),
  )

  const pairExposureBrl = new Map<string, number>()

  for (const entry of pairExposureEntries) {
    if (!entry) {
      continue
    }

    pairExposureBrl.set(entry.pair, entry.exposureBrl)
  }

  const totalExposureBrl = Array.from(pairExposureBrl.values()).reduce((sum, value) => sum + value, 0)

  return {
    totalPortfolioBrl,
    totalExposureBrl,
    openPositionsCount: pairExposureBrl.size,
    pairExposureBrl,
  }
}

async function evaluatePortfolioRiskGuard(params: {
  userId: string
  pair: string
  action: 'buy' | 'sell'
  quantity: number
  price: number
  riskConfig: BotRiskConfig
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
}): Promise<string | null> {
  if (params.action !== 'buy') {
    return null
  }

  const snapshot = await getPortfolioExposureSnapshot(params.userId)
  if (snapshot.totalPortfolioBrl <= QUANTITY_EPSILON) {
    return null
  }

  const { quoteCurrency } = getPairCurrencies(params.pair)
  const rateToBrl = await getCurrencyRateToBrl(quoteCurrency).catch(() => 0)
  const plannedExposureBrl = params.quantity * params.price * rateToBrl

  if (!Number.isFinite(plannedExposureBrl) || plannedExposureBrl <= QUANTITY_EPSILON) {
    return null
  }

  const currentPairExposureBrl = snapshot.pairExposureBrl.get(params.pair) ?? 0
  const isNewPosition = currentPairExposureBrl <= QUANTITY_EPSILON

  if (isNewPosition && snapshot.openPositionsCount >= params.riskConfig.maxConcurrentTrades) {
    return `Limite de ${params.riskConfig.maxConcurrentTrades} posições simultâneas atingido`
  }

  const perCoinLimitBrl = snapshot.totalPortfolioBrl * params.riskConfig.maxExposurePerCoin
  if (
    perCoinLimitBrl > QUANTITY_EPSILON
    && currentPairExposureBrl + plannedExposureBrl > perCoinLimitBrl + QUANTITY_EPSILON
  ) {
    return `Exposição máxima por moeda excedida para ${params.pair}`
  }

  const totalExposureLimitBrl = snapshot.totalPortfolioBrl * params.riskConfig.maxTotalExposure
  if (
    totalExposureLimitBrl > QUANTITY_EPSILON
    && snapshot.totalExposureBrl + plannedExposureBrl > totalExposureLimitBrl + QUANTITY_EPSILON
  ) {
    return 'Exposição total do portfólio excederia o limite configurado'
  }

  const comparisonPairs = Array.from(snapshot.pairExposureBrl.keys()).filter((pair) => pair !== params.pair)
  if (comparisonPairs.length === 0 || params.riskConfig.minCorrelationThreshold <= 0) {
    return null
  }

  const candidateCandles = await getCandles(
    params.pair,
    params.timeframe,
    Math.max(params.riskConfig.correlationLookbackCandles, params.riskConfig.atrPeriod + 2),
  ).catch(() => [])
  const candidateReturns = buildReturnSeries(candidateCandles, params.riskConfig.correlationLookbackCandles)
  if (candidateReturns.length < 3) {
    return null
  }

  let highestCorrelation: { pair: string; value: number } | null = null

  for (const comparisonPair of comparisonPairs) {
    const comparisonCandles = await getCandles(
      comparisonPair,
      params.timeframe,
      Math.max(params.riskConfig.correlationLookbackCandles, params.riskConfig.atrPeriod + 2),
    ).catch(() => [])
    const comparisonReturns = buildReturnSeries(comparisonCandles, params.riskConfig.correlationLookbackCandles)
    const correlation = calculatePearsonCorrelation(candidateReturns, comparisonReturns)

    if (correlation === null) {
      continue
    }

    if (!highestCorrelation || Math.abs(correlation) > Math.abs(highestCorrelation.value)) {
      highestCorrelation = {
        pair: comparisonPair,
        value: correlation,
      }
    }
  }

  if (
    highestCorrelation
    && Math.abs(highestCorrelation.value) >= params.riskConfig.minCorrelationThreshold
  ) {
    return `Correlação de ${(highestCorrelation.value * 100).toFixed(1)}% com ${highestCorrelation.pair} excede o limite de ${(params.riskConfig.minCorrelationThreshold * 100).toFixed(0)}%`
  }

  return null
}

async function reconcileOpenOrdersForUserSafely(userId: string): Promise<void> {
  if (reconcilingUsers.has(userId)) {
    return
  }

  reconcilingUsers.add(userId)

  try {
    await reconcileOpenExchangeOrdersForUser({ userId })
  } catch (error) {
    logger.warn('[bot] Falha ao reconciliar ordens externas em aberto do usuário', {
      module: 'bot',
      event: 'bot_open_orders_reconciliation_failed',
      userId,
      error,
      skipPersistence: true,
    })
  } finally {
    reconcilingUsers.delete(userId)
  }
}

async function evaluateCircuitBreaker(params: {
  userId: string
  botId: string
  riskConfig: BotRiskConfig
}): Promise<string | null> {
  const { userId, botId, riskConfig } = params
  const cooldownThreshold = new Date(Date.now() - (riskConfig.circuitBreakerCooldownMinutes * 60 * 1000))

  const recentSellTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      botId,
      status: 'executed',
      type: 'sell',
      profitBrl: { not: null },
    },
    orderBy: { date: 'desc' },
    take: Math.max(riskConfig.maxConsecutiveLosses, 25),
    select: {
      date: true,
      profitBrl: true,
    },
  })

  const recentLossStreak = recentSellTransactions.slice(0, riskConfig.maxConsecutiveLosses)
  if (
    recentLossStreak.length >= riskConfig.maxConsecutiveLosses
    && recentLossStreak.every((transaction) => (transaction.profitBrl ?? 0) < 0)
    && recentLossStreak[0].date >= cooldownThreshold
  ) {
    return `Circuit breaker ativo após ${riskConfig.maxConsecutiveLosses} perdas consecutivas`
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const todaySellTransactions = recentSellTransactions.filter((transaction) => transaction.date >= startOfDay)
  const dailyPnlBrl = todaySellTransactions.reduce((sum, transaction) => sum + (transaction.profitBrl ?? 0), 0)

  if (dailyPnlBrl >= 0) {
    return null
  }

  const portfolioTotalBrl = await getPortfolioTotalBrl(userId)
  const dailyLossThreshold = portfolioTotalBrl * (riskConfig.circuitBreakerDailyLossPercent / 100)
  const latestLoss = todaySellTransactions.find((transaction) => (transaction.profitBrl ?? 0) < 0)

  if (
    portfolioTotalBrl > 0
    && dailyLossThreshold > 0
    && Math.abs(dailyPnlBrl) >= dailyLossThreshold
    && latestLoss
    && latestLoss.date >= cooldownThreshold
  ) {
    return `Circuit breaker ativo por perda diária de R$ ${Math.abs(dailyPnlBrl).toFixed(2)}`
  }

  return null
}

async function evaluateRiskDecision(params: {
  userId: string
  botId: string
  allowedPairs: string[]
  riskConfig: BotRiskConfig
}): Promise<RiskDecision> {
  const circuitBreakerReason = await evaluateCircuitBreaker({
    userId: params.userId,
    botId: params.botId,
    riskConfig: params.riskConfig,
  })

  if (circuitBreakerReason) {
    return {
      skipReason: circuitBreakerReason,
    }
  }

  const positionSnapshots = (await Promise.all(
    params.allowedPairs.map(async (pair) => {
      try {
        const currentPrice = await getTickerPrice(pair)
        return getOpenPositionSnapshot(params.userId, pair, currentPrice)
      } catch {
        return null
      }
    }),
  )).filter((entry): entry is OpenPositionSnapshot => entry !== null)

  const stopLossCandidate = positionSnapshots
    .filter((position) => position.pnlPercent <= -params.riskConfig.stopLossPercent)
    .sort((left, right) => left.pnlPercent - right.pnlPercent)[0]

  if (stopLossCandidate) {
    return {
      overrideOpportunity: {
        pair: stopLossCandidate.pair,
        action: 'sell',
        confidence: 100,
        price: stopLossCandidate.currentPrice,
        reason: `Stop loss acionado em ${stopLossCandidate.pair} (${stopLossCandidate.pnlPercent.toFixed(2)}%)`,
      },
    }
  }

  const takeProfitCandidate = positionSnapshots
    .filter((position) => position.pnlPercent >= params.riskConfig.takeProfitPercent)
    .sort((left, right) => right.pnlPercent - left.pnlPercent)[0]

  if (takeProfitCandidate) {
    return {
      overrideOpportunity: {
        pair: takeProfitCandidate.pair,
        action: 'sell',
        confidence: 100,
        price: takeProfitCandidate.currentPrice,
        reason: `Take profit acionado em ${takeProfitCandidate.pair} (${takeProfitCandidate.pnlPercent.toFixed(2)}%)`,
      },
    }
  }

  return {}
}

async function extractBinanceFeeBreakdown(params: {
  fills?: Array<{ commission: string; commissionAsset: string }>
  quoteCurrency: string
  totalValue: number
}): Promise<BinanceFeeBreakdown> {
  const fills = Array.isArray(params.fills) ? params.fills : []
  if (fills.length === 0) {
    return {}
  }

  const commissionByAsset = new Map<string, number>()
  for (const fill of fills) {
    const asset = fill.commissionAsset?.trim().toUpperCase()
    const commission = Number(fill.commission)

    if (!asset || !Number.isFinite(commission) || commission <= 0) {
      continue
    }

    commissionByAsset.set(asset, (commissionByAsset.get(asset) ?? 0) + commission)
  }

  if (commissionByAsset.size === 0) {
    return {}
  }

  if (commissionByAsset.size === 1) {
    const [feeCurrency, fee] = Array.from(commissionByAsset.entries())[0]
    const feeInQuote = feeCurrency === params.quoteCurrency
      ? fee
      : fee * await getAssetPriceInQuote(feeCurrency, params.quoteCurrency)

    return {
      fee,
      feeCurrency,
      feeInQuote,
      feeRateApplied: params.totalValue > QUANTITY_EPSILON ? (feeInQuote / params.totalValue) : undefined,
      feeDiscountSource: feeCurrency === 'BNB' ? 'bnb' : 'standard',
    }
  }

  let feeInQuote = 0
  for (const [asset, commission] of commissionByAsset.entries()) {
    feeInQuote += asset === params.quoteCurrency
      ? commission
      : commission * await getAssetPriceInQuote(asset, params.quoteCurrency)
  }

  return {
    fee: feeInQuote,
    feeCurrency: params.quoteCurrency,
    feeInQuote,
    feeRateApplied: params.totalValue > QUANTITY_EPSILON ? (feeInQuote / params.totalValue) : undefined,
    feeDiscountSource: commissionByAsset.has('BNB') ? 'bnb' : 'standard',
  }
}

async function hasActiveTrainingSession(botId: string): Promise<boolean> {
  const activeSession = await prisma.trainingSession.findFirst({
    where: {
      botId,
      status: { in: ['pending', 'running', 'paused'] },
    },
    select: { id: true },
  })

  return Boolean(activeSession)
}

async function isInCooldown(userId: string, botId: string, pair: string, type: 'buy' | 'sell'): Promise<boolean> {
  const threshold = new Date(Date.now() - BOT_TRADE_COOLDOWN_MS)
  const recentTransaction = await prisma.transaction.findFirst({
    where: {
      userId,
      botId,
      pair,
      type,
      status: 'executed',
      date: { gte: threshold },
    },
    select: { id: true },
  })

  return Boolean(recentTransaction)
}

async function buildTradePlan(params: {
  userId: string
  pair: string
  action: 'buy' | 'sell'
  executionMode: BotExecutionMode
  price: number
  maxTradeAmount: number
  maxTradeAmountUnit: string
  riskConfig: BotRiskConfig
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
}): Promise<TradePlan> {
  const { baseCurrency, quoteCurrency } = getPairCurrencies(params.pair)
  const balances = await prisma.balance.findMany({
    where: {
      userId: params.userId,
      currency: { in: [baseCurrency, quoteCurrency, 'BNB'] },
    },
  })
  const balancesByCurrency = new Map(
    balances.map((balance) => [balance.currency.toUpperCase(), balance.available]),
  )

  if (params.action === 'buy') {
    const quoteAvailable = balancesByCurrency.get(quoteCurrency) ?? 0
    const budgetNotes: string[] = []
    const baseQuoteBudget = params.maxTradeAmountUnit === 'percent'
      ? quoteAvailable * (params.maxTradeAmount / 100)
      : Math.min(params.maxTradeAmount, quoteAvailable)
    let quoteBudget = baseQuoteBudget

    if (params.riskConfig.maxPositionSize > QUANTITY_EPSILON) {
      const cappedBudget = Math.min(quoteBudget, params.riskConfig.maxPositionSize)
      if (cappedBudget + QUANTITY_EPSILON < quoteBudget) {
        budgetNotes.push(`teto máximo por posição aplicado em ${params.riskConfig.maxPositionSize.toFixed(2)} ${quoteCurrency}`)
      }
      quoteBudget = cappedBudget
    }

    const atrCandles = await getCandles(
      params.pair,
      params.timeframe,
      Math.max(params.riskConfig.atrPeriod + 5, params.riskConfig.correlationLookbackCandles),
    ).catch(() => [])
    const atrRatio = calculateAtrRatio(atrCandles, params.riskConfig.atrPeriod, params.price)
    if (atrRatio !== null && atrRatio > QUANTITY_EPSILON) {
      const atrFactor = clampNumber(
        params.riskConfig.targetAtrPercent / atrRatio,
        params.riskConfig.minAtrPositionFactor,
        1,
      )
      if (atrFactor + QUANTITY_EPSILON < 1) {
        quoteBudget *= atrFactor
        budgetNotes.push(
          `sizing por ATR reduziu a posição para ${(atrFactor * 100).toFixed(0)}% do orçamento base (ATR ${(atrRatio * 100).toFixed(2)}%)`,
        )
      }
    }

    if (quoteBudget <= QUANTITY_EPSILON || params.price <= 0) {
      return {
        shouldExecute: false,
        reason: `Saldo insuficiente em ${quoteCurrency} para nova compra`,
      }
    }

    const quantity = roundQuantity(quoteBudget / params.price)
    if (quantity <= QUANTITY_EPSILON) {
      return {
        shouldExecute: false,
        reason: 'Quantidade calculada ficou abaixo do mínimo operacional',
      }
    }

    return {
      shouldExecute: true,
      reason: [
        params.executionMode === 'semi_auto'
          ? 'Sugestão gerada para revisão manual'
          : 'Plano de compra pronto para execução',
        ...budgetNotes,
      ].join(' · '),
      quantity,
    }
  }

  const baseAvailable = balancesByCurrency.get(baseCurrency) ?? 0
  const baseBudget = params.maxTradeAmountUnit === 'percent'
    ? baseAvailable * (params.maxTradeAmount / 100)
    : Math.min(baseAvailable, params.maxTradeAmount / Math.max(params.price, 1e-8))

  const quantity = roundQuantity(baseBudget)
  if (quantity <= QUANTITY_EPSILON) {
    return {
      shouldExecute: false,
      reason: `Sem saldo disponível de ${baseCurrency} para venda`,
    }
  }

  return {
    shouldExecute: true,
    reason: params.executionMode === 'semi_auto' ? 'Sugestão de venda gerada para revisão manual' : 'Plano de venda pronto para execução',
    quantity,
  }
}

export async function runBotCycle(botId: string, userId: string): Promise<BotCycleResult | null> {
  if (processingBots.has(botId)) {
    return null
  }

  processingBots.add(botId)
  startTrace(userId, 'runBotCycle', 'bot')

  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        userId,
      },
      include: {
        template: true,
      },
    })

    if (!bot) {
      endTrace('runBotCycle', { userId, botId, errorFlag: true })
      return null
    }

    if (bot.isPaused || bot.status !== 'online') {
      const analysis = await analyzeBotInstance(userId, botId)
      if (!analysis) {
        endTrace('runBotCycle', { userId, botId, errorFlag: true })
        return null
      }

      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: (bot.executionMode as BotExecutionMode) || 'paper',
          status: 'skipped',
          reason: bot.isPaused ? 'Bot pausado; ciclo ignorado' : `Bot em status ${bot.status}; ciclo ignorado`,
        },
      }

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    if (await hasActiveTrainingSession(bot.id)) {
      const analysis = await analyzeBotInstance(userId, botId)
      if (!analysis) {
        endTrace('runBotCycle', { userId, botId, errorFlag: true })
        return null
      }

      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: (bot.executionMode as BotExecutionMode) || 'paper',
          status: 'skipped',
          reason: 'Treinamento ativo detectado; execução automática adiada',
        },
      }

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    const analysis = await analyzeBotInstance(userId, botId)
    if (!analysis) {
      endTrace('runBotCycle', { userId, botId, errorFlag: true })
      return null
    }

    const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
    const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
    const parameters = {
      ...templateParameters,
      ...instanceParameters,
    }
    const timeframe = resolveTimeframe(parameters)
    const configuration = await prisma.configuration.findUnique({
      where: { userId },
      select: {
        maxTradeAmount: true,
        maxTradeAmountUnit: true,
        allowedPairs: true,
        stopLossPercent: true,
        takeProfitPercent: true,
      },
    })
    const configuredAllowedPairs = normalizePairs(safeJsonParse(configuration?.allowedPairs, analysis.analyzedPairs))
    const allowedPairs = resolveEffectiveAllowedPairs(parameters, configuredAllowedPairs)
    const riskConfig = resolveRiskConfig(parameters, configuration)
    const riskDecision = await evaluateRiskDecision({
      userId,
      botId: bot.id,
      allowedPairs: allowedPairs.length > 0 ? allowedPairs : analysis.analyzedPairs,
      riskConfig,
    })
    const minimumConfidence = typeof parameters.minConfidence === 'number'
      ? parameters.minConfidence
      : DEFAULT_MIN_CONFIDENCE
    const executionMode = ((bot.executionMode || 'paper') as BotExecutionMode)
    const selectedOpportunity = riskDecision.overrideOpportunity ?? analysis.bestOpportunity
    const isRiskOverride = Boolean(riskDecision.overrideOpportunity)

    if (riskDecision.skipReason) {
      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: riskDecision.skipReason,
        },
      }

      logger.warn('[bot] Circuit breaker bloqueou o ciclo do bot', {
        module: 'bot',
        event: 'bot_cycle_risk_guard_skip',
        userId,
        botId: bot.id,
        botName: bot.name,
        reason: riskDecision.skipReason,
      })

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    if (!selectedOpportunity || selectedOpportunity.action === 'hold') {
      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: 'Nenhuma oportunidade forte o suficiente para execução neste ciclo',
        },
      }

      logger.info('[bot] Ciclo finalizado sem oportunidade executável', {
        module: 'bot',
        event: 'bot_cycle_no_action',
        userId,
        botId: bot.id,
        botName: bot.name,
      })

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    if (!isRiskOverride && selectedOpportunity.confidence < minimumConfidence) {
      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: `Confiança ${selectedOpportunity.confidence}% abaixo do mínimo configurado (${minimumConfidence}%)`,
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
        },
      }

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    if (!isRiskOverride && await isInCooldown(userId, bot.id, selectedOpportunity.pair, selectedOpportunity.action)) {
      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: 'Cooldown ativo para evitar repetição da mesma ordem no mesmo par',
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
        },
      }

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    let exchangeCredentials: Awaited<ReturnType<typeof getUserExchangeCredentials>> = null
    if (executionMode === 'full_auto') {
      exchangeCredentials = await getUserExchangeCredentials(userId)
      if (!exchangeCredentials) {
        const result: BotCycleResult = {
          botId: bot.id,
          botName: bot.name,
          generatedAt: new Date().toISOString(),
          analysis,
          execution: {
            mode: executionMode,
            status: 'skipped',
            reason: 'Credenciais da Binance não configuradas para modo full_auto',
            pair: selectedOpportunity.pair,
            action: selectedOpportunity.action,
          },
        }

        endTrace('runBotCycle', { userId, botId })
        return result
      }

      await reconcileOpenOrdersForUserSafely(userId)

      const openExchangeOrder = await prisma.transaction.findFirst({
        where: {
          userId,
          botId: bot.id,
          externalOrderId: { not: null },
          status: { in: ['pending', 'partially_filled'] },
        },
        orderBy: [
          { syncedAt: 'desc' },
          { date: 'desc' },
        ],
        select: {
          id: true,
          pair: true,
          status: true,
          requestedQuantity: true,
          quantity: true,
          externalStatus: true,
        },
      })

      if (openExchangeOrder) {
        const result: BotCycleResult = {
          botId: bot.id,
          botName: bot.name,
          generatedAt: new Date().toISOString(),
          analysis,
          execution: {
            mode: executionMode,
            status: 'skipped',
            reason: `Ainda existe uma ordem ${openExchangeOrder.status === 'partially_filled' ? 'parcialmente executada' : 'pendente'} em ${openExchangeOrder.pair}; o bot vai aguardar a reconciliação antes de abrir nova posição`,
            pair: openExchangeOrder.pair,
            action: selectedOpportunity.action,
            quantity: openExchangeOrder.requestedQuantity || openExchangeOrder.quantity || undefined,
          },
        }

        endTrace('runBotCycle', { userId, botId, currentPair: openExchangeOrder.pair, recommendedAction: selectedOpportunity.action, confidence: selectedOpportunity.confidence })
        return result
      }

      const liveBalancesBefore = await getAccountBalances(exchangeCredentials.apiKey, exchangeCredentials.secretKey, { forceRefresh: true })
      await syncExternalBalances(userId, liveBalancesBefore)
    }

    const tradePlan = await buildTradePlan({
      userId,
      pair: selectedOpportunity.pair,
      action: selectedOpportunity.action,
      executionMode,
      price: selectedOpportunity.price,
      maxTradeAmount: configuration?.maxTradeAmount ?? 1000,
      maxTradeAmountUnit: configuration?.maxTradeAmountUnit ?? 'USDT',
      riskConfig,
      timeframe,
    })

    if (!tradePlan.shouldExecute || !tradePlan.quantity) {
      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: tradePlan.reason,
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
        },
      }

      endTrace('runBotCycle', { userId, botId })
      return result
    }

    if (!isRiskOverride) {
      const portfolioRiskReason = await evaluatePortfolioRiskGuard({
        userId,
        pair: selectedOpportunity.pair,
        action: selectedOpportunity.action,
        quantity: tradePlan.quantity,
        price: selectedOpportunity.price,
        riskConfig,
        timeframe,
      })

      if (portfolioRiskReason) {
        const result: BotCycleResult = {
          botId: bot.id,
          botName: bot.name,
          generatedAt: new Date().toISOString(),
          analysis,
          execution: {
            mode: executionMode,
            status: 'skipped',
            reason: portfolioRiskReason,
            pair: selectedOpportunity.pair,
            action: selectedOpportunity.action,
            quantity: tradePlan.quantity,
          },
        }

        endTrace('runBotCycle', { userId, botId, currentPair: selectedOpportunity.pair, recommendedAction: selectedOpportunity.action, confidence: selectedOpportunity.confidence })
        return result
      }
    }

    if (executionMode === 'semi_auto') {
      logger.info('[bot] Sinal gerado para revisão manual', {
        module: 'bot',
        event: 'bot_signal_suggested',
        userId,
        botId: bot.id,
        botName: bot.name,
        pair: selectedOpportunity.pair,
        action: selectedOpportunity.action,
        confidence: selectedOpportunity.confidence,
        quantity: tradePlan.quantity,
      })

      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'suggested',
          reason: isRiskOverride ? selectedOpportunity.reason : tradePlan.reason,
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
          quantity: tradePlan.quantity,
        },
      }

      endTrace('runBotCycle', { userId, botId, currentPair: selectedOpportunity.pair, recommendedAction: selectedOpportunity.action, confidence: selectedOpportunity.confidence })
      return result
    }

    let transaction: ExecutedOrderPayload
    let executionStatus: BotCycleExecution['status'] = 'executed'
    let executionReason = executionMode === 'full_auto'
      ? 'Executado automaticamente em modo full_auto na Binance'
      : 'Executado automaticamente em modo paper'

    if (executionMode === 'full_auto' && exchangeCredentials) {
      const preparedOrder = await prepareSpotOrderRequest({
        pair: selectedOpportunity.pair,
        quantity: tradePlan.quantity,
        orderType: 'MARKET',
        referencePrice: selectedOpportunity.price,
      })

      if (!preparedOrder.isValid || !preparedOrder.quantity) {
        const result: BotCycleResult = {
          botId: bot.id,
          botName: bot.name,
          generatedAt: new Date().toISOString(),
          analysis,
          execution: {
            mode: executionMode,
            status: 'skipped',
            reason: preparedOrder.rejectionReason ?? 'A ordem não atendeu aos filtros da Binance',
            pair: selectedOpportunity.pair,
            action: selectedOpportunity.action,
          },
        }

        logger.warn('[bot] Ordem bloqueada pelos filtros da Binance', {
          module: 'bot',
          event: 'bot_cycle_binance_filter_skip',
          userId,
          botId: bot.id,
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
          quantity: tradePlan.quantity,
          reason: preparedOrder.rejectionReason,
          adjustments: preparedOrder.adjustments,
        })

        endTrace('runBotCycle', { userId, botId, currentPair: selectedOpportunity.pair, recommendedAction: selectedOpportunity.action, confidence: selectedOpportunity.confidence })
        return result
      }

      const liveOrder = await createSpotOrder(exchangeCredentials.apiKey, exchangeCredentials.secretKey, {
        pair: selectedOpportunity.pair,
        side: selectedOpportunity.action === 'buy' ? 'BUY' : 'SELL',
        quantity: preparedOrder.quantity,
      })

      const requestedQuantity = roundQuantity(Number(liveOrder.origQty || preparedOrder.quantity || tradePlan.quantity))
      const executedQuantity = roundQuantity(Number(liveOrder.executedQty || 0))
      const executedTotal = Number(liveOrder.cummulativeQuoteQty || (executedQuantity * selectedOpportunity.price))
      const executedPrice = executedQuantity > QUANTITY_EPSILON && executedTotal > QUANTITY_EPSILON
        ? (executedTotal / executedQuantity)
        : selectedOpportunity.price
      const localOrderStatus = mapBinanceOrderStatusToLocalStatus(liveOrder.status, executedQuantity)
      const syncedAt = new Date(liveOrder.updateTime || liveOrder.transactTime || Date.now())

      if (localOrderStatus === 'executed' && (!Number.isFinite(executedQuantity) || executedQuantity <= QUANTITY_EPSILON)) {
        throw new Error('A Binance não retornou quantidade executada válida para a ordem do bot')
      }

      const { quoteCurrency } = getPairCurrencies(selectedOpportunity.pair)
      const liveFee = await extractBinanceFeeBreakdown({
        fills: liveOrder.fills,
        quoteCurrency,
        totalValue: executedTotal,
      })

      if (localOrderStatus === 'executed') {
        transaction = await executeOrderForUser({
          userId,
          pair: selectedOpportunity.pair,
          type: selectedOpportunity.action,
          quantity: executedQuantity,
          requestedQuantity,
          orderType: 'market',
          price: executedPrice,
          totalOverride: executedTotal,
          feeOverride: liveFee.fee,
          feeCurrencyOverride: liveFee.feeCurrency,
          feeRateAppliedOverride: liveFee.feeRateApplied,
          feeDiscountSourceOverride: liveFee.feeDiscountSource,
          feeInQuoteOverride: liveFee.feeInQuote,
          origin: 'bot',
          botId: bot.id,
          statusOverride: localOrderStatus,
          externalOrderId: String(liveOrder.orderId),
          externalClientOrderId: liveOrder.clientOrderId,
          externalStatus: liveOrder.status,
          syncedAt,
        })
      } else {
        transaction = await upsertExchangeOrderSnapshot({
          userId,
          pair: selectedOpportunity.pair,
          type: selectedOpportunity.action,
          origin: 'bot',
          botId: bot.id,
          orderType: 'market',
          requestedQuantity,
          executedQuantity,
          price: executedPrice,
          total: executedTotal,
          fee: liveFee.fee ?? 0,
          feeInQuote: liveFee.feeInQuote,
          feeCurrency: liveFee.feeCurrency || quoteCurrency,
          feeRateApplied: liveFee.feeRateApplied ?? 0,
          feeDiscountSource: liveFee.feeDiscountSource,
          externalOrderId: String(liveOrder.orderId),
          externalClientOrderId: liveOrder.clientOrderId,
          externalStatus: liveOrder.status,
          status: localOrderStatus,
          syncedAt,
        })

        executionStatus = 'submitted'
      }

      const liveBalancesAfter = await getAccountBalances(exchangeCredentials.apiKey, exchangeCredentials.secretKey, { forceRefresh: true })
      await syncExternalBalances(userId, liveBalancesAfter)
      await recordBalanceHistorySnapshot(userId, liveBalancesAfter.map((balance) => ({
        currency: balance.currency,
        available: balance.available,
      }))).catch((snapshotError) => {
        logger.warn('[bot] Falha ao registrar snapshot após ordem real do bot', {
          module: 'bot',
          event: 'bot_cycle_live_balance_snapshot_failed',
          userId,
          botId: bot.id,
          error: snapshotError,
          skipPersistence: true,
        })
      })

      if (localOrderStatus === 'executed') {
        executionReason = isRiskOverride
          ? `${selectedOpportunity.reason} · ordem real executada na Binance`
          : 'Executado automaticamente em modo full_auto na Binance'
      } else if (localOrderStatus === 'partially_filled') {
        executionReason = 'Ordem enviada para Binance e executada parcialmente; aguardando reconciliação dos próximos fills'
      } else if (localOrderStatus === 'pending') {
        executionReason = 'Ordem enviada para Binance e registrada como pendente; o bot vai acompanhar a execução antes de abrir nova posição'
      } else if (localOrderStatus === 'cancelled') {
        executionReason = 'A Binance retornou a ordem do bot como cancelada; a posição não foi aberta por completo'
      } else {
        executionReason = 'A Binance rejeitou a ordem enviada pelo bot; nenhuma posição nova foi confirmada'
      }

      if (preparedOrder.adjustments.length > 0) {
        executionReason = `${executionReason} · ${preparedOrder.adjustments.join(' · ')}`
      }
    } else {
      transaction = await executeOrderForUser({
        userId,
        pair: selectedOpportunity.pair,
        type: selectedOpportunity.action,
        quantity: tradePlan.quantity,
        orderType: 'market',
        price: selectedOpportunity.price,
        origin: 'bot',
        botId: bot.id,
      })

      if (isRiskOverride) {
        executionReason = `${selectedOpportunity.reason} · ordem executada em modo paper`
      }
    }

    logger.info('[bot] Ordem automatizada executada pelo ciclo do bot', {
      module: 'bot',
      event: executionMode === 'full_auto'
        ? (executionStatus === 'executed' ? 'bot_cycle_order_executed_full_auto' : 'bot_cycle_order_submitted_full_auto')
        : 'bot_cycle_order_executed_paper',
      userId,
      botId: bot.id,
      botName: bot.name,
      pair: selectedOpportunity.pair,
      action: selectedOpportunity.action,
      confidence: selectedOpportunity.confidence,
      quantity: transaction.requestedQuantity ?? transaction.quantity,
      transactionId: transaction.id,
      transactionStatus: transaction.status,
    })

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: executionStatus === 'executed' ? 'bot_cycle_executed' : 'bot_cycle_submitted',
      botId: bot.id,
      updatedAt: new Date().toISOString(),
    })

    const result: BotCycleResult = {
      botId: bot.id,
      botName: bot.name,
      generatedAt: new Date().toISOString(),
      analysis,
      execution: {
        mode: executionMode,
        status: executionStatus,
        reason: executionReason,
        pair: selectedOpportunity.pair,
        action: selectedOpportunity.action,
        quantity: transaction.requestedQuantity ?? transaction.quantity,
        transaction,
      },
    }

    trace('DEBUG', 'bot', 'runBotCycle', 'Ciclo do bot executou ordem com sucesso', 0, {
      userId,
      botId: bot.id,
      currentPair: selectedOpportunity.pair,
      recommendedAction: selectedOpportunity.action,
      confidence: selectedOpportunity.confidence,
    })
    endTrace('runBotCycle', { userId, botId, currentPair: selectedOpportunity.pair, recommendedAction: selectedOpportunity.action, confidence: selectedOpportunity.confidence })
    return result
  } catch (error) {
    logger.error('[bot] Erro ao executar ciclo do bot', {
      module: 'bot',
      event: 'bot_cycle_error',
      userId,
      botId,
      error,
    })

    endTrace('runBotCycle', { userId, botId, errorFlag: true })
    throw error
  } finally {
    processingBots.delete(botId)
  }
}

export async function processBotQueueCycle(): Promise<void> {
  const bots = await prisma.bot.findMany({
    where: {
      userId: { not: null },
      status: 'online',
      isPaused: false,
    },
    select: {
      id: true,
      userId: true,
    },
  })

  for (const bot of bots) {
    if (!bot.userId || processingBots.has(bot.id)) {
      continue
    }

    try {
      await runBotCycle(bot.id, bot.userId)
    } catch {
      // O erro já é logado dentro de runBotCycle.
    }
  }
}

export async function processOpenExchangeOrdersCycle(): Promise<void> {
  const usersWithOpenOrders = await prisma.transaction.findMany({
    where: {
      externalOrderId: { not: null },
      status: { in: ['pending', 'partially_filled'] },
    },
    distinct: ['userId'],
    select: {
      userId: true,
    },
  })

  for (const { userId } of usersWithOpenOrders) {
    if (!userId) {
      continue
    }

    await reconcileOpenOrdersForUserSafely(userId)
  }
}

async function runWorkerCycleSafely(): Promise<void> {
  if (isCycleRunning) {
    return
  }

  isCycleRunning = true

  try {
    await processOpenExchangeOrdersCycle()
    await processBotQueueCycle()
  } finally {
    isCycleRunning = false
  }
}

export function startBotWorker(): void {
  if (workerInterval) {
    return
  }

  workerInterval = setInterval(() => {
    void runWorkerCycleSafely()
  }, BOT_WORKER_POLL_MS)

  workerInterval.unref?.()

  logger.info('[bot] Worker de bots iniciado', {
    module: 'bot',
    event: 'bot_worker_started',
    pollIntervalMs: BOT_WORKER_POLL_MS,
  })

  void runWorkerCycleSafely()
}

export function stopBotWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }
}

export function isBotWorkerRunning(): boolean {
  return Boolean(workerInterval)
}
