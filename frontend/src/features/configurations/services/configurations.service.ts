import { apiClient } from '../../../shared/services/api.client'
import type {
  ConfigurationResetResult,
  ConfigurationResetScope,
  Configurations,
  ExchangeApiKeys,
  FeesConfig,
  PairDiscoveryApplyResponse,
  PairDiscoveryConfig,
  PairDiscoveryPreview,
  PairDiscoveryRunResponse,
  SocialSignal,
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

  async getLatestSocialSignals(): Promise<SocialSignal[]> {
    return apiClient.getData('/social/latest')
  },

  async previewPairDiscovery(payload: {
    allowedPairs: string[]
    fees: FeesConfig
    pairDiscovery: PairDiscoveryConfig
  }): Promise<PairDiscoveryPreview> {
    return apiClient.postData('/configurations/pair-discovery/preview', payload)
  },

  async applyPairDiscovery(payload: {
    allowedPairs: string[]
    fees: FeesConfig
    pairDiscovery: PairDiscoveryConfig
    force?: boolean
  }): Promise<PairDiscoveryApplyResponse> {
    return apiClient.postData('/configurations/pair-discovery/apply', payload)
  },

  async runPairDiscoveryNow(): Promise<PairDiscoveryRunResponse> {
    return apiClient.postData('/configurations/pair-discovery/run', {})
  },

  async runConfigurationReset(scope: ConfigurationResetScope): Promise<ConfigurationResetResult> {
    return apiClient.postData('/configurations/reset', { scope })
  },
}
