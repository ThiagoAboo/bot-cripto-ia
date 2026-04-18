import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configurationsService } from '../services/configurations.service'
import type {
  ConfigurationBackupSnapshot,
  ConfigurationResetScope,
  Configurations,
  ConfigurationBackupRestoreResult,
  ExchangeApiKeys,
  FeesConfig,
  PairDiscoveryConfig,
} from '../types/configurations.types'
import toast from 'react-hot-toast'

export const CONFIGURATIONS_QUERY_KEYS = {
  all: ['configurations'],
  exchange: ['configurations', 'exchange'],
  botParameters: ['configurations', 'bot-parameters'],
  strategies: ['configurations', 'strategies'],
  pairs: ['exchange', 'pairs'],
  socialSignals: ['configurations', 'social-signals'],
  pairDiscoveryPreview: ['configurations', 'pair-discovery', 'preview'],
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

export function useLatestSocialSignals() {
  return useQuery({
    queryKey: CONFIGURATIONS_QUERY_KEYS.socialSignals,
    queryFn: () => configurationsService.getLatestSocialSignals(),
    staleTime: 300000,
  })
}

export function usePairDiscoveryPreview() {
  return useMutation({
    mutationFn: (payload: {
      allowedPairs: string[]
      fees: FeesConfig
      pairDiscovery: PairDiscoveryConfig
    }) => configurationsService.previewPairDiscovery(payload),
    onError: (error: Error) => {
      toast.error(`Erro ao gerar preview da descoberta: ${error.message}`)
    },
  })
}

export function usePairDiscoveryApply() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      allowedPairs: string[]
      fees: FeesConfig
      pairDiscovery: PairDiscoveryConfig
      force?: boolean
    }) => configurationsService.applyPairDiscovery(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CONFIGURATIONS_QUERY_KEYS.socialSignals })
      queryClient.invalidateQueries({ queryKey: CONFIGURATIONS_QUERY_KEYS.all })

      if (result.applied) {
        toast.success('Sugestões de descoberta aplicadas com sucesso!')
      } else if (result.requiresConfirmation) {
        toast('Revise as sugestões e confirme a aplicação.')
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao aplicar sugestões: ${error.message}`)
    },
  })
}

export function useRunPairDiscoveryNow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => configurationsService.runPairDiscoveryNow(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CONFIGURATIONS_QUERY_KEYS.socialSignals })
      queryClient.invalidateQueries({ queryKey: CONFIGURATIONS_QUERY_KEYS.all })

      if (result.applied) {
        toast.success('Curadoria automática executada e aplicada com sucesso!')
        return
      }

      if (result.previewRequired) {
        toast('Curadoria executada. Há sugestões aguardando revisão.')
        return
      }

      toast.success(result.summary)
    },
    onError: (error: Error) => {
      toast.error(`Erro ao executar curadoria automática: ${error.message}`)
    },
  })
}

export function useRunConfigurationReset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (scope: ConfigurationResetScope) => configurationsService.runConfigurationReset(scope),
    onSuccess: (result) => {
      queryClient.invalidateQueries()
      toast.success(result.summary)
    },
    onError: (error: Error) => {
      toast.error(`Erro ao executar limpeza: ${error.message}`)
    },
  })
}

export function useExportConfigurationBackup() {
  return useMutation({
    mutationFn: (): Promise<ConfigurationBackupSnapshot> => configurationsService.exportConfigurationBackup(),
    onError: (error: Error) => {
      toast.error(`Erro ao exportar backup: ${error.message}`)
    },
  })
}

export function useRestoreConfigurationBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      snapshot: ConfigurationBackupSnapshot
      preserveCurrentApiKeys: boolean
    }): Promise<ConfigurationBackupRestoreResult> => configurationsService.restoreConfigurationBackup(
      payload.snapshot,
      payload.preserveCurrentApiKeys,
    ),
    onSuccess: (result) => {
      queryClient.invalidateQueries()
      toast.success(result.summary)
    },
    onError: (error: Error) => {
      toast.error(`Erro ao restaurar backup: ${error.message}`)
    },
  })
}
