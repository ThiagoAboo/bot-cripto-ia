import { apiClient } from '../../../shared/services/api.client'
import type {
  Configurations,
  ExchangeApiKeys,
} from '../types/configurations.types'

export const configurationsService = {
  async getConfigurations(): Promise<Configurations> {
    const response = await apiClient.get('/configurations')
    return response.data
  },

  async saveConfigurations(config: Configurations): Promise<void> {
    await apiClient.put('/configurations', config)
  },

  async testConnection(apiKeys: ExchangeApiKeys): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/configurations/test-connection', apiKeys)
    return response
  },

  async getAvailablePairs(): Promise<string[]> {
    const response = await apiClient.get('/exchange/pairs')
    return response.data
  },
}