import { fetchHistoricalCandles } from './binance.service'

export interface TrainingDataPoint {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  SMA_7?: number | null
  SMA_14?: number | null
  EMA_7?: number | null
  RSI?: number | null
  MACD?: number | null
  BB_upper?: number | null
  BB_lower?: number | null
}

export interface TrainingDataRequest {
  includedPairs: string[]
  timeframe: string
  trainingPeriod: {
    startDate: string
    endDate: string
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function calculateSma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) {
    return null
  }

  const slice = values.slice(index + 1 - period, index + 1)
  return average(slice)
}

function calculateEmaSeries(values: number[], period: number): Array<number | null> {
  const multiplier = 2 / (period + 1)
  const result: Array<number | null> = []
  let previous: number | null = null

  values.forEach((value, index) => {
    if (index + 1 < period) {
      result.push(null)
      return
    }

    if (previous === null) {
      previous = average(values.slice(0, period))
      result.push(previous)
      return
    }

    previous = ((value - previous) * multiplier) + previous
    result.push(previous)
  })

  return result
}

function calculateRsi(values: number[], period: number, index: number): number | null {
  if (index < period) {
    return null
  }

  let gains = 0
  let losses = 0

  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const change = values[cursor] - values[cursor - 1]
    if (change >= 0) {
      gains += change
    } else {
      losses += Math.abs(change)
    }
  }

  const averageGain = gains / period
  const averageLoss = losses / period

  if (averageLoss === 0) {
    return 100
  }

  const relativeStrength = averageGain / averageLoss
  return 100 - (100 / (1 + relativeStrength))
}

function standardDeviation(values: number[]): number {
  const mean = average(values) ?? 0
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

function addIndicators(points: TrainingDataPoint[]): TrainingDataPoint[] {
  const closes = points.map((point) => point.close)
  const ema7 = calculateEmaSeries(closes, 7)
  const ema12 = calculateEmaSeries(closes, 12)
  const ema26 = calculateEmaSeries(closes, 26)

  return points.map((point, index) => {
    const SMA_7 = calculateSma(closes, 7, index)
    const SMA_14 = calculateSma(closes, 14, index)
    const EMA_7 = ema7[index]
    const RSI = calculateRsi(closes, 14, index)
    const MACD = ema12[index] !== null && ema26[index] !== null ? (ema12[index] as number) - (ema26[index] as number) : null

    let BB_upper: number | null = null
    let BB_lower: number | null = null
    if (index + 1 >= 20) {
      const window = closes.slice(index + 1 - 20, index + 1)
      const sma20 = average(window) ?? 0
      const deviation = standardDeviation(window)
      BB_upper = sma20 + (2 * deviation)
      BB_lower = sma20 - (2 * deviation)
    }

    return {
      ...point,
      SMA_7,
      SMA_14,
      EMA_7,
      RSI,
      MACD,
      BB_upper,
      BB_lower,
    }
  })
}

export async function collectTrainingData(request: TrainingDataRequest): Promise<Record<string, TrainingDataPoint[]>> {
  const startTime = new Date(request.trainingPeriod.startDate).getTime()
  const endTime = new Date(request.trainingPeriod.endDate).getTime()
  const datasets: Record<string, TrainingDataPoint[]> = {}

  for (const pair of request.includedPairs) {
    const candles = await fetchHistoricalCandles({
      pair,
      interval: request.timeframe,
      startTime,
      endTime,
    })

    datasets[pair] = addIndicators(candles)
  }

  return datasets
}
