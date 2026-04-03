import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configurationsService } from '../services/configurations.service'
import type { Configurations, ExchangeApiKeys } from '../types/configurations.types'
import toast from 'react-hot-toast'

export const CONFIGURATIONS_QUERY_KEYS = {
  all: ['configurations'],
  exchange: ['configurations', 'exchange'],
  botParameters: ['configurations', 'bot-parameters'],
  strategies: ['configurations', 'strategies'],
  pairs: ['exchange', 'pairs'],
}

export function useConfigurations() {
  return useQuery({
    queryKey: CONFIGURATIONS_QUERY_KEYS.all,
    queryFn: () => configurationsService.getConfigurations(),
    staleTime: 60000, // 1 minuto
  })
}

export function useSaveConfigurations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Configurations) => configurationsService.saveConfigurations(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIGURATIONS_QUERY_KEYS.all })
      toast.success('Configurações salvas com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar configurações: ${error.message}`)
    },
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (apiKeys: ExchangeApiKeys) => configurationsService.testConnection(apiKeys),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao testar conexão: ${error.message}`)
    },
  })
}

export function useAvailablePairs() {
  return useQuery({
    queryKey: CONFIGURATIONS_QUERY_KEYS.pairs,
    queryFn: () => configurationsService.getAvailablePairs(),
    staleTime: 300000, // 5 minutos
  })
}