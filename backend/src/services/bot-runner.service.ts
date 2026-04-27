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
import {
  evaluatePendingBotDecisions,
  recordBotDecision,
  resolveBotOperationalReadiness,
} from './bot-decision.service'
import {
  autoPromoteRecommendedBotModel,
  resolveBotFullAutoEligibility,
} from './bot-governance-policy.service'
import { buildStrategyId } from './bot-registry.service'
import { signUserAccessToken } from './auth-token.service'
import { getInternalApiBaseUrl } from './internal-api-base-url.service'
import { getCurrencyRateToBrl } from './market-valuation.service'
import { recordBalanceHistorySnapshot } from './portfolio.service'
import { resolveTrainingModelArtifactPath } from './training-model.service'
import {
  runPythonBotCycle,
  type PythonBotCycleBalance,
  type PythonBotCyclePlanItem,
  type PythonBotCyclePlanResult,
  type PythonBotCyclePosition,
  type PythonBotRuntimeOpportunity,
  type PythonBotRuntimeResult,
} from './python-bot-runtime.service'
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
  rank?: number
  source?: 'analysis' | 'risk_override'
}

export interface BotCycleResult {
  botId: string
  botName: string
  generatedAt: string
  analysis: BotAnalysisResponse
  execution: BotCycleExecution
  plans?: BotCycleExecution[]
}

export interface BotRuntimeQueueItem {
  botId: string
  botName: string
  userId: string
  executionMode: BotExecutionMode
  status: string
  isPaused: boolean
}

export interface BotRuntimeCycleContext {
  botId: string
  botName: string
  userId: string
  generatedAt: string
  payload: Parameters<typeof runPythonBotCycle>[0]
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
const DEFAULT_PAPER_SLIPPAGE_PERCENT = Math.max(0, Number(process.env.BOT_PAPER_SLIPPAGE_PERCENT || 0.12))
const DEFAULT_PAPER_LATENCY_MS = Math.max(0, Number(process.env.BOT_PAPER_LATENCY_MS || 350))
const DEFAULT_PAPER_MIN_FILL_PERCENT = clampPaperFillPercent(Number(process.env.BOT_PAPER_MIN_FILL_PERCENT || 0.88))

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

function clampPaperFillPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.88
  }

  return clampNumber(value, 0.5, 1)
}

function buildPaperSimulation(params: {
  action: 'buy' | 'sell'
  confidence: number
  requestedQuantity: number
  referencePrice: number
}) {
  const uncertaintyFactor = clampNumber((100 - params.confidence) / 100, 0, 1)
  const slippagePercent = clampNumber(
    DEFAULT_PAPER_SLIPPAGE_PERCENT + (uncertaintyFactor * 0.18),
    DEFAULT_PAPER_SLIPPAGE_PERCENT,
    0.6,
  )
  const simulatedFillPercent = clampNumber(1 - (uncertaintyFactor * 0.22), DEFAULT_PAPER_MIN_FILL_PERCENT, 1)
  const executedQuantity = roundQuantity(params.requestedQuantity * simulatedFillPercent)
  const safeExecutedQuantity = executedQuantity > QUANTITY_EPSILON
    ? executedQuantity
    : roundQuantity(params.requestedQuantity)
  const priceFactor = params.action === 'buy'
    ? 1 + (slippagePercent / 100)
    : Math.max(1e-6, 1 - (slippagePercent / 100))

  return {
    requestedQuantity: roundQuantity(params.requestedQuantity),
    executedQuantity: safeExecutedQuantity,
    executionPrice: Number((params.referencePrice * priceFactor).toFixed(8)),
    slippagePercent: Number(slippagePercent.toFixed(4)),
    simulatedLatencyMs: Math.round(DEFAULT_PAPER_LATENCY_MS + (uncertaintyFactor * 400)),
    simulatedFillPercent: Number(simulatedFillPercent.toFixed(4)),
  }
}

