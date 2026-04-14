import { apiClient } from '../../../shared/services/api.client'
import type {
  BotDetail,
  BotHistory,
  BotListItem,
  BotTemplateSummary,
  BotWorkerStatus,
  CreateBotPayload,
  UpdateBotPayload,
} from '../types/bots.types'
import type { BotCycleResult } from '../../dashboard/types/dashboard.types'

export const botsService = {
  async getBots(): Promise<BotListItem[]> {
    return apiClient.getData('/dashboard/bots')
  },

  async getBotTemplates(): Promise<BotTemplateSummary[]> {
    return apiClient.getData('/dashboard/bots/templates')
  },

  async getBotDetail(botId: string): Promise<BotDetail> {
    return apiClient.getData(`/dashboard/bots/${botId}`)
  },

  async getBotHistory(botId: string): Promise<BotHistory> {
    return apiClient.getData(`/dashboard/bots/${botId}/history`)
  },

  async getBotWorkerStatus(): Promise<BotWorkerStatus> {
    return apiClient.getData('/dashboard/bots/worker-status')
  },

  async createBot(payload: CreateBotPayload): Promise<BotDetail> {
    return apiClient.postData('/dashboard/bots', payload)
  },

  async updateBot(botId: string, payload: UpdateBotPayload): Promise<BotDetail> {
    return apiClient.putData(`/dashboard/bots/${botId}`, payload)
  },

  async deleteBot(botId: string): Promise<void> {
    await apiClient.delete(`/dashboard/bots/${botId}`)
  },

  async runBotCycle(botId: string): Promise<BotCycleResult> {
    return apiClient.postData(`/dashboard/bots/${botId}/run`, {})
  },

  async pauseBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/pause`)
  },

  async resumeBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/resume`)
  },
}
