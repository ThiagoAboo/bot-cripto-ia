import { fetchHistoricalCandles } from './binance.service'
import { readTrainingUpload } from './training-upload.service'

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
  dataSource?: 'exchange' | 'synthetic' | 'upload'
  includedPairs: string[]
  timeframe: string
  trainingPeriod: {
    startDate: string
    endDate: string
  }
  uploadedFileUrl?: string
}

const MAX_SYNTHETIC_POINTS = 5000
const TIMEFRAME_TO_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
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

function parseNumberValue(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  let candidate = normalized
  if (candidate.includes(',') && candidate.includes('.')) {
    candidate = candidate.lastIndexOf(',') > candidate.lastIndexOf('.')
      ? candidate.replace(/\./g, '').replace(',', '.')
      : candidate.replace(/,/g, '')
  } else if (candidate.includes(',')) {
    candidate = candidate.replace(',', '.')
  }

  const parsed = Number(candidate)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && char === delimiter) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values.map((value) => value.trim())
}

function normalizeCsvHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
}

function getCsvValue(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) {
      return row[candidate]
    }
  }

  return undefined
}

function toIsoTimestamp(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }

  const numeric = Number(normalized)
  if (Number.isFinite(numeric)) {
    const parsedNumeric = new Date(numeric)
    if (!Number.isNaN(parsedNumeric.getTime())) {
      return parsedNumeric.toISOString()
    }
  }

  return null
}

function buildSyntheticSeries(pair: string, request: TrainingDataRequest): TrainingDataPoint[] {
  const intervalMs = TIMEFRAME_TO_MS[request.timeframe] ?? TIMEFRAME_TO_MS['1h']
  const startTime = new Date(request.trainingPeriod.startDate).getTime()
  const endTime = new Date(request.trainingPeriod.endDate).getTime()
  const pairSeed = pair.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const points: TrainingDataPoint[] = []

  let cursor = startTime
  let index = 0
  let previousClose = 100 + (pairSeed % 35)

  while (cursor <= endTime && index < MAX_SYNTHETIC_POINTS) {
    const wave = Math.sin((index + pairSeed) * 0.19) * 2.8
    const trend = Math.cos((index + pairSeed) * 0.03) * 0.45
    const open = previousClose
    const close = Math.max(0.1, open + wave + trend)
    const high = Math.max(open, close) + Math.abs(Math.sin((index + pairSeed) * 0.11)) * 1.6
    const low = Math.max(0.05, Math.min(open, close) - Math.abs(Math.cos((index + pairSeed) * 0.13)) * 1.4)
    const volume = 1000 + (Math.abs(Math.sin((index + pairSeed) * 0.07)) * 4500)

    points.push({
      timestamp: new Date(cursor).toISOString(),
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: Number(volume.toFixed(2)),
    })

    previousClose = close
    cursor += intervalMs
    index += 1
  }

  return addIndicators(points)
}

function parseUploadedCsvDataset(content: string, request: TrainingDataRequest): Record<string, TrainingDataPoint[]> {
  const normalizedContent = content.replace(/^\uFEFF/, '').trim()
  if (!normalizedContent) {
    throw new Error('O arquivo CSV enviado está vazio')
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error('O CSV precisa conter cabeçalho e pelo menos uma linha de dados')
  }

  const delimiter = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ','
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeCsvHeader)
  const datasets = new Map<string, TrainingDataPoint[]>()
  const fallbackPair = request.includedPairs[0] ?? 'UPLOAD/CSV'
  const rangeStart = new Date(request.trainingPeriod.startDate).getTime()
  const rangeEnd = new Date(request.trainingPeriod.endDate).getTime() + (24 * 60 * 60 * 1000) - 1

  for (const line of lines.slice(1)) {
    const columns = parseDelimitedLine(line, delimiter)
    if (columns.every((column) => column === '')) {
      continue
    }

    const row = headers.reduce<Record<string, string>>((accumulator, header, index) => {
      accumulator[header] = columns[index] ?? ''
      return accumulator
    }, {})

    const timestamp = toIsoTimestamp(getCsvValue(row, ['timestamp', 'datetime', 'date', 'time', 'opentime', 'open_time']))
    const open = parseNumberValue(getCsvValue(row, ['open', 'opening']))
    const high = parseNumberValue(getCsvValue(row, ['high', 'max']))
    const low = parseNumberValue(getCsvValue(row, ['low', 'min']))
    const close = parseNumberValue(getCsvValue(row, ['close', 'closing']))
    const volume = parseNumberValue(getCsvValue(row, ['volume', 'vol']))

    if (!timestamp || open === null || high === null || low === null || close === null || volume === null) {
      continue
    }

    const timestampMs = new Date(timestamp).getTime()
    if (Number.isNaN(timestampMs) || timestampMs < rangeStart || timestampMs > rangeEnd) {
      continue
    }

    const pair = (getCsvValue(row, ['pair', 'symbol', 'asset']) || fallbackPair).toUpperCase()
    const currentSeries = datasets.get(pair) ?? []
    currentSeries.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      SMA_7: parseNumberValue(getCsvValue(row, ['sma_7', 'sma7'])),
      SMA_14: parseNumberValue(getCsvValue(row, ['sma_14', 'sma14'])),
      EMA_7: parseNumberValue(getCsvValue(row, ['ema_7', 'ema7'])),
      RSI: parseNumberValue(getCsvValue(row, ['rsi'])),
      MACD: parseNumberValue(getCsvValue(row, ['macd'])),
      BB_upper: parseNumberValue(getCsvValue(row, ['bb_upper', 'bbupper', 'bollinger_upper'])),
      BB_lower: parseNumberValue(getCsvValue(row, ['bb_lower', 'bblower', 'bollinger_lower'])),
    })
    datasets.set(pair, currentSeries)
  }

  if (datasets.size === 0) {
    throw new Error('Nenhuma linha válida foi encontrada no CSV enviado')
  }

  return Object.fromEntries(
    Array.from(datasets.entries()).map(([pair, points]) => [
      pair,
      addIndicators(
        points.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()),
      ),
    ]),
  )
}

export async function collectTrainingData(request: TrainingDataRequest): Promise<Record<string, TrainingDataPoint[]>> {
  const dataSource = request.dataSource ?? 'exchange'

  if (dataSource === 'upload') {
    if (!request.uploadedFileUrl) {
      throw new Error('uploadedFileUrl é obrigatório para dataSource upload')
    }

    const upload = await readTrainingUpload(request.uploadedFileUrl)
    return parseUploadedCsvDataset(upload.content, request)
  }

  if (dataSource === 'synthetic') {
    return Object.fromEntries(
      request.includedPairs.map((pair) => [pair, buildSyntheticSeries(pair, request)]),
    )
  }

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
