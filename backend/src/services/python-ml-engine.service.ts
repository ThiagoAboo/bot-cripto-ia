import { spawn } from 'child_process'
import path from 'path'
import { collectTrainingData, type TrainingDataPoint } from './training-data.service'
import type {
  SupportedTrainingArchitecture as TrainingArchitecture,
  TrainingSessionConfig as TrainingConfig,
} from './training-evaluation.service'

interface MarketSnapshot {
  pair: string
  currentPrice: number
  candles: Array<{
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
  socialSignal?: {
    pair: string
    mentions: number
    score: number
    source?: string
  }
}

export interface PythonEnginePackage {
  provider: 'python'
  serializer: 'joblib' | 'torch'
  architecture: TrainingArchitecture
  task: 'multiclass_trade_classifier'
  inputMode: 'tabular' | 'sequence'
  sequenceLength: number
  featureNames: string[]
  classes: Array<'hold' | 'buy' | 'sell'>
  payloadBase64: string
}

export interface PythonTrainingMetric {
  epoch: number
  trainLoss: number
  valLoss: number
  trainAccuracy?: number
  valAccuracy?: number
  precision?: number
  recall?: number
  f1Score?: number
  logLoss?: number
  learningRate: number
  duration: number
}

export interface PythonTrainingEvaluation {
  architecture: string
  architectureLabel: string
  validationStrategy: 'holdout' | 'walk_forward'
  validationSplitPercent: number
  walkForwardFolds: number
  labelConfiguration: {
    horizonCandles: number
    buyThresholdPercent: number
    sellThresholdPercent: number
  }
  bestEpoch: number | null
  bestValLoss: number | null
  bestAccuracy: number | null
  bestF1Score: number | null
  logLoss: number | null
  benchmark: {
    baseline: 'buy_and_hold'
    baselineAccuracy: number
    modelEdgePercent: number
  }
  confusionMatrix: Record<string, Record<string, number>>
}

export interface PythonTrainingResult {
  metrics: PythonTrainingMetric[]
  evaluation: PythonTrainingEvaluation
  enginePackage: PythonEnginePackage
}

export interface PythonBacktestResult {
  sessionId: string
  testPeriod: { startDate: string; endDate: string }
  totalTrades: number
  winRate: number
  totalProfit: number
  sharpeRatio: number
  maxDrawdown: number
  profitFactor: number
  benchmark: {
    strategy: 'buy_and_hold'
    label: string
    baselineCapital: number
    totalProfit: number
    totalReturnPercent: number
    outperformanceBrl: number
    outperformancePercent: number
  }
  benchmarks: Array<{
    strategy: 'buy_and_hold' | 'dca'
    label: string
    baselineCapital: number
    totalProfit: number
    totalReturnPercent: number
    outperformanceBrl: number
    outperformancePercent: number
  }>
  pairBreakdown: Array<{
    pair: string
    totalTrades: number
    winRate: number
    totalProfit: number
    averageReturnPercent: number
  }>
  validation: {
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
    windows: Array<{
      index: number
      startDate: string
      endDate: string
      totalTrades: number
      winRate: number
      totalProfit: number
    }>
  }
}

export interface PythonPredictionOpportunity {
  pair: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  probabilities: {
    hold: number
    buy: number
    sell: number
  }
  reason: string
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

function resolvePythonExecutable(): string {
  return process.env.PYTHON_ML_EXECUTABLE || 'python'
}

function resolvePythonEngineScriptPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'bots', 'python', 'engine.py')
}

function resolveProvider(): 'python' | 'simulated' {
  if (process.env.TRAINING_ML_ENGINE_PROVIDER === 'python') {
    return 'python'
  }

  if (process.env.TRAINING_ML_ENGINE_PROVIDER === 'simulated') {
    return 'simulated'
  }

  return process.env.NODE_ENV === 'test' ? 'simulated' : 'python'
}

export function isPythonMlEngineEnabled(): boolean {
  return resolveProvider() === 'python'
}

function normalizeDate(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : fallback
  if (Number.isNaN(parsed.getTime())) {
    return fallback
  }

  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function buildTestPeriod(config: TrainingConfig): { startDate: string; endDate: string } {
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

async function runPythonEngine<T>(command: 'train' | 'backtest' | 'predict', payload: Record<string, unknown>): Promise<T> {
  const executable = resolvePythonExecutable()
  const scriptPath = resolvePythonEngineScriptPath()

  return new Promise<T>((resolve, reject) => {
    const child = spawn(executable, [scriptPath, command], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python engine exited with code ${code}`))
        return
      }

      try {
        resolve(JSON.parse(stdout) as T)
      } catch (error) {
        reject(new Error(`Invalid JSON from python engine: ${String(error)}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`))
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

export async function trainRealModelPackage(config: TrainingConfig): Promise<PythonTrainingResult> {
  const datasets = await collectTrainingData({
    dataSource: config.dataSource,
    includedPairs: config.includedPairs ?? [],
    timeframe: config.timeframe ?? '1h',
    trainingPeriod: {
      startDate: config.trainingPeriod?.startDate ?? formatDate(new Date(Date.now() - (90 * DAY_IN_MS))),
      endDate: config.trainingPeriod?.endDate ?? formatDate(new Date()),
    },
    uploadedFileUrl: config.uploadedFileUrl,
  })

  return runPythonEngine<PythonTrainingResult>('train', {
    config,
    datasets,
  })
}

export async function runRealBacktest(
  sessionId: string,
  config: TrainingConfig,
): Promise<PythonBacktestResult> {
  const trainingPeriod = {
    startDate: config.trainingPeriod?.startDate ?? formatDate(new Date(Date.now() - (90 * DAY_IN_MS))),
    endDate: config.trainingPeriod?.endDate ?? formatDate(new Date(Date.now() - (31 * DAY_IN_MS))),
  }
  const testPeriod = buildTestPeriod(config)

  const [trainingDatasets, testDatasets] = await Promise.all([
    collectTrainingData({
      dataSource: config.dataSource,
      includedPairs: config.includedPairs ?? [],
      timeframe: config.timeframe ?? '1h',
      trainingPeriod,
      uploadedFileUrl: config.uploadedFileUrl,
    }),
    collectTrainingData({
      dataSource: config.dataSource,
      includedPairs: config.includedPairs ?? [],
      timeframe: config.timeframe ?? '1h',
      trainingPeriod: testPeriod,
      uploadedFileUrl: config.uploadedFileUrl,
    }),
  ])

  return runPythonEngine<PythonBacktestResult>('backtest', {
    sessionId,
    config,
    trainingDatasets,
    testDatasets,
    testPeriod,
  })
}

export async function predictWithRealModelArtifact(
  artifactPath: string,
  marketSnapshots: MarketSnapshot[],
): Promise<{
  primarySpecialist: string
  opportunities: PythonPredictionOpportunity[]
}> {
  return runPythonEngine('predict', {
    artifactPath,
    marketSnapshots,
  })
}

export type { TrainingConfig, TrainingDataPoint }
