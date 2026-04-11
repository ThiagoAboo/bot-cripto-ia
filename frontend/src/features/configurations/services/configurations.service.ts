import { apiClient } from '../../../shared/services/api.client'
import type {
  Configurations,
  ExchangeApiKeys,
} from '../types/configurations.types'

export const configurationsService = {
  async getConfigurations(): Promise<Configurations> {
    return apiClient.getData('/configurations')
  },

  async saveConfigurations(config: Configurations): Promise<void> {
    await apiClient.put('/configurations', config)
  },

  async testConnection(apiKeys: ExchangeApiKeys): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/configurations/test-connection', apiKeys)
    return response
  },

  async getAvailablePairs(): Promise<string[]> {
    return apiClient.getData('/exchange/pairs')
  },
}
