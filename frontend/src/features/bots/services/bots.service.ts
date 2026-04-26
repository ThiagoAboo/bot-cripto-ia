import { apiClient } from '../../../shared/services/api.client'
import type {
  BotDetail,
  BotHistory,
  BotHomologationReport,
  BotListItem,
  BotModelArtifact,
  BotModelCatalog,
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

  async getBotHomologationReport(
    botId: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<BotHomologationReport> {
    const searchParams = new URLSearchParams()
    if (params?.startDate) searchParams.append('startDate', params.startDate)
    if (params?.endDate) searchParams.append('endDate', params.endDate)
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return apiClient.getData(`/dashboard/bots/${botId}/homologation-report${suffix}`)
  },

  async getBotModels(botId: string): Promise<BotModelCatalog> {
    return apiClient.getData(`/dashboard/bots/${botId}/models`)
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

  async promoteBotModel(botId: string, modelId: string, notes?: string): Promise<BotModelArtifact> {
    return apiClient.postData(`/dashboard/bots/${botId}/models/${modelId}/promote`, notes ? { notes } : {})
  },

  async archiveBotModel(botId: string, modelId: string, notes?: string): Promise<BotModelArtifact> {
    return apiClient.postData(`/dashboard/bots/${botId}/models/${modelId}/archive`, notes ? { notes } : {})
  },

  async pauseBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/pause`)
  },

  async resumeBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/resume`)
  },
}
