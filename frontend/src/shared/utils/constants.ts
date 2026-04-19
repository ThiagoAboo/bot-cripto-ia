// Moedas suportadas
export const SUPPORTED_CURRENCIES = ['BRL', 'USDT', 'EUR', 'BTC', 'ETH'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

// Períodos para gráfico
export const CHART_PERIODS = [
  { value: '15m', label: '15 minutos' },
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '4h', label: '4 horas' },
  { value: '1d', label: '1 dia' },
  { value: '1w', label: '1 semana' },
] as const

// Períodos para performance
export const PERFORMANCE_PERIODS = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'total', label: 'Total' },
] as const

// Arquiteturas de IA suportadas
export const AI_ARCHITECTURES = [
  { value: 'lstm', label: 'LSTM (Long Short-Term Memory)' },
  { value: 'cnn', label: 'CNN (Convolutional Neural Network)' },
  { value: 'linear_regression', label: 'Regressão Linear' },
  { value: 'random_forest', label: 'Random Forest' },
  { value: 'xgboost', label: 'XGBoost' },
  { value: 'transformer', label: 'Transformer' },
] as const

// Indicadores técnicos
export const TECHNICAL_INDICATORS = [
  { value: 'SMA', label: 'Média Móvel Simples (SMA)' },
  { value: 'EMA', label: 'Média Móvel Exponencial (EMA)' },
  { value: 'RSI', label: 'Índice de Força Relativa (RSI)' },
  { value: 'MACD', label: 'MACD' },
  { value: 'BB', label: 'Bandas de Bollinger' },
  { value: 'Volume', label: 'Volume' },
] as const

// Exchanges suportadas
export const SUPPORTED_EXCHANGES = [
  { value: 'binance', label: 'Binance' },
] as const

// Status dos bots
export const BOT_STATUS = {
  ONLINE: { label: 'Online', color: 'text-success', bg: 'bg-success/10' },
  OFFLINE: { label: 'Offline', color: 'text-gray-400', bg: 'bg-gray-400/10' },
  TRAINING: { label: 'Treinando', color: 'text-warning', bg: 'bg-warning/10' },
  ERROR: { label: 'Erro', color: 'text-error', bg: 'bg-error/10' },
} as const

// Níveis de log
export const LOG_LEVELS = {
  INFO: { label: 'INFO', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  WARN: { label: 'WARN', color: 'text-warning', bg: 'bg-warning/10' },
  ERROR: { label: 'ERROR', color: 'text-error', bg: 'bg-error/10' },
  DEBUG: { label: 'DEBUG', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  TRACE: { label: 'TRACE', color: 'text-gray-400', bg: 'bg-gray-400/10' },
} as const

// Cores para gráficos
export const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
}

// Configurações de polling (ms)
export const POLLING_INTERVALS = {
  DASHBOARD: 10000,    // 10 segundos
  TRANSACTIONS: 5000,  // 5 segundos
  TRAINING: 2000,      // 2 segundos
  LOGS: 3000,          // 3 segundos
}

// Limites de paginação
export const PAGINATION_LIMITS = [10, 20, 50, 100]

// Máximo de transações recentes no dashboard
export const MAX_RECENT_TRANSACTIONS = 5
