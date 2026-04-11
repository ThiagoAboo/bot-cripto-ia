import { apiClient } from '../../../shared/services/api.client'
import type { 
  TrainingSession, 
  TrainingConfig, 
  BacktestResult,
  AvailableStrategy 
} from '../types/training.types'

export const trainingService = {
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
