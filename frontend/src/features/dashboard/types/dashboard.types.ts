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
  description?: string
  currentPair?: string
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  lastAnalysis?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
}

export interface PerformanceData {
  period: '24h' | '7d' | '30d' | 'total'
  data: Array<{
    timestamp: string
    balance: number
  }>
}