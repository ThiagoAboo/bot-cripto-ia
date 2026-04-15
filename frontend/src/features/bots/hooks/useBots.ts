import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { botsService } from '../services/bots.service'

export const BOTS_QUERY_KEYS = {
  list: ['bots', 'list'],
  detail: (botId: string) => ['bots', 'detail', botId],
  history: (botId: string) => ['bots', 'history', botId],
  models: (botId: string) => ['bots', 'models', botId],
  templates: ['bots', 'templates'],
  workerStatus: ['bots', 'worker-status'],
}

function invalidateBotSurfaces(queryClient: ReturnType<typeof useQueryClient>, botId?: string) {
  void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.list })
  void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.templates })
  void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.workerStatus })
  void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bots-status'] })
  void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bot-analysis'] })

  if (botId) {
    void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.detail(botId) })
    void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.history(botId) })
    void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.models(botId) })
  }
}

export function useBots() {
  return useQuery({
    queryKey: BOTS_QUERY_KEYS.list,
    queryFn: () => botsService.getBots(),
    refetchInterval: 10000,
    staleTime: 5000,
  })
}

export function useBotTemplates() {
  return useQuery({
    queryKey: BOTS_QUERY_KEYS.templates,
    queryFn: () => botsService.getBotTemplates(),
    staleTime: 30000,
  })
}

export function useBotDetail(botId?: string) {
  return useQuery({
    enabled: Boolean(botId),
    queryKey: BOTS_QUERY_KEYS.detail(botId ?? 'none'),
    queryFn: () => botsService.getBotDetail(botId!),
    refetchInterval: 15000,
    staleTime: 5000,
  })
}

export function useBotHistory(botId?: string) {
  return useQuery({
    enabled: Boolean(botId),
    queryKey: BOTS_QUERY_KEYS.history(botId ?? 'none'),
    queryFn: () => botsService.getBotHistory(botId!),
    refetchInterval: 15000,
    staleTime: 5000,
  })
}

export function useBotModels(botId?: string) {
  return useQuery({
    enabled: Boolean(botId),
    queryKey: BOTS_QUERY_KEYS.models(botId ?? 'none'),
    queryFn: () => botsService.getBotModels(botId!),
    refetchInterval: 15000,
    staleTime: 5000,
  })
}

export function useBotWorkerStatus() {
  return useQuery({
    queryKey: BOTS_QUERY_KEYS.workerStatus,
    queryFn: () => botsService.getBotWorkerStatus(),
    refetchInterval: 10000,
    staleTime: 5000,
  })
}

export function useCreateBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: botsService.createBot,
    onSuccess: (result) => {
      invalidateBotSurfaces(queryClient, result.id)
      toast.success('Bot criado com sucesso')
    },
    onError: () => {
      toast.error('Erro ao criar bot')
    },
  })
}

export function useUpdateBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ botId, payload }: { botId: string; payload: Parameters<typeof botsService.updateBot>[1] }) =>
      botsService.updateBot(botId, payload),
    onSuccess: (result) => {
      invalidateBotSurfaces(queryClient, result.id)
      toast.success(result.materializedFromTemplate ? 'Bot customizado e salvo com sucesso' : 'Bot atualizado com sucesso')
    },
    onError: () => {
      toast.error('Erro ao salvar bot')
    },
  })
}

export function useDeleteBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: botsService.deleteBot,
    onSuccess: () => {
      invalidateBotSurfaces(queryClient)
      toast.success('Bot removido com sucesso')
    },
    onError: () => {
      toast.error('Erro ao remover bot')
    },
  })
}

export function useRunBotCycle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: botsService.runBotCycle,
    onSuccess: (result) => {
      invalidateBotSurfaces(queryClient, result.botId)

      if (result.execution.status === 'executed') {
        toast.success(result.execution.reason || 'Ciclo executado com ordem gerada')
        return
      }

      if (result.execution.status === 'suggested') {
        toast.success(result.execution.reason || 'Ciclo executado em modo semi-auto')
        return
      }

      toast.success(result.execution.reason || 'Ciclo do bot executado')
    },
    onError: () => {
      toast.error('Erro ao executar ciclo do bot')
    },
  })
}

export function usePromoteBotModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ botId, modelId, notes }: { botId: string; modelId: string; notes?: string }) =>
      botsService.promoteBotModel(botId, modelId, notes),
    onSuccess: (result) => {
      invalidateBotSurfaces(queryClient, result.botId)
      toast.success('Modelo promovido como champion')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao promover modelo')
    },
  })
}

export function useArchiveBotModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ botId, modelId, notes }: { botId: string; modelId: string; notes?: string }) =>
      botsService.archiveBotModel(botId, modelId, notes),
    onSuccess: (result) => {
      invalidateBotSurfaces(queryClient, result.botId)
      toast.success('Modelo arquivado com sucesso')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao arquivar modelo')
    },
  })
}

export function usePauseBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: botsService.pauseBot,
    onSuccess: (_result, botId) => {
      invalidateBotSurfaces(queryClient, botId)
      toast.success('Bot pausado com sucesso')
    },
    onError: () => {
      toast.error('Erro ao pausar bot')
    },
  })
}

export function useResumeBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: botsService.resumeBot,
    onSuccess: (_result, botId) => {
      invalidateBotSurfaces(queryClient, botId)
      toast.success('Bot retomado com sucesso')
    },
    onError: () => {
      toast.error('Erro ao retomar bot')
    },
  })
}
