import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { botsService } from '../services/bots.service'

export const BOTS_QUERY_KEYS = {
  list: ['bots', 'list'],
  detail: (botId: string) => ['bots', 'detail', botId],
  history: (botId: string) => ['bots', 'history', botId],
  homologationReport: (botId: string, startDate?: string, endDate?: string) => ['bots', 'homologation-report', botId, startDate ?? 'default', endDate ?? 'default'],
  models: (botId: string) => ['bots', 'models', botId],
  templates: ['bots', 'templates'],
  workerStatus: ['bots', 'worker-status'],
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bot'
}

function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
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
    void queryClient.invalidateQueries({ queryKey: ['bots', 'homologation-report', botId] })
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

export function useBotHomologationReport(
  botId?: string,
  params?: { startDate?: string; endDate?: string },
) {
  return useQuery({
    enabled: Boolean(botId),
    queryKey: BOTS_QUERY_KEYS.homologationReport(botId ?? 'none', params?.startDate, params?.endDate),
    queryFn: () => botsService.getBotHomologationReport(botId!, params),
    refetchInterval: 15000,
    staleTime: 5000,
  })
}

export function useExportBotHomologationPack() {
  return useMutation({
    mutationFn: ({
      botId,
      botName,
      params,
    }: {
      botId: string
      botName: string
      params?: { startDate?: string; endDate?: string }
    }) => botsService.getBotHomologationAnalysisPack(botId, botName, params),
    onSuccess: (pack, variables) => {
      const filename = [
        'homologacao',
        sanitizeFilenameSegment(variables.botName),
        (variables.params?.startDate ?? 'inicio').slice(0, 10),
        (variables.params?.endDate ?? 'fim').slice(0, 10),
      ].join('_') + '.json'

      downloadJsonFile(filename, pack)
      toast.success('Pacote completo de homologacao exportado')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao exportar pacote de homologacao')
    },
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
      const evaluatedPlans = result.plans?.length ?? 0
      const approvedPlans = result.plans?.filter((plan) => plan.status !== 'skipped').length ?? 0
      const cycleSuffix = evaluatedPlans > 0
        ? ` (${approvedPlans}/${evaluatedPlans} oportunidades aprovadas)`
        : ''

      if (result.execution.status === 'executed') {
        toast.success((result.execution.reason || 'Ciclo executado com ordem gerada') + cycleSuffix)
        return
      }

      if (result.execution.status === 'suggested') {
        toast.success((result.execution.reason || 'Ciclo executado em modo semi-auto') + cycleSuffix)
        return
      }

      toast.success((result.execution.reason || 'Ciclo do bot executado') + cycleSuffix)
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
