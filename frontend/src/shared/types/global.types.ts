// Resposta padrão da API
export interface ApiResponse<T> {
    success: boolean
    data: T
    error?: string
    timestamp: string
  }
  
  // Resposta paginada
  export interface PaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  
  // Taxa de câmbio
  export interface ExchangeRate {
    from: string
    to: string
    rate: number
    lastUpdate: string
  }
  
  // Dados de candle para gráfico
  export interface CandleData {
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }
  
  // Bot
  export interface Bot {
    id: string
    name: string
    pair: string
    status: 'online' | 'offline' | 'training' | 'error'
    isPaused: boolean
  }
  
  // Saldo total
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
  
  // Saldo por moeda
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
  
  // Transação
  export interface Transaction {
    id: string
    date: string
    pair: string
    origin: 'manual' | 'bot'
    botId?: string
    type: 'buy' | 'sell'
    quantity: number
    requestedQuantity?: number
    price: number
    total: number
    fee: number
    feeCurrency?: string
    feeRateApplied?: number
    feeDiscountSource?: 'bnb' | 'usdt' | 'standard'
    status: 'executed' | 'pending' | 'partially_filled' | 'cancelled' | 'rejected'
    orderType?: 'market' | 'limit'
    externalOrderId?: string
    externalClientOrderId?: string
    externalStatus?: string
    syncedAt?: string
    profitBrl?: number
    profitPercent?: number
  }
  
  // Parâmetros do bot
  export interface BotParameters {
    riskManagement: {
      stopLossPercent: number
      takeProfitPercent: number
      leverage: 1
      maxTradeAmount: number
      maxTradeAmountUnit: 'USDT' | 'percent'
    }
    allowedPairs: string[]
    fees: {
      useBnbForFees: boolean
      discountUsdtPercent: number
      discountBnbPercent: number
      minBnbBalance: number
      reserveBnbForFeesEnabled: boolean
    }
    pairDiscovery: {
      autoDiscoveryEnabled: boolean
      autoAddToAllowedPairs: boolean
      autoRemoveFromAllowedPairs: boolean
      reviewRequired: boolean
      sources: {
        reddit: boolean
        rss: boolean
        x: boolean
        telegram: boolean
      }
      minSocialScore: number
      minMentions: number
      maxPairs: number
      excludedAssets: string[]
    }
    advanced: {
      mode: 'spot'
      orderType: 'market' | 'limit'
      slippagePercent: number
    }
  }
  
  // Configuração de API keys
export interface ExchangeApiKeys {
    exchange: 'binance'
    apiKey: string
    secretKey: string
  }
  
  // Sessão de treinamento
  export interface TrainingSession {
    id: string
    botId: string
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
    startTime: string
    endTime?: string
    config: TrainingConfig
    metrics: TrainingMetrics[]
    logs: TrainingLog[]
    bestEpoch?: number
    bestValLoss?: number
    modelUrl?: string
  }
  
  // Configuração de treinamento
  export interface TrainingConfig {
    botId: string
    architecture: 'lstm' | 'cnn' | 'linear_regression' | 'random_forest' | 'xgboost' | 'transformer'
    modelVersion: string
    baseModelId?: string
    dataSource: 'exchange' | 'synthetic' | 'upload'
    trainingPeriod: {
      startDate: string
      endDate: string
    }
    includedPairs: string[]
    indicators: string[]
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
    uploadedFileUrl?: string
    hyperparameters: {
      hiddenLayers: number
      neuronsPerLayer: number[]
      dropoutRate: number
      activation: 'relu' | 'tanh' | 'sigmoid'
      batchSize: number
      epochs: number
      learningRate: number
      optimizer: 'adam' | 'sgd' | 'rmsprop'
      lossFunction: 'mse' | 'mae' | 'huber'
      validationSplit: number
      earlyStopping: {
        enabled: boolean
        patience: number
      }
    }
  }
  
  // Métricas de treinamento
  export interface TrainingMetrics {
    epoch: number
    trainLoss: number
    valLoss: number
    trainAccuracy?: number
    valAccuracy?: number
    learningRate: number
    duration: number
  }
  
  // Log de treinamento
  export interface TrainingLog {
    timestamp: string
    level: 'INFO' | 'WARN' | 'ERROR'
    message: string
    epoch?: number
  }
  
  // Log de sistema
  export interface LogEntry {
    id: string
    timestamp: string
    level: 'INFO' | 'WARN' | 'ERROR'
    module: string
    message: string
    details?: Record<string, any>
  }
  
  // Trace de sistema
  export interface TraceEntry {
    id: string
    timestamp: string
    level: 'DEBUG' | 'TRACE'
    module: string
    traceId: string
    parentTraceId?: string
    functionName: string
    message: string
    durationMs: number
    botId?: string
    errorFlag?: boolean
  }
