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

export interface BotHistory {
  botId: string
  transactions: BotHistoryTransaction[]
  traces: BotHistoryTrace[]
  trainingSessions: BotHistoryTrainingSession[]
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
