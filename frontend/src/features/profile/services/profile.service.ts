import { apiClient } from '../../../shared/services/api.client'
import type { Profile, UpdateProfileRequest, UpdatePreferencesRequest, ChangePasswordRequest } from '../types/profile.types'

export const profileService = {
  async getProfile(): Promise<Profile> {
    return apiClient.getData('/profile')
  },

  async updateProfile(data: UpdateProfileRequest): Promise<void> {
    await apiClient.put('/profile', data)
  },

  async updatePreferences(data: UpdatePreferencesRequest): Promise<void> {
    await apiClient.put('/profile/preferences', data)
  },

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    await apiClient.put('/auth/change-password', data)
  },
}
