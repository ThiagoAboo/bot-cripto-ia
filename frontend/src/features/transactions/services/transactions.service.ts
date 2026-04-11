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
    
    return apiClient.getData(`/orders?${params.toString()}`)
  },

  async getTransaction(id: string): Promise<Transaction | null> {
    return apiClient.getData(`/orders/${id}`)
  },

  async createOrder(order: ManualOrderRequest): Promise<Transaction> {
    return apiClient.postData('/orders', order)
  },

  async cancelOrder(orderId: string): Promise<void> {
    await apiClient.delete(`/orders/${orderId}/cancel`)
  },

  async getBalance(): Promise<AvailableBalance[]> {
    return apiClient.getData('/balance')
  },

  async getCandles(pair: string, period: string, limit: number = 100): Promise<CandleData[]> {
    return apiClient.getData(`/exchange/candles?pair=${pair}&period=${period}&limit=${limit}`)
  },

  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    return apiClient.getData(`/exchange/rate?from=${from}&to=${to}`)
  },

  async getAvailablePairs(): Promise<string[]> {
    return apiClient.getData('/exchange/pairs')
  },
}
