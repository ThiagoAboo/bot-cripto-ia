import { apiClient } from '../../../shared/services/api.client'
import type {
  TotalBalance,
  CurrencyBalance,
  RecentTransaction,
  BotStatus,
  PerformanceData,
} from '../types/dashboard.types'

export const dashboardService = {
  async getTotalBalance(): Promise<TotalBalance> {
    const response = await apiClient.get('/dashboard/total-balance')
    return response.data
  },

  async getCurrenciesBalance(): Promise<CurrencyBalance[]> {
    const response = await apiClient.get('/dashboard/currencies-balance')
    return response.data
  },

  async getRecentTransactions(limit: number = 5): Promise<RecentTransaction[]> {
    const response = await apiClient.get(`/dashboard/transactions/recent?limit=${limit}`)
    return response.data
  },

  async getBotsStatus(): Promise<BotStatus[]> {
    const response = await apiClient.get('/dashboard/bots-status')
    return response.data
  },

  async getPerformanceData(period: '24h' | '7d' | '30d' | 'total'): Promise<PerformanceData> {
    const response = await apiClient.get(`/dashboard/performance?period=${period}`)
    return response.data
  },

  async pauseBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/pause`)
  },

  async resumeBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/resume`)
  },
}