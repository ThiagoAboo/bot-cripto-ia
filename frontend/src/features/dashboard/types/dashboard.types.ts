// Tipos específicos do Dashboard

export interface TotalBalance {
  totalBrl: number
  dailyProfitBrl: number
  dailyProfitPercent: number
  totalPnlBrl: number
  totalPnlPercent: number
  hitRate: number
  usdtBrlRate: number
  lastUpdate?: string
}

export interface CurrencyBalance {
  currency: string
  balanceBrl: number
  dailyProfitBrl: number
  dailyProfitPercent: number
  totalPnlBrl: number
  totalPnlPercent: number
  hitRate: number
  usdtBrlRate: number
}

export interface RecentTransaction {
  id: string
  date: string
  pair: string
  type: 'buy' | 'sell'
  entryPrice: number
  exitPrice: number
  amount: number
  fee: number
  profitBrl: number
  profitPercent: number
  botId?: string
  botName?: string
}

export interface BotStatus {
  id: string
  name: string
  strategy: string
  strategyId?: string
  templateId?: string
  templateSlug?: string
  templateName?: string
  indicatorType?: string
  specialization?: string
  executionMode?: string
  description?: string
  focusPair?: string
  currentPair?: string
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  lastAnalysis?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
}

export interface BotAnalysisSpecialist {
  specialist: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  reason: string
  indicators: Record<string, number | null>
}

export interface BotAnalysisOpportunity {
  pair: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  price: number
  reason: string
  specialists: BotAnalysisSpecialist[]
}

export interface BotSocialSignal {
  symbol: string
  pair: string
  score: number
  mentions: number
  sentiment: 'bullish' | 'neutral' | 'bearish'
  sources: string[]
}

export interface BotAnalysis {
  botId: string
  botName: string
  strategyId: string
  templateId?: string
  templateName?: string
  primarySpecialist: string
  timeframe: string
  generatedAt: string
  analyzedPairs: string[]
  summary: {
    analyzedPairs: number
    actionablePairs: number
    buySignals: number
    sellSignals: number
    holdSignals: number
  }
  bestOpportunity?: BotAnalysisOpportunity
  opportunities: BotAnalysisOpportunity[]
  socialSignals: BotSocialSignal[]
}

export interface BotCycleExecution {
  mode: 'paper' | 'semi_auto' | 'full_auto'
  status: 'skipped' | 'suggested' | 'submitted' | 'executed'
  reason: string
  pair?: string
  action?: 'buy' | 'sell' | 'hold'
  quantity?: number
  rank?: number
  source?: 'analysis' | 'risk_override'
  transaction?: {
    id: string
    date: string
    pair: string
    origin: string
    botId?: string
    type: string
    quantity: number
    requestedQuantity?: number
    price: number
    total: number
    fee: number
    feeCurrency: string
    feeRateApplied: number
    feeDiscountSource?: string
    status: string
    orderType?: string
    externalOrderId?: string
    externalClientOrderId?: string
    externalStatus?: string
    syncedAt?: string
    profitBrl: number | null
    profitPercent: number | null
  }
}

export interface BotCycleResult {
  botId: string
  botName: string
  generatedAt: string
  analysis: BotAnalysis
  execution: BotCycleExecution
  plans?: BotCycleExecution[]
}

export interface PerformanceData {
  period: '24h' | '7d' | '30d' | 'total'
  data: Array<{
    timestamp: string
    balance: number
  }>
}
