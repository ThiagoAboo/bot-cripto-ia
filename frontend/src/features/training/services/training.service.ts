import { apiClient } from '../../../shared/services/api.client'
import type { 
  TrainingSession, 
  TrainingConfig, 
  BacktestResult,
  AvailableStrategy 
} from '../types/training.types'

export const trainingService = {
  async getStrategies(): Promise<AvailableStrategy[]> {
    const response = await apiClient.get('/training/strategies')
    return response.data
  },

  async getSessions(strategyId?: string): Promise<TrainingSession[]> {
    const url = strategyId ? `/training/sessions?botId=${strategyId}` : '/training/sessions'
    const response = await apiClient.get(url)
    return response.data
  },

  async getSession(sessionId: string): Promise<TrainingSession | null> {
    const response = await apiClient.get(`/training/sessions/${sessionId}`)
    return response.data
  },

  async createSession(config: TrainingConfig): Promise<TrainingSession> {
    const response = await apiClient.post('/training/sessions', config)
    return response.data
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
    const response = await apiClient.post(`/training/sessions/${sessionId}/test`)
    return response.data
  },

  async saveModel(sessionId: string): Promise<{ success: boolean; modelUrl: string }> {
    const response = await apiClient.post(`/training/sessions/${sessionId}/save`)
    return response.data
  },

  async downloadModel(sessionId: string): Promise<Blob> {
    const response = await apiClient.get(`/training/sessions/${sessionId}/download`, {
      responseType: 'blob'
    })
    return response
  },

  async getAvailablePairs(): Promise<string[]> {
    const response = await apiClient.get('/exchange/pairs')
    return response.data
  },
}