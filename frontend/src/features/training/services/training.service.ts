import { apiClient } from '../../../shared/services/api.client'
import type { 
  AvailableBot,
  TrainingSession, 
  TrainingConfig, 
  BacktestResult,
  AvailableStrategy 
} from '../types/training.types'

export const trainingService = {
  async getBots(): Promise<AvailableBot[]> {
    const bots = await apiClient.getData<Array<{
      id: string
      name: string
      strategy: string
      description?: string
      status: 'online' | 'offline' | 'training' | 'error'
      isPaused: boolean
      lastAnalysis?: string
      recommendedAction?: 'buy' | 'sell' | 'hold'
      confidence?: number
    }>>('/dashboard/bots-status')

    return bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      strategyType: bot.strategy,
      description: bot.description,
      status: bot.status,
      isPaused: bot.isPaused,
      lastAnalysis: bot.lastAnalysis,
      recommendedAction: bot.recommendedAction,
      confidence: bot.confidence,
    }))
  },

  async getStrategies(): Promise<AvailableStrategy[]> {
    return apiClient.getData('/training/strategies')
  },

  async getSessions(strategyId?: string): Promise<TrainingSession[]> {
    const url = strategyId ? `/training/sessions?botId=${strategyId}` : '/training/sessions'
    return apiClient.getData(url)
  },

  async getSession(sessionId: string): Promise<TrainingSession | null> {
    return apiClient.getData(`/training/sessions/${sessionId}`)
  },

  async createSession(config: TrainingConfig): Promise<TrainingSession> {
    return apiClient.postData('/training/sessions', config)
  },

  async uploadDataset(file: File): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.postData('/training/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  async pauseSession(sessionId: string): Promise<void> {
    await apiClient.put(`/training/sessions/${sessionId}/pause`)
  },

  async resumeSession(sessionId: string): Promise<void> {
    await apiClient.put(`/training/sessions/${sessionId}/resume`)
  },

  async cancelSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/training/sessions/${sessionId}/cancel`)
  },

  async testSession(sessionId: string): Promise<BacktestResult> {
    return apiClient.postData(`/training/sessions/${sessionId}/test`)
  },

  async saveModel(sessionId: string): Promise<{ modelUrl: string }> {
    return apiClient.postData(`/training/sessions/${sessionId}/save`)
  },

  async downloadModel(sessionId: string): Promise<Blob> {
    const response = await apiClient.get(`/training/sessions/${sessionId}/download`, {
      responseType: 'blob'
    })
    return response
  },

  async getAvailablePairs(): Promise<string[]> {
    return apiClient.getData('/exchange/pairs')
  },
}
