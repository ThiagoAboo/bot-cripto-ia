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
    return apiClient.getData('/dashboard/total-balance')
  },

  async getCurrenciesBalance(): Promise<CurrencyBalance[]> {
    return apiClient.getData('/dashboard/currencies-balance')
  },

  async getRecentTransactions(limit: number = 5): Promise<RecentTransaction[]> {
    return apiClient.getData(`/dashboard/transactions/recent?limit=${limit}`)
  },

  async getBotsStatus(): Promise<BotStatus[]> {
    return apiClient.getData('/dashboard/bots-status')
  },

  async getPerformanceData(period: '24h' | '7d' | '30d' | 'total'): Promise<PerformanceData> {
    return apiClient.getData(`/dashboard/performance?period=${period}`)
  },

  async pauseBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/pause`)
  },

  async resumeBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/resume`)
  },
}
