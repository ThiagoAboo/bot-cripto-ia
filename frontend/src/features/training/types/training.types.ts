// Tipos específicos da tela de Treinamento da IA

export type Architecture = 
  | 'lstm' 
  | 'cnn' 
  | 'linear_regression' 
  | 'random_forest' 
  | 'xgboost' 
  | 'transformer'

export type DataSource = 'exchange' | 'synthetic' | 'upload'

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export type TrainingStatus = 
  | 'pending' 
  | 'running' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled'

export interface TrainingConfig {
  botId: string
  strategyId: string
  architecture: Architecture
  modelVersion: string
  baseModelId?: string
  dataSource: DataSource
  trainingPeriod: {
    startDate: string
    endDate: string
  }
  includedPairs: string[]
  indicators: string[]
  timeframe: Timeframe
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

export interface TrainingMetrics {
  epoch: number
  trainLoss: number
  valLoss: number
  trainAccuracy?: number
  valAccuracy?: number
  learningRate: number
  duration: number
}

export interface TrainingLog {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  epoch?: number
}

export interface TrainingSession {
  id: string
  botId: string
  strategyId: string
  strategyName: string
  status: TrainingStatus
  startTime: string
  endTime?: string
  config: TrainingConfig
  metrics: TrainingMetrics[]
  logs: TrainingLog[]
  bestEpoch?: number
  bestValLoss?: number
  modelUrl?: string
}

export interface BacktestResult {
  sessionId: string
  testPeriod: { startDate: string; endDate: string }
  totalTrades: number
  winRate: number
  totalProfit: number
  sharpeRatio: number
  maxDrawdown: number
  profitFactor: number
}

export interface AvailableStrategy {
  id: string
  name: string
  strategyType: string
  description: string
}

export const ARCHITECTURES: { value: Architecture; label: string; description: string }[] = [
  { value: 'lstm', label: 'LSTM', description: 'Long Short-Term Memory - Ideal para séries temporais' },
  { value: 'cnn', label: 'CNN', description: 'Convolutional Neural Network - Bom para padrões locais' },
  { value: 'linear_regression', label: 'Regressão Linear', description: 'Modelo simples e interpretável' },
  { value: 'random_forest', label: 'Random Forest', description: 'Ensemble de árvores de decisão' },
  { value: 'xgboost', label: 'XGBoost', description: 'Gradient Boosting de alta performance' },
  { value: 'transformer', label: 'Transformer', description: 'Atenção para dependências de longo prazo' },
]

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1 minuto' },
  { value: '5m', label: '5 minutos' },
  { value: '15m', label: '15 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '4h', label: '4 horas' },
  { value: '1d', label: '1 dia' },
]

export const TECHNICAL_INDICATORS = [
  { value: 'SMA', label: 'Média Móvel Simples (SMA)' },
  { value: 'EMA', label: 'Média Móvel Exponencial (EMA)' },
  { value: 'RSI', label: 'Índice de Força Relativa (RSI)' },
  { value: 'MACD', label: 'MACD' },
  { value: 'BB', label: 'Bandas de Bollinger' },
  { value: 'Volume', label: 'Volume' },
  { value: 'StochRSI', label: 'Stochastic RSI' },
  { value: 'ATR', label: 'Average True Range (ATR)' },
  { value: 'OBV', label: 'On-Balance Volume (OBV)' },
]