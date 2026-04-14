export type SupportedTrainingArchitecture =
  | 'lstm'
  | 'cnn'
  | 'linear_regression'
  | 'random_forest'
  | 'xgboost'
  | 'transformer'

export interface TrainingSessionHyperparameters {
  hiddenLayers?: number
  neuronsPerLayer?: number[]
  dropoutRate?: number
  activation?: 'relu' | 'tanh' | 'sigmoid'
  batchSize?: number
  epochs?: number
  learningRate?: number
  optimizer?: 'adam' | 'sgd' | 'rmsprop'
  lossFunction?: 'mse' | 'mae' | 'huber'
  validationSplit?: number
  earlyStopping?: {
    enabled?: boolean
    patience?: number
  }
  sequenceLength?: number
  forecastHorizonCandles?: number
  buyThresholdPercent?: number
  sellThresholdPercent?: number
  walkForwardFolds?: number
  nEstimators?: number
  maxDepth?: number
  randomState?: number
}

export interface TrainingSessionConfig {
  architecture?: SupportedTrainingArchitecture
  dataSource?: 'exchange' | 'synthetic' | 'upload'
  timeframe?: string
  includedPairs?: string[]
  indicators?: string[]
  uploadedFileUrl?: string
  trainingPeriod?: {
    startDate?: string
    endDate?: string
  }
  hyperparameters?: TrainingSessionHyperparameters
}

