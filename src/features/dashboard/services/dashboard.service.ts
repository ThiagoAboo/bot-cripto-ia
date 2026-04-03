import type {
  TotalBalance,
  CurrencyBalance,
  RecentTransaction,
  BotStatus,
  PerformanceData,
} from '../types/dashboard.types'

// Mock data para desenvolvimento (será substituído pela API real)
const MOCK_DELAY = 500

const mockTotalBalance: TotalBalance = {
  totalBrl: 45230.75,
  dailyProfitBrl: 1250.30,
  dailyProfitPercent: 2.84,
  totalPnlBrl: 10230.75,
  totalPnlPercent: 29.2,
  hitRate: 68.5,
  usdtBrlRate: 5.85,
}

const mockCurrenciesBalance: CurrencyBalance[] = [
  {
    currency: 'BTC',
    balanceBrl: 28900.00,
    dailyProfitBrl: 890.50,
    dailyProfitPercent: 3.18,
    totalPnlBrl: 8500.00,
    totalPnlPercent: 41.7,
    hitRate: 72.0,
    usdtBrlRate: 5.85,
  },
  {
    currency: 'ETH',
    balanceBrl: 12300.00,
    dailyProfitBrl: 310.20,
    dailyProfitPercent: 2.59,
    totalPnlBrl: 2100.00,
    totalPnlPercent: 20.6,
    hitRate: 65.0,
    usdtBrlRate: 5.85,
  },
  {
    currency: 'SOL',
    balanceBrl: 4030.75,
    dailyProfitBrl: 49.60,
    dailyProfitPercent: 1.24,
    totalPnlBrl: -369.25,
    totalPnlPercent: -8.4,
    hitRate: 45.0,
    usdtBrlRate: 5.85,
  },
]

const mockRecentTransactions: RecentTransaction[] = [
  {
    id: '1',
    date: new Date().toISOString(),
    pair: 'BTC/USDT',
    type: 'buy',
    entryPrice: 62000,
    exitPrice: 63500,
    amount: 0.05,
    fee: 12.50,
    profitBrl: 4387.50,
    profitPercent: 2.42,
    botId: 'bot1',
    botName: 'Scalper V2',
  },
  {
    id: '2',
    date: new Date(Date.now() - 3600000).toISOString(),
    pair: 'ETH/USDT',
    type: 'sell',
    entryPrice: 3200,
    exitPrice: 3150,
    amount: 1.2,
    fee: 8.20,
    profitBrl: -351.00,
    profitPercent: -1.56,
    botId: 'bot2',
    botName: 'Momentum Trader',
  },
]

const mockBotsStatus: BotStatus[] = [
  { 
    id: 'bot1', 
    name: 'Scalper V2', 
    strategy: 'Scalper',
    description: 'Operações rápidas com pequenos lucros.',
    currentPair: 'BTC/USDT',
    status: 'online', 
    isPaused: false,
    recommendedAction: 'buy',
    confidence: 78,
    lastAnalysis: new Date().toISOString(),
  },
  { 
    id: 'bot2', 
    name: 'Momentum Trader', 
    strategy: 'Momentum',
    description: 'Identifica moedas com forte momentum.',
    currentPair: 'ETH/USDT',
    status: 'online', 
    isPaused: true,
    recommendedAction: 'hold',
    confidence: 45,
    lastAnalysis: new Date().toISOString(),
  },
  { 
    id: 'bot3', 
    name: 'Trend Follower', 
    strategy: 'Trend Following',
    description: 'Segue tendências de médio/longo prazo.',
    currentPair: 'SOL/USDT',
    status: 'training', 
    isPaused: false,
    recommendedAction: 'sell',
    confidence: 62,
    lastAnalysis: new Date().toISOString(),
  },
  { 
    id: 'bot4', 
    name: 'Arbitrage Hunter', 
    strategy: 'Arbitrage',
    description: 'Identifica oportunidades de arbitragem.',
    currentPair: 'ADA/USDT',
    status: 'error', 
    isPaused: false,
    recommendedAction: 'hold',
    confidence: 0,
    lastAnalysis: new Date().toISOString(),
  },
  { 
    id: 'bot5', 
    name: 'Mean Reversion', 
    strategy: 'Mean Reversion',
    description: 'Identifica moedas sobrecompradas/sobrevendidas.',
    currentPair: 'DOGE/USDT',
    status: 'online', 
    isPaused: false,
    recommendedAction: 'buy',
    confidence: 85,
    lastAnalysis: new Date().toISOString(),
  },
]

export const dashboardService = {
  async getTotalBalance(): Promise<TotalBalance> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockTotalBalance), MOCK_DELAY)
    })
  },

  async getCurrenciesBalance(): Promise<CurrencyBalance[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockCurrenciesBalance), MOCK_DELAY)
    })
  },

  async getRecentTransactions(limit: number = 5): Promise<RecentTransaction[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockRecentTransactions.slice(0, limit)), MOCK_DELAY)
    })
  },

  async getBotsStatus(): Promise<BotStatus[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockBotsStatus), MOCK_DELAY)
    })
  },

  async getPerformanceData(period: '24h' | '7d' | '30d' | 'total'): Promise<PerformanceData> {
    const mockData: PerformanceData = {
      period,
      data: Array.from({ length: period === '24h' ? 24 : 30 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        balance: 40000 + Math.random() * 10000,
      })),
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockData), MOCK_DELAY)
    })
  },

  async pauseBot(_botId: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async resumeBot(_botId: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },
}