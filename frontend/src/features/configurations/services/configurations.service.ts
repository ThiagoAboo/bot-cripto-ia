import type {
  Configurations,
  ExchangeApiKeys,
  ScalperParams,
  MomentumParams,
  TrendFollowerParams,
  MeanReversionParams,
  ArbitrageParams,
} from '../types/configurations.types'

// Mock delay para simular API
const MOCK_DELAY = 500

// Configurações padrão mock
const mockConfigurations: Configurations = {
  exchangeApiKeys: {
    exchange: 'binance',
    apiKey: '',
    secretKey: '',
  },
  botParameters: {
    riskManagement: {
      stopLossPercent: 5.0,
      takeProfitPercent: 10.0,
      leverage: 1,
      maxTradeAmount: 1000,
      maxTradeAmountUnit: 'USDT',
    },
    allowedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'DOGE/USDT', 'ADA/USDT'],
    fees: {
      discountUsdtPercent: 0.075,
      discountBnbPercent: 0.075,
      minBnbBalance: 0.01,
    },
    advanced: {
      mode: 'spot',
      orderType: 'market',
      slippagePercent: 0.5,
    },
    strategies: [
      {
        id: 'strategy_scalper',
        name: 'Scalper V2',
        strategyType: 'scalper',
        isActive: true,
        parameters: {
          timeframe: '1m',
          maxSpread: 0.1,
          minVolume: 100000,
          takeProfitTicks: 5,
          stopLossTicks: 3,
        } as ScalperParams,
      },
      {
        id: 'strategy_momentum',
        name: 'Momentum Trader',
        strategyType: 'momentum',
        isActive: true,
        parameters: {
          period: 14,
          threshold: 2.5,
          rsiPeriod: 14,
          rsiOverbought: 70,
          rsiOversold: 30,
        } as MomentumParams,
      },
      {
        id: 'strategy_trend',
        name: 'Trend Follower',
        strategyType: 'trend_follower',
        isActive: true,
        parameters: {
          fastEma: 20,
          slowEma: 50,
          adxPeriod: 14,
          adxThreshold: 25,
        } as TrendFollowerParams,
      },
      {
        id: 'strategy_reversion',
        name: 'Mean Reversion',
        strategyType: 'mean_reversion',
        isActive: true,
        parameters: {
          bbPeriod: 20,
          bbStdDev: 2,
          rsiPeriod: 14,
          rsiLower: 30,
          rsiUpper: 70,
        } as MeanReversionParams,
      },
      {
        id: 'strategy_arbitrage',
        name: 'Arbitrage Hunter',
        strategyType: 'arbitrage',
        isActive: false,
        parameters: {
          minSpreadPercent: 0.5,
          maxLatencyMs: 100,
          minLiquidity: 50000,
        } as ArbitrageParams,
      },
    ],
  },
}

export const configurationsService = {
  async getConfigurations(): Promise<Configurations> {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ ...mockConfigurations }), MOCK_DELAY)
    })
  },

  async saveConfigurations(config: Configurations): Promise<void> {
    return new Promise((resolve) => {
      Object.assign(mockConfigurations, config)
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async testConnection(apiKeys: ExchangeApiKeys): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (apiKeys.apiKey && apiKeys.secretKey) {
          resolve({ success: true, message: 'Conexão estabelecida com sucesso!' })
        } else {
          resolve({ success: false, message: 'Chaves de API inválidas' })
        }
      }, MOCK_DELAY)
    })
  },

  async getAvailablePairs(): Promise<string[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
          'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
        ])
      }, MOCK_DELAY)
    })
  },
}