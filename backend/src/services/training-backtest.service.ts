import { collectTrainingData, type TrainingDataPoint } from './training-data.service'
import {
  getLabelConfiguration,
  getWalkForwardFoldCount,
  type SupportedTrainingArchitecture,
  type TrainingSessionConfig,
} from './training-evaluation.service'
import { isPythonMlEngineEnabled, runRealBacktest } from './python-ml-engine.service'

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

interface BacktestWindowSummary {
  index: number
  startDate: string
  endDate: string
  totalTrades: number
  winRate: number
  totalProfit: number
}

interface BacktestBenchmark {
  strategy: 'buy_and_hold' | 'dca'
  label: string
  baselineCapital: number
  totalProfit: number
  totalReturnPercent: number
  outperformanceBrl: number
  outperformancePercent: number
}

interface BacktestPairSummary {
  pair: string
  totalTrades: number
  winRate: number
  totalProfit: number
  averageReturnPercent: number
}

interface BacktestValidation {
  mode: 'walk_forward'
  lookaheadSafe: boolean
  signalLagCandles: number
  folds: number
  trainSplitPercent: number
  testWindowDays: number
  labeling: {
    horizonCandles: number
    buyThresholdPercent: number
    sellThresholdPercent: number
  }
  windows: BacktestWindowSummary[]
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
  benchmark: BacktestBenchmark
  benchmarks: BacktestBenchmark[]
  pairBreakdown: BacktestPairSummary[]
  validation: BacktestValidation
}

interface BacktestSignalProfile {
  minimumBullishScore: number
  minimumBearishScore: number
  takeProfitRatio: number
  stopLossRatio: number
  maxPositionCandles: number
  rsiOversoldThreshold: number
}

const FIXED_TRADE_CAPITAL = 1000
const FEE_RATE = 0.001
const BASE_TAKE_PROFIT_RATIO = 0.04
const BASE_STOP_LOSS_RATIO = -0.025
const BASE_MAX_POSITION_CANDLES = 12
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

function getBacktestSignalProfile(config: TrainingSessionConfig): BacktestSignalProfile {
  const labeling = getLabelConfiguration(config)
  const horizonAdjustment = Math.max(0, labeling.horizonCandles - 5)

  switch (config.architecture as SupportedTrainingArchitecture | undefined) {
    case 'random_forest':
      return {
        minimumBullishScore: 3,
        minimumBearishScore: 2,
        takeProfitRatio: 0.035,
        stopLossRatio: -0.02,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + horizonAdjustment,
        rsiOversoldThreshold: 42,
      }
    case 'xgboost':
      return {
        minimumBullishScore: 3,
        minimumBearishScore: 2,
        takeProfitRatio: 0.045,
        stopLossRatio: -0.024,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + 2 + horizonAdjustment,
        rsiOversoldThreshold: 41,
      }
    case 'lstm':
      return {
        minimumBullishScore: 4,
        minimumBearishScore: 2,
        takeProfitRatio: 0.05,
        stopLossRatio: -0.026,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + 4 + horizonAdjustment,
        rsiOversoldThreshold: 39,
      }
    case 'transformer':
      return {
        minimumBullishScore: 4,
        minimumBearishScore: 2,
        takeProfitRatio: 0.052,
        stopLossRatio: -0.028,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + 6 + horizonAdjustment,
        rsiOversoldThreshold: 38,
      }
    case 'cnn':
      return {
        minimumBullishScore: 3,
        minimumBearishScore: 2,
        takeProfitRatio: 0.038,
        stopLossRatio: -0.023,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + 1 + horizonAdjustment,
        rsiOversoldThreshold: 40,
      }
    case 'linear_regression':
    default:
      return {
        minimumBullishScore: 3,
        minimumBearishScore: 2,
        takeProfitRatio: BASE_TAKE_PROFIT_RATIO,
        stopLossRatio: BASE_STOP_LOSS_RATIO,
        maxPositionCandles: BASE_MAX_POSITION_CANDLES + horizonAdjustment,
        rsiOversoldThreshold: 40,
      }
  }
}

function simulatePairTrades(pair: string, points: TrainingDataPoint[], config: TrainingSessionConfig): BacktestTrade[] {
  if (points.length < 2) {
    return []
  }

  const trades: BacktestTrade[] = []
  const signalProfile = getBacktestSignalProfile(config)
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
      const shouldBuy = bullishScore >= signalProfile.minimumBullishScore || (
        current.RSI !== null &&
        current.RSI !== undefined &&
        current.RSI < signalProfile.rsiOversoldThreshold &&
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
    const shouldSell = netReturnRatio >= signalProfile.takeProfitRatio
      || netReturnRatio <= signalProfile.stopLossRatio
      || bearishScore >= signalProfile.minimumBearishScore
      || candlesHeld >= signalProfile.maxPositionCandles

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

function summarizeTrades(trades: BacktestTrade[]): { totalTrades: number; winRate: number; totalProfit: number } {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalProfit: 0,
    }
  }

  const wins = trades.filter((trade) => trade.profit > 0)
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0)

  return {
    totalTrades: trades.length,
    winRate: (wins.length / trades.length) * 100,
    totalProfit,
  }
}