function normalizePlanStatus(status: 'skipped' | 'suggested' | 'execute'): BotCycleExecution['status'] {
  return status === 'execute' ? 'executed' : status
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

function resolveMaxPairsToAnalyze(parameters: Record<string, unknown>): number | undefined {
  const configuredLimit = typeof parameters.maxPairsToAnalyze === 'number'
    ? parameters.maxPairsToAnalyze
    : undefined

  if (typeof configuredLimit !== 'number' || !Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return undefined
  }

  return Math.min(Math.round(configuredLimit), 500)
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
      total: true,
    },
  })

  if (balances.length === 0) {
    return 0
  }

  const rateEntries = await Promise.all(
    balances.map(async (balance) => {
      const rate = await getCurrencyRateToBrl(balance.currency).catch(() => 0)
      const quantity = typeof balance.total === 'number'
        ? balance.total
        : balance.available
      return rate * quantity
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

async function hasActiveTrainingSession(userId: string, botId: string): Promise<boolean> {
  const activeSession = await prisma.trainingSession.findFirst({
    where: {
      userId,
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

async function loadBotForCycle(botId: string, userId: string) {
  return prisma.bot.findFirst({
    where: {
      id: botId,
      userId,
    },
    include: {
      template: true,
    },
  })
}

function buildBotAnalysisFromCycleResult(params: {
  bot: Awaited<ReturnType<typeof loadBotForCycle>>
  strategyId: string
  cycleGeneratedAt: string
  cycleResult: PythonBotCyclePlanResult
}): BotAnalysisResponse {
  const { bot, strategyId, cycleGeneratedAt, cycleResult } = params
  if (!bot) {
    throw new Error('Bot não encontrado ao mapear análise do ciclo')
  }

  return {
    botId: bot.id,
    botName: bot.name,
    strategyId,
    templateId: bot.template?.id ?? undefined,
    templateName: bot.template?.name ?? undefined,
    primarySpecialist: cycleResult.analysis.primarySpecialist,
    timeframe: cycleResult.analysis.timeframe,
    generatedAt: cycleGeneratedAt,
    analyzedPairs: cycleResult.analysis.analyzedPairs,
    summary: cycleResult.analysis.summary,
    bestOpportunity: cycleResult.analysis.bestOpportunity ? {
      pair: cycleResult.analysis.bestOpportunity.pair,
      action: cycleResult.analysis.bestOpportunity.action,
      confidence: cycleResult.analysis.bestOpportunity.confidence,
      price: cycleResult.analysis.bestOpportunity.price,
      reason: cycleResult.analysis.bestOpportunity.reason,
      specialists: cycleResult.analysis.bestOpportunity.specialists.map((specialist) => ({
        specialist: specialist.specialist,
        action: specialist.action,
        confidence: specialist.confidence,
        reason: specialist.reason,
        indicators: specialist.indicators,
      })),
    } : undefined,
    opportunities: cycleResult.analysis.opportunities.map((opportunity) => ({
      pair: opportunity.pair,
      action: opportunity.action,
      confidence: opportunity.confidence,
      price: opportunity.price,
      reason: opportunity.reason,
      specialists: opportunity.specialists.map((specialist) => ({
        specialist: specialist.specialist,
        action: specialist.action,
        confidence: specialist.confidence,
        reason: specialist.reason,
        indicators: specialist.indicators,
      })),
    })),
    socialSignals: cycleResult.analysis.socialSignals.slice(0, 5),
  }
}

function buildBotCyclePlans(
  executionMode: BotExecutionMode,
  cycleResult: PythonBotCyclePlanResult,
): BotCycleExecution[] {
  return (cycleResult.plans ?? []).map((plan) => ({
    mode: executionMode,
    status: normalizePlanStatus(plan.status),
    reason: plan.reason,
    pair: plan.pair,
    action: plan.action as 'buy' | 'sell' | 'hold' | undefined,
    quantity: plan.quantity,
    rank: plan.rank,
    source: plan.source,
  }))
}

function summarizeBalancesForTrace(balances: PythonBotCycleBalance[]): Array<{
  currency: string
  available: number
  total: number
}> {
  return balances
    .filter((balance) => balance.total > QUANTITY_EPSILON || balance.available > QUANTITY_EPSILON)
    .sort((left, right) => right.total - left.total)
    .slice(0, 8)
    .map((balance) => ({
      currency: balance.currency,
      available: Number(balance.available.toFixed(8)),
      total: Number(balance.total.toFixed(8)),
    }))
}

function summarizePositionsForTrace(openPositions: PythonBotCyclePosition[]): Array<{
  pair: string
  quantity: number
  pnlPercent: number
  exposureBrl: number
}> {
  return openPositions.slice(0, 8).map((position) => ({
    pair: position.pair,
    quantity: Number(position.quantity.toFixed(8)),
    pnlPercent: Number(position.pnlPercent.toFixed(4)),
    exposureBrl: Number(position.exposureBrl.toFixed(2)),
  }))
}

function summarizeOpportunityForTrace(
  opportunity: (
    Pick<PythonBotRuntimeOpportunity, 'pair' | 'action' | 'confidence' | 'price' | 'reason'>
    & { specialists?: PythonBotRuntimeOpportunity['specialists'] }
  ) | null | undefined,
) {
  if (!opportunity) {
    return null
  }

  return {
    pair: opportunity.pair,
    action: opportunity.action,
    confidence: Number(opportunity.confidence.toFixed(2)),
    price: Number(opportunity.price.toFixed(8)),
    reason: opportunity.reason,
    specialists: (opportunity.specialists ?? []).slice(0, 3).map((specialist) => ({
      specialist: specialist.specialist,
      action: specialist.action,
      confidence: Number(specialist.confidence.toFixed(2)),
      indicators: Object.fromEntries(
        Object.entries(specialist.indicators)
          .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
          .slice(0, 6),
      ),
    })),
  }
}

function summarizePlanForTrace(plan: PythonBotCyclePlanItem | null | undefined) {
  if (!plan) {
    return null
  }

  return {
    status: plan.status,
    reason: plan.reason,
    pair: plan.pair,
    action: plan.action,
    confidence: typeof plan.confidence === 'number' ? Number(plan.confidence.toFixed(2)) : undefined,
    decisionPrice: typeof plan.decisionPrice === 'number' ? Number(plan.decisionPrice.toFixed(8)) : undefined,
    quantity: typeof plan.quantity === 'number' ? Number(plan.quantity.toFixed(8)) : undefined,
    isRiskOverride: Boolean(plan.isRiskOverride),
    source: plan.source,
    rank: plan.rank,
    paperSimulation: plan.paperSimulation
      ? {
          requestedQuantity: Number(plan.paperSimulation.requestedQuantity.toFixed(8)),
          executedQuantity: Number(plan.paperSimulation.executedQuantity.toFixed(8)),
          executionPrice: Number(plan.paperSimulation.executionPrice.toFixed(8)),
          slippagePercent: Number(plan.paperSimulation.slippagePercent.toFixed(4)),
          simulatedLatencyMs: plan.paperSimulation.simulatedLatencyMs,
          simulatedFillPercent: Number(plan.paperSimulation.simulatedFillPercent.toFixed(4)),
        }
      : undefined,
  }
}

function summarizeRuntimeAnalysisForTrace(analysis: PythonBotRuntimeResult) {
  return {
    timeframe: analysis.timeframe,
    primarySpecialist: analysis.primarySpecialist,
    summary: analysis.summary,
    analyzedPairs: analysis.analyzedPairs.slice(0, 10),
    bestOpportunity: summarizeOpportunityForTrace(analysis.bestOpportunity ?? undefined),
    topOpportunities: analysis.opportunities.slice(0, 5).map((opportunity) => summarizeOpportunityForTrace(opportunity)),
    socialSignals: analysis.socialSignals.slice(0, 5).map((signal) => ({
      pair: signal.pair,
      score: Number(signal.score.toFixed(2)),
      mentions: signal.mentions,
      sentiment: signal.sentiment,
    })),
  }
}

export async function listBotRuntimeQueue(): Promise<BotRuntimeQueueItem[]> {
  const bots = await prisma.bot.findMany({
    where: {
      userId: { not: null },
      status: 'online',
      isPaused: false,
    },
    orderBy: [
      { updatedAt: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      userId: true,
      name: true,
      executionMode: true,
      status: true,
      isPaused: true,
    },
  })

  return bots
    .filter((bot): bot is typeof bot & { userId: string } => Boolean(bot.userId))
    .map((bot) => ({
      botId: bot.id,
      botName: bot.name,
      userId: bot.userId,
      executionMode: (bot.executionMode as BotExecutionMode) || 'paper',
      status: bot.status,
      isPaused: bot.isPaused,
    }))
}

export async function buildBotRuntimeCycleContext(
  botId: string,
  userId?: string,
): Promise<BotRuntimeCycleContext | null> {
  const bot = await prisma.bot.findFirst({
    where: {
      id: botId,
      ...(userId ? { userId } : { userId: { not: null } }),
    },
    include: {
      template: true,
    },
  })

  if (!bot?.userId) {
    return null
  }

  if (bot.isPaused || bot.status !== 'online') {
    return null
  }

  if (await hasActiveTrainingSession(bot.userId, bot.id)) {
    return null
  }

  const autoPromotion = await autoPromoteRecommendedBotModel({
    userId: bot.userId,
    botId: bot.id,
    currentBotModelUrl: bot.modelUrl,
  })

  if (autoPromotion.applied && autoPromotion.artifact) {
    bot.modelUrl = autoPromotion.artifact.modelUrl
    bot.modelVersion = autoPromotion.artifact.modelVersion

    logger.info('[bot] Challenger promovido automaticamente para champion antes do ciclo', {
      module: 'bot',
      event: 'bot_cycle_auto_model_promotion_applied',
      userId: bot.userId,
      botId: bot.id,
      promotedArtifactId: autoPromotion.artifact.id,
      promotedModelVersion: autoPromotion.artifact.modelVersion,
      promotedModelUrl: autoPromotion.artifact.modelUrl,
      recommendationReason: autoPromotion.recommendation?.reason,
    })
  }

  const modelReadiness = await resolveBotOperationalReadiness(bot.modelUrl)
  if (!modelReadiness.modelReady) {
    return null
  }

  const executionMode = ((bot.executionMode || 'paper') as BotExecutionMode)
  const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
  const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
  const parameters = {
    ...templateParameters,
    ...instanceParameters,
  }
  const timeframe = resolveTimeframe(parameters)
  const configuration = await prisma.configuration.findUnique({
    where: { userId: bot.userId },
    select: {
      maxTradeAmount: true,
      maxTradeAmountUnit: true,
      allowedPairs: true,
      stopLossPercent: true,
      takeProfitPercent: true,
    },
  })
  const configuredAllowedPairs = normalizePairs(safeJsonParse(configuration?.allowedPairs, []))
  const allowedPairs = resolveEffectiveAllowedPairs(parameters, configuredAllowedPairs)
  const effectiveAllowedPairs = allowedPairs.length > 0 ? allowedPairs : configuredAllowedPairs
  const riskConfig = resolveRiskConfig(parameters, configuration)
  const minimumConfidence = typeof parameters.minConfidence === 'number'
    ? parameters.minConfidence
    : DEFAULT_MIN_CONFIDENCE
  let exchangeCredentials: Awaited<ReturnType<typeof getUserExchangeCredentials>> = null
  let fullAutoBuyBlockReason: string | undefined
  let openExchangeOrder: {
    pair: string
    status: string
    requestedQuantity: number | null
    quantity: number
    externalStatus: string | null
  } | null = null

  if (executionMode === 'full_auto') {
    exchangeCredentials = await getUserExchangeCredentials(bot.userId)
    const fullAutoEligibility = await resolveBotFullAutoEligibility({
      userId: bot.userId,
      botId: bot.id,
      currentBotModelUrl: bot.modelUrl,
    })
    if (!fullAutoEligibility.eligible) {
      fullAutoBuyBlockReason = fullAutoEligibility.blockers[0]
        ?? 'O champion atual ainda não atende aos critérios mínimos para abrir novas posições em full_auto.'
    }

    if (exchangeCredentials) {
      await reconcileOpenOrdersForUserSafely(bot.userId)
      openExchangeOrder = await prisma.transaction.findFirst({
        where: {
          userId: bot.userId,
          botId: bot.id,
          externalOrderId: { not: null },
          status: { in: ['pending', 'partially_filled'] },
        },
        orderBy: [
          { syncedAt: 'desc' },
          { date: 'desc' },
        ],
        select: {
          pair: true,
          status: true,
          requestedQuantity: true,
          quantity: true,
          externalStatus: true,
        },
      })

      const liveBalancesBefore = await getAccountBalances(exchangeCredentials.apiKey, exchangeCredentials.secretKey, { forceRefresh: true })
      await syncExternalBalances(bot.userId, liveBalancesBefore)
    }
  }

  const [balances, recentSellTransactions, recentExecutions, exposureSnapshot, openPositionsRaw, user] = await Promise.all([
    prisma.balance.findMany({
      where: { userId: bot.userId },
      select: {
        currency: true,
        available: true,
        reserved: true,
        total: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId: bot.userId,
        botId: bot.id,
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
    }),
    prisma.transaction.findMany({
      where: {
        userId: bot.userId,
        botId: bot.id,
        status: 'executed',
      },
      orderBy: { date: 'desc' },
      take: 50,
      select: {
        pair: true,
        type: true,
        date: true,
      },
    }),
    getPortfolioExposureSnapshot(bot.userId).catch(() => ({
      totalPortfolioBrl: 0,
      totalExposureBrl: 0,
      openPositionsCount: 0,
      pairExposureBrl: new Map<string, number>(),
    })),
    Promise.all((effectiveAllowedPairs.length > 0 ? effectiveAllowedPairs : configuredAllowedPairs).map(async (pair) => {
      try {
        const currentPrice = await getTickerPrice(pair)
        const position = await getOpenPositionSnapshot(bot.userId!, pair, currentPrice)
        if (!position) {
          return null
        }

        return {
          ...position,
          exposureBrl: 0,
        }
      } catch {
        return null
      }
    })),
    prisma.user.findUnique({
      where: { id: bot.userId },
      select: {
        email: true,
      },
    }).catch(() => null),
  ])

  const openPositions = openPositionsRaw
    .filter((position): position is (OpenPositionSnapshot & { exposureBrl: number }) => position !== null)
    .map((position) => ({
      ...position,
      exposureBrl: exposureSnapshot.pairExposureBrl.get(position.pair) ?? 0,
    }))

  const strategyType = bot.template?.strategyType ?? bot.strategyType
  const strategyId = bot.template?.id ?? buildStrategyId(strategyType)
  const cycleGeneratedAt = new Date().toISOString()
  const pairLimit = resolveMaxPairsToAnalyze(parameters)
  const payload: BotRuntimeCycleContext['payload'] = {
    backend: {
      baseUrl: getInternalApiBaseUrl(),
      accessToken: signUserAccessToken({
        id: bot.userId,
        email: user?.email ?? '',
      }),
      runtimeKey: process.env.BOT_RUNTIME_SHARED_SECRET || undefined,
      timeoutSeconds: Number(process.env.PYTHON_BOT_RUNTIME_TIMEOUT_SECONDS ?? 15),
    },
    bot: {
      id: bot.id,
      name: bot.name,
      strategyType,
      strategyId,
      indicatorType: bot.template?.indicatorType ?? undefined,
      specialization: bot.template?.specialization ?? undefined,
      parameters,
      allowedPairs: effectiveAllowedPairs.length > 0 ? effectiveAllowedPairs : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      focusPair: bot.focusPair ?? undefined,
      currentPair: bot.currentPair ?? undefined,
      minMentions: typeof parameters.minMentions === 'number' ? parameters.minMentions : undefined,
      minSocialScore: typeof parameters.minSocialScore === 'number' ? parameters.minSocialScore : undefined,
      timeframe,
      modelArtifactPath: bot.modelUrl ? resolveTrainingModelArtifactPath(bot.modelUrl) : undefined,
    },
    pairLimit,
    includeSocialOverlay: true,
    cycle: {
      executionMode,
      minimumConfidence,
      maxTradeAmount: configuration?.maxTradeAmount ?? 1000,
      maxTradeAmountUnit: configuration?.maxTradeAmountUnit ?? 'USDT',
      riskConfig: { ...riskConfig },
      balances,
      openPositions,
      portfolio: {
        totalPortfolioBrl: exposureSnapshot.totalPortfolioBrl,
        totalExposureBrl: exposureSnapshot.totalExposureBrl,
        openPositionsCount: exposureSnapshot.openPositionsCount,
      },
      recentSellTransactions: recentSellTransactions.map((transaction) => ({
        date: transaction.date.toISOString(),
        profitBrl: transaction.profitBrl ?? 0,
      })),
      recentExecutions: recentExecutions
        .filter((transaction) => transaction.type === 'buy' || transaction.type === 'sell')
        .map((transaction) => ({
          pair: transaction.pair,
          action: transaction.type as 'buy' | 'sell',
          executedAt: transaction.date.toISOString(),
        })),
      tradeCooldownMs: BOT_TRADE_COOLDOWN_MS,
      fullAutoBuyBlockReason,
      exchangeCredentialsReady: Boolean(exchangeCredentials),
      openExchangeOrder: openExchangeOrder
        ? {
            pair: openExchangeOrder.pair,
            status: openExchangeOrder.status,
            requestedQuantity: openExchangeOrder.requestedQuantity ?? undefined,
            quantity: openExchangeOrder.quantity ?? undefined,
            externalStatus: openExchangeOrder.externalStatus ?? undefined,
          }
        : null,
    },
  }

  trace('INFO', 'bot', 'buildBotRuntimeCycleContext', 'Contexto do ciclo do bot preparado', 0, {
    userId: bot.userId,
    botId: bot.id,
    currentPair: bot.currentPair,
    recommendedAction: bot.recommendedAction,
    confidence: bot.confidence,
    stage: 'cycle_context_ready',
    snapshot: {
      generatedAt: cycleGeneratedAt,
      executionMode,
      timeframe,
      pairLimit,
      allowedPairsCount: payload.bot.allowedPairs.length,
      allowedPairsPreview: payload.bot.allowedPairs.slice(0, 8),
      modelReadiness: {
        modelReady: modelReadiness.modelReady,
        modelVersion: modelReadiness.modelVersion,
        modelUrl: modelReadiness.modelUrl,
        modelArchitecture: modelReadiness.modelArchitecture,
        validationStrategy: modelReadiness.validationStrategy,
        forecastHorizonCandles: modelReadiness.forecastHorizonCandles,
      },
      riskConfig,
      balances: summarizeBalancesForTrace(balances),
      portfolio: payload.cycle.portfolio,
      openPositions: summarizePositionsForTrace(openPositions),
      recentExecutionsCount: payload.cycle.recentExecutions.length,
      recentSellTransactionsCount: payload.cycle.recentSellTransactions.length,
      exchangeCredentialsReady: payload.cycle.exchangeCredentialsReady,
      fullAutoBuyBlockReason: payload.cycle.fullAutoBuyBlockReason,
      openExchangeOrder: payload.cycle.openExchangeOrder,
    },
  })

  return {
    botId: bot.id,
    botName: bot.name,
    userId: bot.userId,
    generatedAt: cycleGeneratedAt,
    payload,
  }
}

export async function applyBotRuntimeCycleResult(params: {
  botId: string
  userId: string
  cycleResult: PythonBotCyclePlanResult
  cycleGeneratedAt?: string
}): Promise<BotCycleResult | null> {
  const bot = await loadBotForCycle(params.botId, params.userId)
  if (!bot) {
    return null
  }

  const executionMode = ((bot.executionMode || 'paper') as BotExecutionMode)
  const modelReadiness = await resolveBotOperationalReadiness(bot.modelUrl)
  const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
  const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
  const parameters = {
    ...templateParameters,
    ...instanceParameters,
  }
  const timeframe = resolveTimeframe(parameters)
  const cycleGeneratedAt = params.cycleGeneratedAt ?? new Date().toISOString()

  const analysis = buildBotAnalysisFromCycleResult({
    bot,
    strategyId: bot.template?.id ?? buildStrategyId(bot.template?.strategyType ?? bot.strategyType),
    cycleGeneratedAt,
    cycleResult: params.cycleResult,
  })
  const cyclePlans = buildBotCyclePlans(executionMode, params.cycleResult)
  const primaryPlannedOpportunity = cyclePlans.find((plan) => plan.status !== 'skipped')
    ?? cyclePlans[0]
    ?? undefined
  const actionableOpportunity = analysis.opportunities.find((opportunity) => opportunity.action !== 'hold')

  await prisma.bot.update({
    where: { id: bot.id },
    data: {
      focusPair: primaryPlannedOpportunity?.pair ?? actionableOpportunity?.pair ?? bot.focusPair ?? null,
      currentPair: analysis.bestOpportunity?.pair ?? null,
      recommendedAction: analysis.bestOpportunity?.action ?? 'hold',
      confidence: analysis.bestOpportunity?.confidence ?? 0,
      lastAnalysis: new Date(cycleGeneratedAt),
      updatedAt: new Date(cycleGeneratedAt),
    },
  }).catch(() => undefined)

  emitDashboardUpdate(params.userId, {
    scope: 'bots',
    reason: 'bot_analysis_refreshed',
    botId: bot.id,
    updatedAt: cycleGeneratedAt,
  })

  if (bot.isPaused || bot.status !== 'online') {
    trace('WARN', 'bot', 'applyBotRuntimeCycleResult', 'Aplicacao do ciclo ignorada por status operacional do bot', 0, {
      userId: params.userId,
      botId: bot.id,
      stage: 'execution_skipped',
      snapshot: {
        botStatus: bot.status,
        isPaused: bot.isPaused,
      },
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: bot.isPaused ? 'Bot pausado; aplicação do ciclo ignorada' : `Bot em status ${bot.status}; aplicação do ciclo ignorada`,
      },
    }
  }

  if (await hasActiveTrainingSession(params.userId, bot.id)) {
    trace('WARN', 'bot', 'applyBotRuntimeCycleResult', 'Aplicacao do ciclo adiada por treinamento ativo', 0, {
      userId: params.userId,
      botId: bot.id,
      stage: 'execution_skipped',
      snapshot: {
        activeTrainingSession: true,
      },
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: 'Treinamento ativo detectado; execução automática adiada',
      },
    }
  }

  if (!modelReadiness.modelReady) {
    trace('WARN', 'bot', 'applyBotRuntimeCycleResult', 'Aplicacao do ciclo bloqueada por modelo nao operacional', 0, {
      userId: params.userId,
      botId: bot.id,
      stage: 'execution_blocked_model',
      snapshot: {
        modelReady: modelReadiness.modelReady,
        operationalBlockReason: modelReadiness.operationalBlockReason,
        modelVersion: modelReadiness.modelVersion,
        modelUrl: modelReadiness.modelUrl,
      },
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: modelReadiness.operationalBlockReason ?? 'Bot sem modelo executável para operação contínua',
        pair: analysis.bestOpportunity?.pair,
        action: analysis.bestOpportunity?.action,
      },
    }
  }

  const configuration = await prisma.configuration.findUnique({
    where: { userId: params.userId },
    select: {
      maxTradeAmount: true,
      maxTradeAmountUnit: true,
    },
  })

  let exchangeCredentials: Awaited<ReturnType<typeof getUserExchangeCredentials>> = null
  let openExchangeOrder: {
    pair: string
    status: string
    requestedQuantity: number | null
    quantity: number
    externalStatus: string | null
  } | null = null
  let fullAutoBuyBlockReason: string | undefined

  if (executionMode === 'full_auto') {
    exchangeCredentials = await getUserExchangeCredentials(params.userId)
    const fullAutoEligibility = await resolveBotFullAutoEligibility({
      userId: params.userId,
      botId: bot.id,
      currentBotModelUrl: bot.modelUrl,
    })
    if (!fullAutoEligibility.eligible) {
      fullAutoBuyBlockReason = fullAutoEligibility.blockers[0]
        ?? 'O champion atual ainda não atende aos critérios mínimos para abrir novas posições em full_auto.'
    }

    if (exchangeCredentials) {
      await reconcileOpenOrdersForUserSafely(params.userId)
      openExchangeOrder = await prisma.transaction.findFirst({
        where: {
          userId: params.userId,
          botId: bot.id,
          externalOrderId: { not: null },
          status: { in: ['pending', 'partially_filled'] },
        },
        orderBy: [
          { syncedAt: 'desc' },
          { date: 'desc' },
        ],
        select: {
          pair: true,
          status: true,
          requestedQuantity: true,
          quantity: true,
          externalStatus: true,
        },
      })

      const liveBalancesBefore = await getAccountBalances(exchangeCredentials.apiKey, exchangeCredentials.secretKey, { forceRefresh: true })
      await syncExternalBalances(params.userId, liveBalancesBefore)
    }
  }

  const selectedOpportunity = (
    params.cycleResult.plan.pair
    && params.cycleResult.plan.action
    && typeof params.cycleResult.plan.decisionPrice === 'number'
    && typeof params.cycleResult.plan.confidence === 'number'
  ) ? {
    pair: params.cycleResult.plan.pair,
    action: params.cycleResult.plan.action,
    confidence: params.cycleResult.plan.confidence,
    price: params.cycleResult.plan.decisionPrice,
    reason: params.cycleResult.plan.reason,
  } : analysis.bestOpportunity
  const plannedQuantity = params.cycleResult.plan.quantity
  const isRiskOverride = Boolean(params.cycleResult.plan.isRiskOverride)
  const decisionTimestamp = new Date()
  const approvedPlansCount = cyclePlans.filter((plan) => plan.status !== 'skipped').length

  trace('INFO', 'bot', 'applyBotRuntimeCycleResult', 'Plano do runtime Python recebido para aplicação', 0, {
    userId: params.userId,
    botId: bot.id,
    currentPair: selectedOpportunity?.pair ?? analysis.bestOpportunity?.pair,
    recommendedAction: selectedOpportunity?.action ?? analysis.bestOpportunity?.action,
    confidence: selectedOpportunity?.confidence ?? analysis.bestOpportunity?.confidence,
    stage: 'runtime_plan_received',
    snapshot: {
      generatedAt: cycleGeneratedAt,
      executionMode,
      modelReadiness: {
        modelReady: modelReadiness.modelReady,
        modelVersion: modelReadiness.modelVersion,
        modelUrl: modelReadiness.modelUrl,
        modelArchitecture: modelReadiness.modelArchitecture,
        validationStrategy: modelReadiness.validationStrategy,
        forecastHorizonCandles: modelReadiness.forecastHorizonCandles,
      },
      analysis: summarizeRuntimeAnalysisForTrace(params.cycleResult.analysis),
      selectedPlan: summarizePlanForTrace(params.cycleResult.plan),
      approvedPlansCount,
      totalPlansCount: cyclePlans.length,
      fullAutoBuyBlockReason,
      openExchangeOrder: openExchangeOrder
        ? {
            pair: openExchangeOrder.pair,
            status: openExchangeOrder.status,
            requestedQuantity: openExchangeOrder.requestedQuantity ?? undefined,
            quantity: openExchangeOrder.quantity,
            externalStatus: openExchangeOrder.externalStatus ?? undefined,
          }
        : null,
    },
  })

  const logExecutionTrace = (
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    stage: string,
    snapshot?: Record<string, unknown>,
  ) => {
    trace(level, 'bot', 'applyBotRuntimeCycleResult', message, 0, {
      userId: params.userId,
      botId: bot.id,
      currentPair: selectedOpportunity?.pair ?? analysis.bestOpportunity?.pair,
      recommendedAction: selectedOpportunity?.action ?? analysis.bestOpportunity?.action,
      confidence: selectedOpportunity?.confidence ?? analysis.bestOpportunity?.confidence,
      stage,
      snapshot: {
        generatedAt: cycleGeneratedAt,
        executionMode,
        isRiskOverride,
        modelReadiness: {
          modelReady: modelReadiness.modelReady,
          modelVersion: modelReadiness.modelVersion,
          modelUrl: modelReadiness.modelUrl,
          modelArchitecture: modelReadiness.modelArchitecture,
          validationStrategy: modelReadiness.validationStrategy,
          forecastHorizonCandles: modelReadiness.forecastHorizonCandles,
        },
        selectedOpportunity: summarizeOpportunityForTrace(selectedOpportunity ?? analysis.bestOpportunity ?? undefined),
        selectedPlan: summarizePlanForTrace(params.cycleResult.plan),
        approvedPlansCount,
        totalPlansCount: cyclePlans.length,
        fullAutoBuyBlockReason,
        openExchangeOrder: openExchangeOrder
          ? {
              pair: openExchangeOrder.pair,
              status: openExchangeOrder.status,
              requestedQuantity: openExchangeOrder.requestedQuantity ?? undefined,
              quantity: openExchangeOrder.quantity,
              externalStatus: openExchangeOrder.externalStatus ?? undefined,
            }
          : null,
        ...snapshot,
      },
    })
  }

  const persistDecision = async (input: {
    executionStatus: BotCycleExecution['status']
    reason: string
    requestedQuantity?: number
    executedQuantity?: number
    transactionId?: string
    slippagePercent?: number
    simulatedLatencyMs?: number
    simulatedFillPercent?: number
    decisionPrice?: number
    pair?: string
    action?: 'buy' | 'sell' | 'hold'
    confidence?: number
    createdAt?: Date
  }) => {
    const pair = input.pair ?? selectedOpportunity?.pair
    const action = input.action ?? selectedOpportunity?.action
    const decisionPrice = input.decisionPrice ?? selectedOpportunity?.price
    const confidence = input.confidence ?? selectedOpportunity?.confidence

    if (
      !pair
      || !action
      || typeof decisionPrice !== 'number'
      || !Number.isFinite(decisionPrice)
      || decisionPrice <= QUANTITY_EPSILON
      || typeof confidence !== 'number'
      || !Number.isFinite(confidence)
    ) {
      return
    }

    try {
      const decision = await recordBotDecision({
        userId: params.userId,
        botId: bot.id,
        pair,
        action,
        confidence,
        reason: input.reason,
        timeframe,
        executionMode,
        executionStatus: input.executionStatus,
        decisionPrice,
        requestedQuantity: input.requestedQuantity,
        executedQuantity: input.executedQuantity,
        transactionId: input.transactionId,
        slippagePercent: input.slippagePercent,
        simulatedLatencyMs: input.simulatedLatencyMs,
        simulatedFillPercent: input.simulatedFillPercent,
        modelVersion: modelReadiness.modelVersion,
        modelUrl: modelReadiness.modelUrl,
        modelArchitecture: modelReadiness.modelArchitecture,
        horizonCandles: modelReadiness.forecastHorizonCandles ?? 5,
        buyThresholdPercent: modelReadiness.buyThresholdPercent ?? 0.3,
        sellThresholdPercent: modelReadiness.sellThresholdPercent ?? -0.3,
        createdAt: input.createdAt ?? decisionTimestamp,
      })

      trace('INFO', 'bot', 'persistDecision', 'Decisão do bot persistida', 0, {
        userId: params.userId,
        botId: bot.id,
        currentPair: pair,
        recommendedAction: action,
        confidence,
        stage: 'decision_persisted',
        snapshot: {
          decisionId: decision.id,
          generatedAt: cycleGeneratedAt,
          pair,
          action,
          executionMode,
          executionStatus: input.executionStatus,
          reason: input.reason,
          decisionPrice,
          requestedQuantity: input.requestedQuantity,
          executedQuantity: input.executedQuantity,
          transactionId: input.transactionId,
          slippagePercent: input.slippagePercent,
          simulatedLatencyMs: input.simulatedLatencyMs,
          simulatedFillPercent: input.simulatedFillPercent,
          modelVersion: modelReadiness.modelVersion,
          modelUrl: modelReadiness.modelUrl,
          modelArchitecture: modelReadiness.modelArchitecture,
          forecastHorizonCandles: modelReadiness.forecastHorizonCandles,
          isRiskOverride,
          selectedOpportunity: summarizeOpportunityForTrace(selectedOpportunity ?? analysis.bestOpportunity ?? undefined),
          selectedPlan: summarizePlanForTrace(params.cycleResult.plan),
        },
      })
    } catch (decisionError) {
      logger.warn('[bot] Falha ao persistir decisão do bot', {
        module: 'bot',
        event: 'bot_decision_record_failed',
        userId: params.userId,
        botId: bot.id,
        pair,
        action,
        error: decisionError,
        skipPersistence: true,
      })
    }
  }

  if (params.cycleResult.plan.status === 'skipped') {
    await persistDecision({
      executionStatus: 'skipped',
      reason: params.cycleResult.plan.reason,
      requestedQuantity: plannedQuantity,
      pair: params.cycleResult.plan.pair,
      action: params.cycleResult.plan.action,
      confidence: params.cycleResult.plan.confidence,
      decisionPrice: params.cycleResult.plan.decisionPrice,
    })

    logExecutionTrace('WARN', 'Ciclo encerrado sem execução após validação do plano', 'execution_skipped', {
      reason: params.cycleResult.plan.reason,
      plannedQuantity,
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: params.cycleResult.plan.reason,
        pair: params.cycleResult.plan.pair,
        action: params.cycleResult.plan.action,
        quantity: plannedQuantity,
      },
    }
  }

  if (params.cycleResult.plan.status === 'suggested') {
    await persistDecision({
      executionStatus: 'suggested',
      reason: params.cycleResult.plan.reason,
      requestedQuantity: plannedQuantity,
      pair: params.cycleResult.plan.pair,
      action: params.cycleResult.plan.action,
      confidence: params.cycleResult.plan.confidence,
      decisionPrice: params.cycleResult.plan.decisionPrice,
    })

    logExecutionTrace('INFO', 'Ciclo gerou sugestão para revisão manual', 'execution_suggested', {
      reason: params.cycleResult.plan.reason,
      plannedQuantity,
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'suggested',
        reason: params.cycleResult.plan.reason,
        pair: params.cycleResult.plan.pair,
        action: params.cycleResult.plan.action,
        quantity: plannedQuantity,
      },
    }
  }

  if (
    !selectedOpportunity
    || !selectedOpportunity.pair
    || !selectedOpportunity.action
    || typeof selectedOpportunity.price !== 'number'
    || !Number.isFinite(selectedOpportunity.price)
    || selectedOpportunity.price <= QUANTITY_EPSILON
    || typeof plannedQuantity !== 'number'
    || !Number.isFinite(plannedQuantity)
    || plannedQuantity <= QUANTITY_EPSILON
  ) {
    await persistDecision({
      executionStatus: 'skipped',
      reason: 'O runtime Python não retornou um plano de execução válido',
    })
    logExecutionTrace('WARN', 'Ciclo encerrado por plano invalido retornado pelo runtime', 'execution_invalid_plan', {
      plannedQuantity,
      selectedOpportunity: selectedOpportunity
        ? summarizeOpportunityForTrace(selectedOpportunity)
        : null,
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: 'O runtime Python não retornou um plano de execução válido',
      },
    }
  }

  if (executionMode === 'full_auto' && selectedOpportunity.action === 'buy' && fullAutoBuyBlockReason) {
    await persistDecision({
      executionStatus: 'skipped',
      reason: fullAutoBuyBlockReason,
      requestedQuantity: plannedQuantity,
      decisionPrice: selectedOpportunity.price,
    })
    logExecutionTrace('WARN', 'Execucao bloqueada pela governanca de full_auto', 'execution_blocked_governance', {
      reason: fullAutoBuyBlockReason,
      plannedQuantity,
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason: fullAutoBuyBlockReason,
        pair: selectedOpportunity.pair,
        action: selectedOpportunity.action,
        quantity: plannedQuantity,
      },
    }
  }

  if (executionMode === 'full_auto' && openExchangeOrder) {
    const quantity = openExchangeOrder.requestedQuantity ?? openExchangeOrder.quantity
    const reason = `Ainda existe uma ordem ${openExchangeOrder.status === 'partially_filled' ? 'parcialmente executada' : 'pendente'} em ${openExchangeOrder.pair}; o bot vai aguardar a reconciliacao antes de abrir nova posicao`
    await persistDecision({
      executionStatus: 'skipped',
      reason,
      requestedQuantity: quantity ?? undefined,
      decisionPrice: selectedOpportunity.price,
    })
    logExecutionTrace('WARN', 'Execucao adiada por ordem ainda aberta na corretora', 'execution_blocked_open_order', {
      reason,
      blockingOrder: {
        pair: openExchangeOrder.pair,
        status: openExchangeOrder.status,
        requestedQuantity: openExchangeOrder.requestedQuantity ?? undefined,
        quantity: openExchangeOrder.quantity,
        externalStatus: openExchangeOrder.externalStatus ?? undefined,
      },
    })

    return {
      botId: bot.id,
      botName: bot.name,
      generatedAt: cycleGeneratedAt,
      analysis,
      plans: cyclePlans,
      execution: {
        mode: executionMode,
        status: 'skipped',
        reason,
        pair: selectedOpportunity.pair,
        action: selectedOpportunity.action,
        quantity: quantity ?? undefined,
      },
    }
  }

  const executionAction = selectedOpportunity.action as 'buy' | 'sell'

  let transaction: ExecutedOrderPayload
  let executionStatus: BotCycleExecution['status'] = 'executed'
  let executionReason = params.cycleResult.plan.reason
  let paperSimulation = params.cycleResult.plan.paperSimulation
    ? {
        requestedQuantity: params.cycleResult.plan.paperSimulation.requestedQuantity,
        executedQuantity: params.cycleResult.plan.paperSimulation.executedQuantity,
        executionPrice: params.cycleResult.plan.paperSimulation.executionPrice,
        slippagePercent: params.cycleResult.plan.paperSimulation.slippagePercent,
        simulatedLatencyMs: params.cycleResult.plan.paperSimulation.simulatedLatencyMs,
        simulatedFillPercent: params.cycleResult.plan.paperSimulation.simulatedFillPercent,
      }
    : null

  if (executionMode === 'full_auto' && exchangeCredentials) {
    const preparedOrder = await prepareSpotOrderRequest({
      pair: selectedOpportunity.pair,
      quantity: plannedQuantity,
      orderType: 'MARKET',
      referencePrice: selectedOpportunity.price,
    })

    if (!preparedOrder.isValid || !preparedOrder.quantity) {
      const reason = preparedOrder.rejectionReason ?? 'A ordem não atendeu aos filtros da Binance'
      await persistDecision({
        executionStatus: 'skipped',
        reason,
        requestedQuantity: plannedQuantity,
      })
      logExecutionTrace('WARN', 'Execucao bloqueada pelos filtros da corretora', 'execution_blocked_exchange_filters', {
        reason,
        plannedQuantity,
        preparedOrder: {
          quantity: preparedOrder.quantity,
          isValid: preparedOrder.isValid,
          rejectionReason: preparedOrder.rejectionReason,
          adjustments: preparedOrder.adjustments,
        },
      })

      return {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        plans: cyclePlans,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason,
          pair: selectedOpportunity.pair,
          action: selectedOpportunity.action,
        },
      }
    }

    const liveOrder = await createSpotOrder(exchangeCredentials.apiKey, exchangeCredentials.secretKey, {
      pair: selectedOpportunity.pair,
      side: selectedOpportunity.action === 'buy' ? 'BUY' : 'SELL',
      quantity: preparedOrder.quantity,
    })

    const requestedQuantity = roundQuantity(Number(liveOrder.origQty || preparedOrder.quantity || plannedQuantity))
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
        userId: params.userId,
        pair: selectedOpportunity.pair,
        type: executionAction,
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
        userId: params.userId,
        pair: selectedOpportunity.pair,
        type: executionAction,
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
    await syncExternalBalances(params.userId, liveBalancesAfter)
    await recordBalanceHistorySnapshot(params.userId, liveBalancesAfter.map((balance) => ({
      currency: balance.currency,
      total: balance.total,
    }))).catch((snapshotError) => {
      logger.warn('[bot] Falha ao registrar snapshot após ordem real do bot', {
        module: 'bot',
        event: 'bot_cycle_live_balance_snapshot_failed',
        userId: params.userId,
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
    paperSimulation = paperSimulation ?? buildPaperSimulation({
      action: executionAction,
      confidence: selectedOpportunity.confidence,
      requestedQuantity: plannedQuantity,
      referencePrice: selectedOpportunity.price,
    })

    transaction = await executeOrderForUser({
      userId: params.userId,
      pair: selectedOpportunity.pair,
      type: executionAction,
      quantity: paperSimulation.executedQuantity,
      requestedQuantity: paperSimulation.requestedQuantity,
      orderType: 'market',
      price: paperSimulation.executionPrice,
      origin: 'bot',
      botId: bot.id,
    })

    if (isRiskOverride) {
      executionReason = `${selectedOpportunity.reason} · ordem executada em modo paper`
    } else {
      executionReason = `${executionReason} · slippage ${paperSimulation.slippagePercent.toFixed(2)}% · fill ${Math.round(paperSimulation.simulatedFillPercent * 100)}%`
    }
  }

  await persistDecision({
    executionStatus,
    reason: executionReason,
    requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
    executedQuantity: transaction.quantity,
    transactionId: transaction.id,
    slippagePercent: paperSimulation?.slippagePercent,
    simulatedLatencyMs: paperSimulation?.simulatedLatencyMs,
    simulatedFillPercent: paperSimulation?.simulatedFillPercent,
    decisionPrice: transaction.price,
    createdAt: transaction.date,
  })

  logExecutionTrace(executionStatus === 'executed' ? 'INFO' : 'WARN', 'Execucao do ciclo concluida', 'execution_result', {
    executionStatus,
    executionReason,
    requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
    executedQuantity: transaction.quantity,
    transaction: {
      id: transaction.id,
      status: transaction.status,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      externalStatus: transaction.externalStatus ?? undefined,
      syncedAt: transaction.syncedAt?.toISOString(),
    },
    paperSimulation: paperSimulation
      ? {
          requestedQuantity: paperSimulation.requestedQuantity,
          executedQuantity: paperSimulation.executedQuantity,
          executionPrice: paperSimulation.executionPrice,
          slippagePercent: paperSimulation.slippagePercent,
          simulatedLatencyMs: paperSimulation.simulatedLatencyMs,
          simulatedFillPercent: paperSimulation.simulatedFillPercent,
        }
      : undefined,
  })

  logger.info('[bot] Ordem automatizada executada pelo ciclo do bot', {
    module: 'bot',
    event: executionMode === 'full_auto'
      ? (executionStatus === 'executed' ? 'bot_cycle_order_executed_full_auto' : 'bot_cycle_order_submitted_full_auto')
      : 'bot_cycle_order_executed_paper',
    userId: params.userId,
    botId: bot.id,
    botName: bot.name,
    pair: selectedOpportunity.pair,
    action: selectedOpportunity.action,
    confidence: selectedOpportunity.confidence,
    quantity: transaction.requestedQuantity ?? transaction.quantity,
    transactionId: transaction.id,
    transactionStatus: transaction.status,
  })

  emitDashboardUpdate(params.userId, {
    scope: 'bots',
    reason: executionStatus === 'executed' ? 'bot_cycle_executed' : 'bot_cycle_submitted',
    botId: bot.id,
    updatedAt: new Date().toISOString(),
  })

  return {
    botId: bot.id,
    botName: bot.name,
    generatedAt: new Date().toISOString(),
    analysis,
    plans: cyclePlans,
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
}

export async function runBotCycle(botId: string, userId: string): Promise<BotCycleResult | null> {
  if (processingBots.has(botId)) {
    return null
  }

  processingBots.add(botId)
  startTrace(userId, 'runBotCycle', 'bot')

  try {
    const bot = await loadBotForCycle(botId, userId)

    if (!bot) {
      endTrace('runBotCycle', { userId, botId, errorFlag: true })
      return null
    }

    const executionMode = ((bot.executionMode || 'paper') as BotExecutionMode)
    const cycleContext = await buildBotRuntimeCycleContext(botId, userId)

    if (!cycleContext) {
      const analysis = await analyzeBotInstance(userId, botId)
      if (!analysis) {
        endTrace('runBotCycle', { userId, botId, errorFlag: true })
        return null
      }

      const modelReadiness = await resolveBotOperationalReadiness(bot.modelUrl)
      const skipReason = bot.isPaused
        ? 'Bot pausado; ciclo ignorado'
        : bot.status !== 'online'
          ? `Bot em status ${bot.status}; ciclo ignorado`
          : await hasActiveTrainingSession(userId, bot.id)
            ? 'Treinamento ativo detectado; execução automática adiada'
            : modelReadiness.operationalBlockReason ?? 'Bot não elegível para ciclo automático neste momento'

      const result: BotCycleResult = {
        botId: bot.id,
        botName: bot.name,
        generatedAt: new Date().toISOString(),
        analysis,
        execution: {
          mode: executionMode,
          status: 'skipped',
          reason: skipReason,
          pair: analysis.bestOpportunity?.pair,
          action: analysis.bestOpportunity?.action,
        },
      }

      endTrace('runBotCycle', {
        userId,
        botId,
        currentPair: analysis.bestOpportunity?.pair,
        recommendedAction: analysis.bestOpportunity?.action,
        confidence: analysis.bestOpportunity?.confidence,
      })
      return result
    }

    const cycleResult = await runPythonBotCycle(cycleContext.payload)
    const result = await applyBotRuntimeCycleResult({
      botId,
      userId,
      cycleResult,
      cycleGeneratedAt: cycleContext.generatedAt,
    })

    if (!result) {
      endTrace('runBotCycle', { userId, botId, errorFlag: true })
      return null
    }

    trace('DEBUG', 'bot', 'runBotCycle', 'Ciclo do bot executado via payload compartilhado do runtime', 0, {
      userId,
      botId,
      currentPair: result.execution.pair,
      recommendedAction: result.execution.action,
      confidence: result.analysis.bestOpportunity?.confidence,
    })

    endTrace('runBotCycle', {
      userId,
      botId,
      currentPair: result.execution.pair,
      recommendedAction: result.execution.action,
      confidence: result.analysis.bestOpportunity?.confidence,
    })
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

export async function processBotRuntimeMaintenanceCycle(): Promise<void> {
  await processOpenExchangeOrdersCycle()
  await evaluatePendingBotDecisions().catch((evaluationError) => {
    logger.warn('[bot] Falha ao avaliar decisões pendentes do runtime externo', {
      module: 'bot',
      event: 'bot_runtime_decision_evaluation_failed',
      error: evaluationError,
      skipPersistence: true,
    })
  })
}

export async function processBotQueueCycle(): Promise<void> {
  const bots = await listBotRuntimeQueue()

  for (const bot of bots) {
    if (processingBots.has(bot.botId)) {
      continue
    }

    try {
      await runBotCycle(bot.botId, bot.userId)
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
    await processBotRuntimeMaintenanceCycle()
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
