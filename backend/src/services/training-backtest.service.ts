import { collectTrainingData, type TrainingDataPoint } from './training-data.service'

interface TrainingSessionConfig {
  dataSource?: 'exchange' | 'synthetic' | 'upload'
  trainingPeriod?: {
    startDate?: string
    endDate?: string
  }
  includedPairs?: string[]
  timeframe?: string
  uploadedFileUrl?: string
}

interface CompletedTrainingSession {
  id: string
  botId: string
  config: string
}

interface BacktestTrade {
  pair: string
  openedAt: string
  closedAt: string
  profit: number
  returnRatio: number
}

export interface TrainingBacktestResult {
  sessionId: string
  testPeriod: {
    startDate: string
    endDate: string
  }
  totalTrades: number
  winRate: number
  totalProfit: number
  sharpeRatio: number
  maxDrawdown: number
  profitFactor: number
}

const FIXED_TRADE_CAPITAL = 1000
const FEE_RATE = 0.001
const TAKE_PROFIT_RATIO = 0.04
const STOP_LOSS_RATIO = -0.025
const MAX_POSITION_CANDLES = 12
const DAY_IN_MS = 24 * 60 * 60 * 1000
const INITIAL_EQUITY = 10000

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toFixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function normalizeDate(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : fallback
  if (Number.isNaN(parsed.getTime())) {
    return fallback
  }

  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function buildTestPeriod(config: TrainingSessionConfig): { startDate: string; endDate: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const fallbackTrainingEnd = new Date(today.getTime() - (31 * DAY_IN_MS))
  const trainingEnd = normalizeDate(config.trainingPeriod?.endDate, fallbackTrainingEnd)

  let startDate = new Date(trainingEnd.getTime() + DAY_IN_MS)
  let endDate = new Date(startDate.getTime() + (30 * DAY_IN_MS))

  if (startDate >= today) {
    endDate = new Date(today)
    startDate = new Date(today.getTime() - (30 * DAY_IN_MS))
  } else if (endDate > today) {
    endDate = new Date(today)
  }

  if (endDate <= startDate) {
    endDate = new Date(startDate.getTime() + DAY_IN_MS)
  }

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  }
}

function getBullishScore(current: TrainingDataPoint, previous: TrainingDataPoint): number {
  let score = 0

  if (current.SMA_7 !== null && current.SMA_7 !== undefined && current.SMA_14 !== null && current.SMA_14 !== undefined && current.SMA_7 > current.SMA_14) {
    score += 1
  }

  if (current.EMA_7 !== null && current.EMA_7 !== undefined && current.close > current.EMA_7) {
    score += 1
  }

  if (current.MACD !== null && current.MACD !== undefined && current.MACD > 0) {
    score += 1
  }

  if (current.RSI !== null && current.RSI !== undefined && current.RSI >= 35 && current.RSI <= 62) {
    score += 1
  }

  if (current.close > previous.close) {
    score += 1
  }

  return score
}

function getBearishScore(current: TrainingDataPoint, previous: TrainingDataPoint): number {
  let score = 0

  if (current.SMA_7 !== null && current.SMA_7 !== undefined && current.SMA_14 !== null && current.SMA_14 !== undefined && current.SMA_7 < current.SMA_14) {
    score += 1
  }

  if (current.EMA_7 !== null && current.EMA_7 !== undefined && current.close < current.EMA_7) {
    score += 1
  }

  if (current.MACD !== null && current.MACD !== undefined && current.MACD < 0) {
    score += 1
  }

  if (current.RSI !== null && current.RSI !== undefined && current.RSI >= 68) {
    score += 1
  }

  if (current.close < previous.close) {
    score += 1
  }

  return score
}