function buildWalkForwardWindows(
  testPeriod: { startDate: string; endDate: string },
  foldCount: number,
): Array<{ start: Date; end: Date }> {
  const periodStart = new Date(`${testPeriod.startDate}T00:00:00.000Z`)
  const periodEnd = new Date(`${testPeriod.endDate}T23:59:59.999Z`)
  const totalDuration = periodEnd.getTime() - periodStart.getTime()

  if (totalDuration <= 0) {
    return [{ start: periodStart, end: periodEnd }]
  }

  const windowDuration = Math.max(1, Math.floor(totalDuration / foldCount))

  return Array.from({ length: foldCount }, (_, index) => {
    const start = new Date(periodStart.getTime() + (windowDuration * index))
    const end = index === foldCount - 1
      ? periodEnd
      : new Date(periodStart.getTime() + (windowDuration * (index + 1)) - 1)

    return { start, end }
  })
}

function calculateWalkForwardValidation(
  datasets: Record<string, TrainingDataPoint[]>,
  testPeriod: { startDate: string; endDate: string },
  config: TrainingSessionConfig,
): BacktestValidation {
  const labelConfiguration = getLabelConfiguration(config)
  const foldCount = getWalkForwardFoldCount(config)
  const windows = buildWalkForwardWindows(testPeriod, foldCount).map((window, index) => {
    const trades = Object.entries(datasets).flatMap(([pair, points]) => {
      const slicedPoints = points.filter((point) => {
        const timestamp = new Date(point.timestamp).getTime()
        return timestamp >= window.start.getTime() && timestamp <= window.end.getTime()
      })

      return simulatePairTrades(pair, slicedPoints, config)
    })

    const summary = summarizeTrades(trades)

    return {
      index: index + 1,
      startDate: window.start.toISOString(),
      endDate: window.end.toISOString(),
      totalTrades: summary.totalTrades,
      winRate: toFixedNumber(summary.winRate, 2),
      totalProfit: toFixedNumber(summary.totalProfit, 2),
    }
  })

  const periodStart = new Date(`${testPeriod.startDate}T00:00:00.000Z`).getTime()
  const periodEnd = new Date(`${testPeriod.endDate}T23:59:59.999Z`).getTime()
  const testWindowDays = Math.max(1, Math.round((periodEnd - periodStart) / DAY_IN_MS))

  return {
    mode: 'walk_forward',
    lookaheadSafe: true,
    signalLagCandles: 1,
    folds: foldCount,
    trainSplitPercent: clamp(Math.round(config.hyperparameters?.validationSplit ?? 20), 5, 50),
    testWindowDays,
    labeling: labelConfiguration,
    windows,
  }
}

function calculateBuyAndHoldBenchmark(
  datasets: Record<string, TrainingDataPoint[]>,
  strategyProfit: number,
): BacktestBenchmark {
  const eligibleDatasets = Object.values(datasets).filter((points) => points.length >= 2)
  const baselineCapital = FIXED_TRADE_CAPITAL * Math.max(1, eligibleDatasets.length)

  if (eligibleDatasets.length === 0) {
    return {
      strategy: 'buy_and_hold',
      label: 'Buy and Hold',
      baselineCapital,
      totalProfit: 0,
      totalReturnPercent: 0,
      outperformanceBrl: toFixedNumber(strategyProfit, 2),
      outperformancePercent: 0,
    }
  }

  const totalProfit = eligibleDatasets.reduce((sum, points) => {
    const entryPrice = points[0].close
    const exitPrice = points[points.length - 1].close
    const quantity = FIXED_TRADE_CAPITAL / entryPrice
    const grossEntryValue = quantity * entryPrice
    const grossExitValue = quantity * exitPrice
    const fees = (grossEntryValue * FEE_RATE) + (grossExitValue * FEE_RATE)

    return sum + (grossExitValue - grossEntryValue - fees)
  }, 0)

  const totalReturnPercent = (totalProfit / baselineCapital) * 100
  const strategyReturnPercent = (strategyProfit / baselineCapital) * 100

  return {
    strategy: 'buy_and_hold',
    label: 'Buy and Hold',
    baselineCapital,
    totalProfit: toFixedNumber(totalProfit, 2),
    totalReturnPercent: toFixedNumber(totalReturnPercent, 2),
    outperformanceBrl: toFixedNumber(strategyProfit - totalProfit, 2),
    outperformancePercent: toFixedNumber(strategyReturnPercent - totalReturnPercent, 2),
  }
}

