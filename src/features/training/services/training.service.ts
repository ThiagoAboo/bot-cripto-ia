import type { 
  TrainingSession, 
  TrainingConfig, 
  BacktestResult,
  AvailableStrategy 
} from '../types/training.types'

// Mock delay para simular API
const MOCK_DELAY = 500

// Mock de estratégias disponíveis
const mockStrategies: AvailableStrategy[] = [
  { id: 'strategy_scalper', name: 'Scalper V2', strategyType: 'scalper', description: 'Operações rápidas com pequenos lucros' },
  { id: 'strategy_momentum', name: 'Momentum Trader', strategyType: 'momentum', description: 'Identifica moedas com forte momentum' },
  { id: 'strategy_trend', name: 'Trend Follower', strategyType: 'trend_follower', description: 'Segue tendências de médio/longo prazo' },
  { id: 'strategy_reversion', name: 'Mean Reversion', strategyType: 'mean_reversion', description: 'Identifica moedas sobrecompradas/sobrevendidas' },
  { id: 'strategy_arbitrage', name: 'Arbitrage Hunter', strategyType: 'arbitrage', description: 'Identifica oportunidades de arbitragem' },
]

// Mock de sessões de treinamento
const mockSessions: TrainingSession[] = [
  {
    id: 'session_1',
    botId: 'bot1',
    strategyId: 'strategy_scalper',
    strategyName: 'Scalper V2',
    status: 'completed',
    startTime: new Date(Date.now() - 7 * 24 * 3600000).toISOString(),
    endTime: new Date(Date.now() - 7 * 24 * 3600000 + 3600000).toISOString(),
    config: {} as TrainingConfig,
    metrics: [],
    logs: [],
    bestEpoch: 85,
    bestValLoss: 0.0089,
    modelUrl: '/models/scalper_v2.h5',
  },
  {
    id: 'session_2',
    botId: 'bot2',
    strategyId: 'strategy_momentum',
    strategyName: 'Momentum Trader',
    status: 'running',
    startTime: new Date().toISOString(),
    config: {} as TrainingConfig,
    metrics: [],
    logs: [],
  },
]

export const trainingService = {
  async getStrategies(): Promise<AvailableStrategy[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...mockStrategies]), MOCK_DELAY)
    })
  },

  async getSessions(strategyId?: string): Promise<TrainingSession[]> {
    let sessions = [...mockSessions]
    if (strategyId) {
      sessions = sessions.filter(s => s.strategyId === strategyId)
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(sessions), MOCK_DELAY)
    })
  },

  async getSession(sessionId: string): Promise<TrainingSession | null> {
    const session = mockSessions.find(s => s.id === sessionId)
    return new Promise((resolve) => {
      setTimeout(() => resolve(session || null), MOCK_DELAY)
    })
  },

  async createSession(config: TrainingConfig): Promise<TrainingSession> {
    const newSession: TrainingSession = {
      id: `session_${Date.now()}`,
      botId: config.botId,
      strategyId: config.strategyId,
      strategyName: mockStrategies.find(s => s.id === config.strategyId)?.name || 'Unknown',
      status: 'pending',
      startTime: new Date().toISOString(),
      config,
      metrics: [],
      logs: [],
    }
    mockSessions.unshift(newSession)
    return new Promise((resolve) => {
      setTimeout(() => resolve(newSession), MOCK_DELAY)
    })
  },

  async pauseSession(sessionId: string): Promise<void> {
    const session = mockSessions.find(s => s.id === sessionId)
    if (session && session.status === 'running') {
      session.status = 'paused'
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async resumeSession(sessionId: string): Promise<void> {
    const session = mockSessions.find(s => s.id === sessionId)
    if (session && session.status === 'paused') {
      session.status = 'running'
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async cancelSession(sessionId: string): Promise<void> {
    const session = mockSessions.find(s => s.id === sessionId)
    if (session && (session.status === 'pending' || session.status === 'running' || session.status === 'paused')) {
      session.status = 'cancelled'
      session.endTime = new Date().toISOString()
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async testSession(sessionId: string): Promise<BacktestResult> {
    const mockResult: BacktestResult = {
      sessionId,
      testPeriod: { startDate: new Date(Date.now() - 30 * 24 * 3600000).toISOString(), endDate: new Date().toISOString() },
      totalTrades: 145,
      winRate: 68.5,
      totalProfit: 12500.75,
      sharpeRatio: 1.85,
      maxDrawdown: -12.5,
      profitFactor: 1.92,
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockResult), MOCK_DELAY * 2)
    })
  },

  async saveModel(sessionId: string): Promise<{ success: boolean; modelUrl: string }> {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ 
        success: true, 
        modelUrl: `/models/${sessionId}.h5` 
      }), MOCK_DELAY)
    })
  },

  async downloadModel(_sessionId: string): Promise<Blob> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(new Blob(['mock model data'], { type: 'application/octet-stream' })), MOCK_DELAY)
    })
  },

  async getAvailablePairs(): Promise<string[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve([
        'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
        'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
        'MATIC/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT',
      ]), MOCK_DELAY)
    })
  },
}