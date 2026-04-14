import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardService } from '../services/dashboard.service'
import toast from 'react-hot-toast'

export const DASHBOARD_QUERY_KEYS = {
  totalBalance: ['dashboard', 'total-balance'],
  currenciesBalance: ['dashboard', 'currencies-balance'],
  recentTransactions: ['dashboard', 'recent-transactions'],
  botsStatus: ['dashboard', 'bots-status'],
  botAnalysis: (botId: string) => ['dashboard', 'bot-analysis', botId],
}

export function useTotalBalance() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.totalBalance,
    queryFn: () => dashboardService.getTotalBalance(),
    refetchInterval: 10000, // Atualiza a cada 10 segundos
    staleTime: 5000,
  })
}

export function useCurrenciesBalance() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.currenciesBalance,
    queryFn: () => dashboardService.getCurrenciesBalance(),
    refetchInterval: 10000,
    staleTime: 5000,
  })
}

export function useRecentTransactions(limit: number = 5) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.recentTransactions, limit],
    queryFn: () => dashboardService.getRecentTransactions(limit),
    refetchInterval: 15000,
    staleTime: 10000,
  })
}

export function useBotsStatus() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.botsStatus,
    queryFn: () => dashboardService.getBotsStatus(),
    refetchInterval: 5000,
    staleTime: 3000,
  })
}

export function useBotAnalysis(botId?: string) {
  return useQuery({
    enabled: Boolean(botId),
    queryKey: DASHBOARD_QUERY_KEYS.botAnalysis(botId ?? 'none'),
    queryFn: () => dashboardService.getBotAnalysis(botId!),
    refetchInterval: 10000,
    staleTime: 5000,
  })
}

export function useRunBotCycle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (botId: string) => dashboardService.runBotCycle(botId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.botsStatus })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bot-analysis'] })

      if (result.execution.status === 'executed') {
        toast.success(result.execution.reason || 'Ciclo do bot executado com ordem gerada')
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

export function usePauseBot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (botId: string) => dashboardService.pauseBot(botId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.botsStatus })
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
    mutationFn: (botId: string) => dashboardService.resumeBot(botId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.botsStatus })
      toast.success('Bot retomado com sucesso')
    },
    onError: () => {
      toast.error('Erro ao retomar bot')
    },
  })
}
