// Tipos específicos da tela de Transações

export type OrderType = 'market' | 'limit'
export type OrderStatus = 'executed' | 'pending' | 'cancelled'
export type OrderOrigin = 'manual' | 'bot'

export interface Transaction {
  id: string
  date: string
  pair: string
  origin: OrderOrigin
  botId?: string
  botName?: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  total: number
  fee: number
  feeCurrency?: string
  feeRateApplied?: number
  feeDiscountSource?: 'bnb' | 'usdt' | 'standard'
  status: OrderStatus
  profitBrl?: number
  profitPercent?: number
}

export interface TransactionsResponse {
  items: Transaction[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ManualOrderRequest {
  pair: string
  type: 'buy' | 'sell'
  quantity: number
  orderType: OrderType
  price?: number
}

export interface AvailableBalance {
  currency: string
  available: number
  reserved?: number
  total?: number
}

export interface OrderFilters {
  pair?: string
  types?: ('buy' | 'sell')[]
  statuses?: OrderStatus[]
  origins?: OrderOrigin[]
  startDate?: string
  endDate?: string
  search?: string
  page: number
  limit: number
}

export interface CandleData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ExchangeRate {
  from: string
  to: string
  rate: number
  lastUpdate: string
}

export const CURRENCIES = ['BRL', 'USDT', 'EUR', 'BTC', 'ETH'] as const
export type DisplayCurrency = typeof CURRENCIES[number]

export const CHART_PERIODS = [
  { value: '15m', label: '15 minutos' },
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '4h', label: '4 horas' },
  { value: '1d', label: '1 dia' },
  { value: '1w', label: '1 semana' },
] as const

export type ChartPeriod = typeof CHART_PERIODS[number]['value']
