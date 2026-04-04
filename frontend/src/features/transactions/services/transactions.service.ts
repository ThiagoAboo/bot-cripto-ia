import { apiClient } from '../../../shared/services/api.client'
import type {
  Transaction,
  ManualOrderRequest,
  AvailableBalance,
  OrderFilters,
  CandleData,
  ExchangeRate,
} from '../types/transactions.types'

export const transactionsService = {
  async getTransactions(filters: OrderFilters): Promise<{ items: Transaction[]; total: number }> {
    const params = new URLSearchParams()
    params.append('page', filters.page.toString())
    params.append('limit', filters.limit.toString())
    if (filters.pair) params.append('pair', filters.pair)
    if (filters.types && filters.types.length > 0) params.append('types', filters.types.join(','))
    if (filters.statuses && filters.statuses.length > 0) params.append('statuses', filters.statuses.join(','))
    if (filters.origins && filters.origins.length > 0) params.append('origins', filters.origins.join(','))
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.search) params.append('search', filters.search)
    
    const response = await apiClient.get(`/orders?${params.toString()}`)
    return response.data
  },

  async getTransaction(id: string): Promise<Transaction | null> {
    const response = await apiClient.get(`/orders/${id}`)
    return response.data
  },

  async createOrder(order: ManualOrderRequest): Promise<Transaction> {
    const response = await apiClient.post('/orders', order)
    return response.data
  },

  async cancelOrder(orderId: string): Promise<void> {
    await apiClient.delete(`/orders/${orderId}/cancel`)
  },

  async getBalance(): Promise<AvailableBalance[]> {
    const response = await apiClient.get('/balance')
    return response.data
  },

  async getCandles(pair: string, period: string, limit: number = 100): Promise<CandleData[]> {
    const response = await apiClient.get(`/exchange/candles?pair=${pair}&period=${period}&limit=${limit}`)
    return response.data
  },

  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    const response = await apiClient.get(`/exchange/rate?from=${from}&to=${to}`)
    return response.data
  },

  async getAvailablePairs(): Promise<string[]> {
    const response = await apiClient.get('/exchange/pairs')
    return response.data
  },
}