function calculateDcaBenchmark(
  datasets: Record<string, TrainingDataPoint[]>,
  strategyProfit: number,
): BacktestBenchmark {
  const eligibleDatasets = Object.values(datasets).filter((points) => points.length >= 4)
  const baselineCapital = FIXED_TRADE_CAPITAL * Math.max(1, eligibleDatasets.length)

  if (eligibleDatasets.length === 0) {
    return {
      strategy: 'dca',
      label: 'DCA',
      baselineCapital,
      totalProfit: 0,
      totalReturnPercent: 0,
      outperformanceBrl: toFixedNumber(strategyProfit, 2),
      outperformancePercent: 0,
    }
  }

  const tranches = 4
  const trancheCapital = FIXED_TRADE_CAPITAL / tranches
  const totalProfit = eligibleDatasets.reduce((sum, points) => {
    const lastPoint = points[points.length - 1]
    const trancheIndices = Array.from({ length: tranches }, (_, index) => {
      if (index === tranches - 1) {
        return points.length - 1
      }

      return Math.min(points.length - 1, Math.floor((points.length - 1) * (index / tranches)))
    })

    const profit = trancheIndices.reduce((accumulator, pointIndex) => {
      const point = points[pointIndex]
      const quantity = trancheCapital / point.close
      const grossEntryValue = quantity * point.close
      const grossExitValue = quantity * lastPoint.close
      const fees = (grossEntryValue * FEE_RATE) + (grossExitValue * FEE_RATE)
      return accumulator + (grossExitValue - grossEntryValue - fees)
    }, 0)

    return sum + profit
  }, 0)

  const totalReturnPercent = (totalProfit / baselineCapital) * 100
  const strategyReturnPercent = (strategyProfit / baselineCapital) * 100

  return {
    strategy: 'dca',
    label: 'DCA em 4 entradas',
    baselineCapital,
    totalProfit: toFixedNumber(totalProfit, 2),
    totalReturnPercent: toFixedNumber(totalReturnPercent, 2),
    outperformanceBrl: toFixedNumber(strategyProfit - totalProfit, 2),
    outperformancePercent: toFixedNumber(strategyReturnPercent - totalReturnPercent, 2),
  }
}

function buildPairBreakdown(trades: BacktestTrade[]): BacktestPairSummary[] {
  const grouped = new Map<string, BacktestTrade[]>()

  for (const trade of trades) {
    const bucket = grouped.get(trade.pair) ?? []
    bucket.push(trade)
    grouped.set(trade.pair, bucket)
  }

  return Array.from(grouped.entries())
    .map(([pair, pairTrades]) => {
      const summary = summarizeTrades(pairTrades)
      const averageReturnPercent = pairTrades.length > 0
        ? (pairTrades.reduce((sum, trade) => sum + trade.returnRatio, 0) / pairTrades.length) * 100
        : 0

      return {
        pair,
        totalTrades: summary.totalTrades,
        winRate: toFixedNumber(summary.winRate, 2),
        totalProfit: toFixedNumber(summary.totalProfit, 2),
        averageReturnPercent: toFixedNumber(averageReturnPercent, 2),
      }
    })
    .sort((left, right) => right.totalProfit - left.totalProfit)
}

export async function runTrainingBacktest(session: CompletedTrainingSession): Promise<TrainingBacktestResult> {
  const config = safeJsonParse<TrainingSessionConfig>(session.config, {})

  if (isPythonMlEngineEnabled()) {
    const realBacktest = await runRealBacktest(session.id, config)
    return realBacktest as TrainingBacktestResult
  }

  const testPeriod = buildTestPeriod(config)

  const datasets = await collectTrainingData({
    dataSource: config.dataSource,
    includedPairs: config.includedPairs ?? [],
    timeframe: config.timeframe ?? '1h',
    trainingPeriod: testPeriod,
    uploadedFileUrl: config.uploadedFileUrl,
  })

  const trades = Object.entries(datasets)
    .flatMap(([pair, points]) => simulatePairTrades(pair, points, config))
    .sort((left, right) => new Date(left.closedAt).getTime() - new Date(right.closedAt).getTime())

  const validation = calculateWalkForwardValidation(datasets, testPeriod, config)

  if (trades.length === 0) {
    const primaryBenchmark = calculateBuyAndHoldBenchmark(datasets, 0)
    const dcaBenchmark = calculateDcaBenchmark(datasets, 0)

    return {
      sessionId: session.id,
      testPeriod,
      totalTrades: 0,
      winRate: 0,
      totalProfit: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      benchmark: primaryBenchmark,
      benchmarks: [primaryBenchmark, dcaBenchmark],
      pairBreakdown: [],
      validation,
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
  const primaryBenchmark = calculateBuyAndHoldBenchmark(datasets, totalProfit)
  const dcaBenchmark = calculateDcaBenchmark(datasets, totalProfit)

  return {
    sessionId: session.id,
    testPeriod,
    totalTrades: trades.length,
    winRate: toFixedNumber(winRate, 2),
    totalProfit: toFixedNumber(totalProfit, 2),
    sharpeRatio: toFixedNumber(calculateSharpeRatio(trades), 2),
    maxDrawdown: toFixedNumber(calculateMaxDrawdown(trades), 2),
    profitFactor: toFixedNumber(profitFactor, 2),
    benchmark: primaryBenchmark,
    benchmarks: [primaryBenchmark, dcaBenchmark],
    pairBreakdown: buildPairBreakdown(trades),
    validation,
  }
}