function simulatePairTrades(pair: string, points: TrainingDataPoint[]): BacktestTrade[] {
  if (points.length < 2) {
    return []
  }

  const trades: BacktestTrade[] = []
  let position:
    | {
        entryPrice: number
        entryIndex: number
        entryTimestamp: string
        quantity: number
      }
    | null = null

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]

    const bullishScore = getBullishScore(current, previous)
    const bearishScore = getBearishScore(current, previous)

    if (!position) {
      const shouldBuy = bullishScore >= 3 || (
        current.RSI !== null &&
        current.RSI !== undefined &&
        current.RSI < 40 &&
        current.close > previous.close
      )

      if (shouldBuy) {
        position = {
          entryPrice: current.close,
          entryIndex: index,
          entryTimestamp: current.timestamp,
          quantity: FIXED_TRADE_CAPITAL / current.close,
        }
      }

      continue
    }

    const grossExitValue = position.quantity * current.close
    const grossEntryValue = position.quantity * position.entryPrice
    const fees = (grossEntryValue * FEE_RATE) + (grossExitValue * FEE_RATE)
    const netProfit = grossExitValue - grossEntryValue - fees
    const netReturnRatio = netProfit / FIXED_TRADE_CAPITAL
    const candlesHeld = index - position.entryIndex
    const shouldSell = netReturnRatio >= TAKE_PROFIT_RATIO
      || netReturnRatio <= STOP_LOSS_RATIO
      || bearishScore >= 2
      || candlesHeld >= MAX_POSITION_CANDLES

    if (!shouldSell) {
      continue
    }

    trades.push({
      pair,
      openedAt: position.entryTimestamp,
      closedAt: current.timestamp,
      profit: netProfit,
      returnRatio: netReturnRatio,
    })
    position = null
  }

  if (position) {
    const lastPoint = points[points.length - 1]
    const grossExitValue = position.quantity * lastPoint.close
    const grossEntryValue = position.quantity * position.entryPrice
    const fees = (grossEntryValue * FEE_RATE) + (grossExitValue * FEE_RATE)
    const netProfit = grossExitValue - grossEntryValue - fees

    trades.push({
      pair,
      openedAt: position.entryTimestamp,
      closedAt: lastPoint.timestamp,
      profit: netProfit,
      returnRatio: netProfit / FIXED_TRADE_CAPITAL,
    })
  }

  return trades
}

function calculateSharpeRatio(trades: BacktestTrade[]): number {
  if (trades.length < 2) {
    return 0
  }

  const returns = trades.map((trade) => trade.returnRatio)
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length
  const standardDeviation = Math.sqrt(variance)

  if (standardDeviation === 0) {
    return 0
  }

  return (mean / standardDeviation) * Math.sqrt(returns.length)
}

function calculateMaxDrawdown(trades: BacktestTrade[]): number {
  let equity = INITIAL_EQUITY
  let peak = INITIAL_EQUITY
  let maxDrawdown = 0

  for (const trade of trades) {
    equity += trade.profit
    peak = Math.max(peak, equity)
    const drawdown = ((equity - peak) / peak) * 100
    maxDrawdown = Math.min(maxDrawdown, drawdown)
  }

  return maxDrawdown
}

export async function runTrainingBacktest(session: CompletedTrainingSession): Promise<TrainingBacktestResult> {
  const config = safeJsonParse<TrainingSessionConfig>(session.config, {})
  const testPeriod = buildTestPeriod(config)

  const datasets = await collectTrainingData({
    dataSource: config.dataSource,
    includedPairs: config.includedPairs ?? [],
    timeframe: config.timeframe ?? '1h',
    trainingPeriod: testPeriod,
    uploadedFileUrl: config.uploadedFileUrl,
  })

  const trades = Object.entries(datasets)
    .flatMap(([pair, points]) => simulatePairTrades(pair, points))
    .sort((left, right) => new Date(left.closedAt).getTime() - new Date(right.closedAt).getTime())

  if (trades.length === 0) {
    return {
      sessionId: session.id,
      testPeriod,
      totalTrades: 0,
      winRate: 0,
      totalProfit: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      profitFactor: 0,
    }
  }

  const wins = trades.filter((trade) => trade.profit > 0)
  const grossProfit = wins.reduce((sum, trade) => sum + trade.profit, 0)
  const grossLoss = trades
    .filter((trade) => trade.profit < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.profit), 0)
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0)
  const winRate = (wins.length / trades.length) * 100
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0

  return {
    sessionId: session.id,
    testPeriod,
    totalTrades: trades.length,
    winRate: toFixedNumber(winRate, 2),
    totalProfit: toFixedNumber(totalProfit, 2),
    sharpeRatio: toFixedNumber(calculateSharpeRatio(trades), 2),
    maxDrawdown: toFixedNumber(calculateMaxDrawdown(trades), 2),
    profitFactor: toFixedNumber(profitFactor, 2),
  }
}
