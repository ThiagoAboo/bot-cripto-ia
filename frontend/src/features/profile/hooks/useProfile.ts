import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileService } from '../services/profile.service'
import type { UpdateProfileRequest, UpdatePreferencesRequest, ChangePasswordRequest } from '../types/profile.types'
import toast from 'react-hot-toast'

export const PROFILE_QUERY_KEYS = {
  profile: ['profile'],
}

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEYS.profile,
    queryFn: () => profileService.getProfile(),
    staleTime: 60000,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => profileService.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEYS.profile })
      toast.success('Perfil atualizado com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar perfil: ${error.message}`)
    },
  })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePreferencesRequest) => profileService.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEYS.profile })
      toast.success('Preferências atualizadas com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar preferências: ${error.message}`)
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) => profileService.changePassword(data),
    onSuccess: () => {
      toast.success('Senha alterada com sucesso!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao alterar senha')
    },
  })
}