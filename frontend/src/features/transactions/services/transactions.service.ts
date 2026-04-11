import { apiClient } from '../../../shared/services/api.client'
import type {
  Transaction,
  TransactionsResponse,
  ManualOrderRequest,
  AvailableBalance,
  OrderFilters,
  CandleData,
  ExchangeRate,
} from '../types/transactions.types'

function buildTransactionsQueryString(filters: OrderFilters): string {
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

  return params.toString()
}

export const transactionsService = {
  async getTransactions(filters: OrderFilters): Promise<TransactionsResponse> {
    return apiClient.getData(`/orders?${buildTransactionsQueryString(filters)}`)
  },

  async exportTransactions(filters: OrderFilters): Promise<Transaction[]> {
    const exportLimit = 100
    const firstPage = await this.getTransactions({
      ...filters,
      page: 1,
      limit: exportLimit,
    })

    if (firstPage.totalPages <= 1) {
      return firstPage.items
    }

    const remainingPages = await Promise.all(
      Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
        this.getTransactions({
          ...filters,
          page: index + 2,
          limit: exportLimit,
        }),
      ),
    )

    return [firstPage, ...remainingPages].flatMap((page) => page.items)
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
