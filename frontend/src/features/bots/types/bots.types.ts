export type BotExecutionMode = 'paper' | 'semi_auto' | 'full_auto'
export type BotOperationalStatus = 'online' | 'offline'

export interface BotListItem {
  id: string
  userId?: string
  name: string
  strategy: string
  strategyId?: string
  templateId?: string
  templateSlug?: string
  templateName?: string
  indicatorType?: string
  specialization?: string
  executionMode?: BotExecutionMode
  isSystemManaged?: boolean
  description?: string
  currentPair?: string
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  lastAnalysis?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  modelVersion?: string
  modelUrl?: string
  hasModel?: boolean
  modelReady?: boolean
  modelArchitecture?: string
  validationStrategy?: string
  forecastHorizonCandles?: number
  operationalBlockReason?: string
  paperReadiness?: BotPaperReadiness
}

export interface BotTemplateSummary {
  id: string
  slug: string
  name: string
  strategyType: string
  indicatorType?: string
  specialization?: string
  description: string
  defaultParameters: Record<string, unknown>
  source: 'template' | 'legacy'
}

export interface BotDetail {
  id: string
  userId?: string
  name: string
  strategyType: string
  strategyId: string
  templateId?: string
  executionMode: BotExecutionMode
  isSystemManaged: boolean
  isCustom: boolean
  status: string
  isPaused: boolean
  currentPair?: string
  lastAnalysis?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  description?: string
  modelVersion: string
  modelUrl?: string
  hasModel: boolean
  modelReady: boolean
  modelArchitecture?: string
  validationStrategy?: string
  forecastHorizonCandles?: number
  operationalBlockReason?: string
  paperReadiness: BotPaperReadiness
  createdAt: string
  updatedAt: string
  template?: {
    id: string
    slug: string
    name: string
    strategyType: string
    indicatorType?: string
    specialization?: string
    description?: string
  }
  templateParameters: Record<string, unknown>
  instanceParameters: Record<string, unknown>
  effectiveParameters: Record<string, unknown>
  effectiveAllowedPairs: string[]
  allowedPairsSource: 'instance' | 'global'
  materializedFromTemplate?: boolean
}

export interface BotModelArtifact {
  id: string
  botId: string
  trainingSessionId?: string
  modelVersion: string
  modelUrl: string
  fingerprint: string
  architecture?: string
  validationStrategy?: string
  forecastHorizonCandles?: number
  governanceRole: 'champion' | 'challenger' | 'archived'
  isActive: boolean
  notes?: string
  promotedAt?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  evaluation: {
    bestEpoch?: number
    bestValLoss?: number
    accuracyPercent?: number
    f1Score?: number
    precision?: number
    recall?: number
    logLoss?: number
    walkForwardFolds?: number
  }
  reproducibility: {
    configFingerprint?: string
    metricsFingerprint?: string
    datasetFingerprint?: string
    featureFingerprint?: string
  }
}

export interface BotModelCatalog {
  botId: string
  items: BotModelArtifact[]
}

export interface BotHistoryTransaction {
  id: string
  date: string
  pair: string
  type: string
  quantity: number
  requestedQuantity: number
  price: number
  total: number
  fee: number
  feeCurrency: string
  status: string
  orderType: string
  origin: string
  profitBrl: number | null
  profitPercent: number | null
  externalStatus?: string
  syncedAt?: string
}

export interface BotHistoryTrace {
  id: string
  timestamp: string
  level: string
  module: string
  traceId: string
  functionName: string
  message: string
  durationMs: number
  currentPair?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  errorFlag: boolean
}

export interface BotHistoryTrainingSession {
  id: string
  status: string
  startTime: string
  endTime?: string
  bestEpoch?: number
  bestValLoss?: number
  createdAt: string
  updatedAt: string
}

export interface BotHistoryDecision {
  id: string
  pair: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  reason: string
  timeframe: string
  executionMode: BotExecutionMode
  executionStatus: 'skipped' | 'suggested' | 'submitted' | 'executed'
  modelVersion?: string
  modelUrl?: string
  modelArchitecture?: string
  horizonCandles: number
  decisionPrice: number
  requestedQuantity?: number
  executedQuantity?: number
  transactionId?: string
  slippagePercent?: number
  simulatedLatencyMs?: number
  simulatedFillPercent?: number
  createdAt: string
  dueAt: string
  evaluatedAt?: string
  evaluationStatus: 'pending' | 'evaluated'
  evaluationPrice?: number
  marketReturnPercent?: number
  strategyReturnPercent?: number
  realizedEdgePercent?: number
  actualLabel?: 'buy' | 'sell' | 'hold'
  expectedLabel?: 'buy' | 'sell' | 'hold'
  isCorrect?: boolean
}

export interface BotDecisionSummary {
  total: number
  pending: number
  evaluated: number
  correct: number
  accuracyPercent: number
  averageConfidence: number
  averageMarketReturnPercent: number
  averageStrategyReturnPercent: number
  bestEdgePercent: number
  worstEdgePercent: number
}

export interface BotPaperReadiness {
  readyForFullAuto: boolean
  evaluatedSignals: number
  pendingSignals: number
  minimumEvaluatedSignals: number
  accuracyPercent: number
  minimumAccuracyPercent: number
  averageStrategyReturnPercent: number
  minimumAverageStrategyReturnPercent: number
  averageEdgePercent: number
  minimumAverageEdgePercent: number
  maxObservedDrawdownPercent: number
  maximumDrawdownPercent: number
  maxConsecutiveIncorrect: number
  currentConsecutiveIncorrect: number
  maximumConsecutiveIncorrect: number
  lastEvaluatedAt?: string
  blockers: string[]
}

export interface BotHistory {
  botId: string
  transactions: BotHistoryTransaction[]
  traces: BotHistoryTrace[]
  trainingSessions: BotHistoryTrainingSession[]
  decisions: BotHistoryDecision[]
  decisionSummary: BotDecisionSummary
  paperReadiness: BotPaperReadiness
}

export interface BotWorkerStatus {
  running: boolean
}

export interface CreateBotPayload {
  templateId: string
  name: string
  description?: string
  executionMode: BotExecutionMode
  status: BotOperationalStatus
  parameters: Record<string, unknown>
}

export interface UpdateBotPayload {
  name?: string
  description?: string | null
  executionMode?: BotExecutionMode
  status?: BotOperationalStatus
  isPaused?: boolean
  parameters?: Record<string, unknown>
}
