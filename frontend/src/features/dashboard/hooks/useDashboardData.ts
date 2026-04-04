import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardService } from '../services/dashboard.service'
import toast from 'react-hot-toast'

export const DASHBOARD_QUERY_KEYS = {
  totalBalance: ['dashboard', 'total-balance'],
  currenciesBalance: ['dashboard', 'currencies-balance'],
  recentTransactions: ['dashboard', 'recent-transactions'],
  botsStatus: ['dashboard', 'bots-status'],
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