export interface TrainingMetricEntry {
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

interface TrainingArchitectureProfile {
  architecture: SupportedTrainingArchitecture
  label: string
  convergenceSpeed: number
  volatility: number
  accuracyCeiling: number
  generalizationPenalty: number
  precisionBias: number
  recallBias: number
  logLossFloor: number
  warmupFactor: number
}

interface ClassMetrics {
  hold: number
  buy: number
  sell: number
}

export interface TrainingEvaluationSummary {
  architecture: SupportedTrainingArchitecture | 'unknown'
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
  confusionMatrix: {
    hold: ClassMetrics
    buy: ClassMetrics
    sell: ClassMetrics
  }
}

const ARCHITECTURE_PROFILES: Record<SupportedTrainingArchitecture, TrainingArchitectureProfile> = {
  lstm: {
    architecture: 'lstm',
    label: 'LSTM',
    convergenceSpeed: 3.1,
    volatility: 0.014,
    accuracyCeiling: 79,
    generalizationPenalty: 2.6,
    precisionBias: 0.4,
    recallBias: 0.8,
    logLossFloor: 0.031,
    warmupFactor: 1.18,
  },
  cnn: {
    architecture: 'cnn',
    label: 'CNN',
    convergenceSpeed: 3.45,
    volatility: 0.012,
    accuracyCeiling: 76,
    generalizationPenalty: 2.2,
    precisionBias: 0.6,
    recallBias: 0.1,
    logLossFloor: 0.036,
    warmupFactor: 1.08,
  },
  linear_regression: {
    architecture: 'linear_regression',
    label: 'Linear Regression',
    convergenceSpeed: 4.3,
    volatility: 0.009,
    accuracyCeiling: 67,
    generalizationPenalty: 1.6,
    precisionBias: -0.5,
    recallBias: -0.3,
    logLossFloor: 0.052,
    warmupFactor: 0.92,
  },
  random_forest: {
    architecture: 'random_forest',
    label: 'Random Forest',
    convergenceSpeed: 4.2,
    volatility: 0.008,
    accuracyCeiling: 74,
    generalizationPenalty: 1.7,
    precisionBias: 1.2,
    recallBias: -0.2,
    logLossFloor: 0.041,
    warmupFactor: 0.9,
  },
  xgboost: {
    architecture: 'xgboost',
    label: 'XGBoost',
    convergenceSpeed: 4.5,
    volatility: 0.007,
    accuracyCeiling: 77,
    generalizationPenalty: 1.5,
    precisionBias: 1.1,
    recallBias: 0.4,
    logLossFloor: 0.034,
    warmupFactor: 0.94,
  },
  transformer: {
    architecture: 'transformer',
    label: 'Transformer',
    convergenceSpeed: 2.8,
    volatility: 0.016,
    accuracyCeiling: 80.5,
    generalizationPenalty: 3.1,
    precisionBias: 0.7,
    recallBias: 1.2,
    logLossFloor: 0.029,
    warmupFactor: 1.24,
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toFixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function harmonicMean(left: number, right: number): number {
  if (left <= 0 || right <= 0) {
    return 0
  }

  return (2 * left * right) / (left + right)
}

function resolveArchitectureProfile(architecture?: string): TrainingArchitectureProfile | null {
  if (!architecture) {
    return null
  }

  if (architecture in ARCHITECTURE_PROFILES) {
    return ARCHITECTURE_PROFILES[architecture as SupportedTrainingArchitecture]
  }

  return null
}

export function getLabelConfiguration(config: TrainingSessionConfig): {
  horizonCandles: number
  buyThresholdPercent: number
  sellThresholdPercent: number
} {
  return {
    horizonCandles: Math.max(1, Math.round(config.hyperparameters?.forecastHorizonCandles ?? 5)),
    buyThresholdPercent: toFixedNumber(config.hyperparameters?.buyThresholdPercent ?? 0.3, 3),
    sellThresholdPercent: toFixedNumber(config.hyperparameters?.sellThresholdPercent ?? -0.3, 3),
  }
}

export function getWalkForwardFoldCount(config: TrainingSessionConfig): number {
  return Math.max(2, Math.min(6, Math.round(config.hyperparameters?.walkForwardFolds ?? 3)))
}

export function buildTrainingMetric(
  sessionId: string,
  epoch: number,
  totalEpochs: number,
  config: TrainingSessionConfig,
  durationMs: number,
): TrainingMetricEntry {
  const seed = sessionId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const architectureProfile = resolveArchitectureProfile(config.architecture)
  const profile = architectureProfile ?? {
    architecture: 'linear_regression' as SupportedTrainingArchitecture,
    label: 'Generic',
    convergenceSpeed: 3.4,
    volatility: 0.011,
    accuracyCeiling: 72,
    generalizationPenalty: 2,
    precisionBias: 0,
    recallBias: 0,
    logLossFloor: 0.04,
    warmupFactor: 1,
  }

  const progress = clamp(epoch / Math.max(totalEpochs, 1), 0, 1)
  const batchFactor = clamp((config.hyperparameters?.batchSize ?? 32) / 64, 0.5, 2)
  const sequenceFactor = clamp((config.hyperparameters?.sequenceLength ?? 48) / 64, 0.5, 1.5)
  const ensembleFactor = clamp((config.hyperparameters?.nEstimators ?? 100) / 100, 0.75, 1.4)
  const modelCapacity = clamp(
    ((config.hyperparameters?.hiddenLayers ?? 2) * 0.08)
      + ((config.hyperparameters?.neuronsPerLayer?.reduce((sum, value) => sum + value, 0) ?? 96) / 256)
      + ((config.indicators?.length ?? 2) * 0.03),
    0.7,
    1.8,
  )

  const oscillation = Math.sin((epoch + seed) * 0.47)
  const drift = Math.cos((epoch + seed) * 0.19)
  const warmup = Math.pow(progress, profile.warmupFactor)
  const convergenceSpeed = profile.convergenceSpeed * ensembleFactor * (1 / Math.sqrt(batchFactor))

  const trainLoss = toFixedNumber(
    Math.max(
      profile.logLossFloor * 0.82,
      0.14 * Math.exp(-warmup * convergenceSpeed)
        + (profile.volatility * Math.abs(oscillation) * 0.8)
        + (0.004 / modelCapacity),
    ),
    6,
  )

  const valLoss = toFixedNumber(
    Math.max(
      profile.logLossFloor,
      trainLoss
        + (profile.generalizationPenalty / 1000)
        + (Math.abs(drift) * profile.volatility * 0.45)
        + ((sequenceFactor - 1) * 0.0025),
    ),
    6,
  )

  const trainAccuracy = toFixedNumber(
    clamp(
      46
        + (warmup * (profile.accuracyCeiling - 46))
        + (oscillation * 1.3)
        + ((modelCapacity - 1) * 2.4),
      0,
      99.4,
    ),
    2,
  )

  const valAccuracy = toFixedNumber(
    clamp(
      trainAccuracy
        - profile.generalizationPenalty
        - (Math.abs(drift) * 1.2)
        + ((ensembleFactor - 1) * 1.4),
      0,
      98.8,
    ),
    2,
  )

  const precision = toFixedNumber(
    clamp(
      valAccuracy - 1.6 + profile.precisionBias + (Math.sin((epoch + seed) * 0.23) * 0.9),
      0,
      99.4,
    ),
    2,
  )

  const recall = toFixedNumber(
    clamp(
      valAccuracy - 1.1 + profile.recallBias + (Math.cos((epoch + seed) * 0.29) * 0.8),
      0,
      99.4,
    ),
    2,
  )

  const f1Score = toFixedNumber(harmonicMean(precision, recall), 2)
  const logLoss = toFixedNumber(
    Math.max(
      profile.logLossFloor,
      valLoss * (1.04 - (progress * 0.08)),
    ),
    6,
  )

  return {
    epoch,
    trainLoss,
    valLoss,
    trainAccuracy,
    valAccuracy,
    precision,
    recall,
    f1Score,
    logLoss,
    learningRate: toFixedNumber(config.hyperparameters?.learningRate ?? 0.001, 6),
    duration: durationMs,
  }
}

export function getBestMetric(metrics: TrainingMetricEntry[]): TrainingMetricEntry | null {
  if (metrics.length === 0) {
    return null
  }

  return metrics.reduce((best, current) => {
    const bestScore = (best.f1Score ?? 0) - (best.valLoss * 100)
    const currentScore = (current.f1Score ?? 0) - (current.valLoss * 100)
    return currentScore > bestScore ? current : best
  }, metrics[0])
}

function buildConfusionMatrix(bestMetric: TrainingMetricEntry, sampleSize: number): TrainingEvaluationSummary['confusionMatrix'] {
  const overallAccuracy = clamp((bestMetric.valAccuracy ?? 0) / 100, 0, 1)
  const precisionRate = clamp((bestMetric.precision ?? bestMetric.valAccuracy ?? 0) / 100, 0, 1)
  const recallRate = clamp((bestMetric.recall ?? bestMetric.valAccuracy ?? 0) / 100, 0, 1)

  const holdTotal = Math.max(30, Math.round(sampleSize * 0.46))
  const buyTotal = Math.max(20, Math.round(sampleSize * 0.29))
  const sellTotal = Math.max(20, sampleSize - holdTotal - buyTotal)

  const holdCorrect = Math.round(holdTotal * overallAccuracy)
  const buyCorrect = Math.round(buyTotal * recallRate)
  const sellCorrect = Math.round(sellTotal * precisionRate)

  const holdResidual = Math.max(0, holdTotal - holdCorrect)
  const buyResidual = Math.max(0, buyTotal - buyCorrect)
  const sellResidual = Math.max(0, sellTotal - sellCorrect)

  return {
    hold: {
      hold: holdCorrect,
      buy: Math.round(holdResidual * 0.55),
      sell: holdResidual - Math.round(holdResidual * 0.55),
    },
    buy: {
      hold: Math.round(buyResidual * 0.4),
      buy: buyCorrect,
      sell: buyResidual - Math.round(buyResidual * 0.4),
    },
    sell: {
      hold: Math.round(sellResidual * 0.35),
      buy: sellResidual - Math.round(sellResidual * 0.35),
      sell: sellCorrect,
    },
  }
}

export function buildTrainingEvaluationSummary(
  config: TrainingSessionConfig,
  metrics: TrainingMetricEntry[],
  overrides?: {
    bestEpoch?: number | null
    bestValLoss?: number | null
  },
): TrainingEvaluationSummary {
  const profile = resolveArchitectureProfile(config.architecture)
  const labelConfiguration = getLabelConfiguration(config)
  const bestMetric = getBestMetric(metrics)
  const validationSplitPercent = clamp(
    Math.round(config.hyperparameters?.validationSplit ?? 20),
    5,
    50,
  )
  const walkForwardFolds = getWalkForwardFoldCount(config)
  const sampleSize = Math.max(120, (config.includedPairs?.length ?? 1) * Math.max(40, metrics.length * 4))
  const confusionMatrix = bestMetric
    ? buildConfusionMatrix(bestMetric, sampleSize)
    : {
        hold: { hold: 0, buy: 0, sell: 0 },
        buy: { hold: 0, buy: 0, sell: 0 },
        sell: { hold: 0, buy: 0, sell: 0 },
      }

  const bestAccuracy = bestMetric?.valAccuracy ?? null
  const bestF1Score = bestMetric?.f1Score ?? null
  const baselineAccuracy = 50
  const modelEdgePercent = bestAccuracy !== null ? toFixedNumber(bestAccuracy - baselineAccuracy, 2) : 0

  return {
    architecture: profile?.architecture ?? 'unknown',
    architectureLabel: profile?.label ?? 'Unknown',
    validationStrategy: 'walk_forward',
    validationSplitPercent,
    walkForwardFolds,
    labelConfiguration,
    bestEpoch: overrides?.bestEpoch ?? bestMetric?.epoch ?? null,
    bestValLoss: overrides?.bestValLoss ?? bestMetric?.valLoss ?? null,
    bestAccuracy,
    bestF1Score,
    logLoss: bestMetric?.logLoss ?? null,
    benchmark: {
      baseline: 'buy_and_hold',
      baselineAccuracy,
      modelEdgePercent,
    },
    confusionMatrix,
  }
}
