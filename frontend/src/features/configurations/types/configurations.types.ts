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
    useBnbForFees: boolean
    discountUsdtPercent: number
    discountBnbPercent: number
    minBnbBalance: number
    reserveBnbForFeesEnabled: boolean
  }

  export interface PairDiscoverySources {
    reddit: boolean
    rss: boolean
    x: boolean
    telegram: boolean
  }

  export interface PairDiscoveryConfig {
    autoDiscoveryEnabled: boolean
    autoAddToAllowedPairs: boolean
    autoRemoveFromAllowedPairs: boolean
    reviewRequired: boolean
    autoSyncIntervalMinutes: number
    sources: PairDiscoverySources
    minSocialScore: number
    minMentions: number
    maxPairs: number
    excludedAssets: string[]
    managedPairs?: string[]
    lastSyncAt?: string
    lastAppliedAt?: string
    lastSyncStatus?: 'idle' | 'previewed' | 'applied' | 'skipped' | 'error'
    lastSyncSummary?: string
  }

  export type SocialSource = 'reddit' | 'rss' | 'x' | 'telegram'
  export type SocialSentiment = 'bullish' | 'neutral' | 'bearish'

  export interface SocialSignalReference {
    source: SocialSource
    title: string
    url?: string
    publishedAt?: string
  }

  export interface SocialSignal {
    symbol: string
    pair: string
    score: number
    mentions: number
    sentiment: SocialSentiment
    sources: SocialSource[]
    references: SocialSignalReference[]
  }

  export interface PairDiscoveryPreviewItem {
    action: 'add' | 'remove'
    symbol: string
    pair: string
    score: number | null
    mentions: number
    sentiment: SocialSentiment | null
    sources: SocialSource[]
    reason: string
  }

  export interface PairDiscoveryPreview {
    generatedAt: string
    autoDiscoveryEnabled: boolean
    reviewRequired: boolean
    sourcesUsed: SocialSource[]
    signals: SocialSignal[]
    items: PairDiscoveryPreviewItem[]
    nextAllowedPairs: string[]
    managedPairs: string[]
    summary: {
      currentAllowed: number
      nextAllowed: number
      additions: number
      removals: number
    }
  }

  export interface PairDiscoveryApplyResponse {
    applied: boolean
    requiresConfirmation: boolean
    preview: PairDiscoveryPreview
    configuration?: Configurations
  }

export interface PairDiscoveryRunResponse {
    userId: string
    applied: boolean
    previewRequired: boolean
    preview: PairDiscoveryPreview
    status: 'idle' | 'previewed' | 'applied' | 'skipped' | 'error'
    summary: string
    configuration?: Configurations
    runner: {
      running: boolean
      lastCycleAt?: string | null
    }
  }

  export type ConfigurationResetScope =
    | 'logs_traces'
    | 'cash'
    | 'transactions'
    | 'trainings'
    | 'paper'
    | 'bots_runtime'
    | 'all_except_configurations'
    | 'configurations'
    | 'all'

  export interface ConfigurationResetResult {
    scope: ConfigurationResetScope
    label: string
    summary: string
    executedAt: string
    deletedRecords: Record<string, number>
    deletedFiles: Record<string, number>
    preservedApiKeys: boolean
    paperBalance?: {
      currency: string
      amount: number
    }
    configuration: Configurations
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
    pairDiscovery: PairDiscoveryConfig
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
