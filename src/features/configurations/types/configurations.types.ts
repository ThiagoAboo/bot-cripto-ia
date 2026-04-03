// Tipos específicos da tela de Configurações

export interface ExchangeApiKeys {
    exchange: 'binance' | 'kucoin' | 'bybit'
    apiKey: string
    secretKey: string
  }
  
  export interface RiskManagement {
    stopLossPercent: number
    takeProfitPercent: number
    leverage: number
    maxTradeAmount: number
    maxTradeAmountUnit: 'USDT' | 'percent'
  }
  
  export interface FeesConfig {
    discountUsdtPercent: number
    discountBnbPercent: number
    minBnbBalance: number
  }
  
  export interface AdvancedOptions {
    mode: 'spot' | 'futures'
    orderType: 'market' | 'limit'
    slippagePercent: number
  }
  
  export interface StrategyConfig {
    id: string
    name: string
    strategyType: 'scalper' | 'momentum' | 'trend_follower' | 'mean_reversion' | 'arbitrage'
    isActive: boolean
    parameters: Record<string, any>
  }
  
  export interface BotParameters {
    riskManagement: RiskManagement
    allowedPairs: string[]  // Moedas permitidas
    fees: FeesConfig
    advanced: AdvancedOptions
    strategies: StrategyConfig[]
  }
  
  export interface Configurations {
    exchangeApiKeys: ExchangeApiKeys
    botParameters: BotParameters
  }
  
  // Tipos específicos para cada estratégia
  export interface ScalperParams {
    timeframe: '1m' | '5m' | '15m'
    maxSpread: number
    minVolume: number
    takeProfitTicks: number
    stopLossTicks: number
  }
  
  export interface MomentumParams {
    period: number
    threshold: number
    rsiPeriod: number
    rsiOverbought: number
    rsiOversold: number
  }
  
  export interface TrendFollowerParams {
    fastEma: number
    slowEma: number
    adxPeriod: number
    adxThreshold: number
  }
  
  export interface MeanReversionParams {
    bbPeriod: number
    bbStdDev: number
    rsiPeriod: number
    rsiLower: number
    rsiUpper: number
  }
  
  export interface ArbitrageParams {
    minSpreadPercent: number
    maxLatencyMs: number
    minLiquidity: number
  }