import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { trainingService } from '../services/training.service'
import type { TrainingConfig, TrainingSession } from '../types/training.types'
import toast from 'react-hot-toast'

export const TRAINING_QUERY_KEYS = {
  strategies: ['training', 'strategies'],
  sessions: ['training', 'sessions'],
  session: (id: string) => ['training', 'sessions', id],
  pairs: ['training', 'pairs'],
  backtest: (id: string) => ['training', 'backtest', id],
}

export function useStrategies() {
  return useQuery({
    queryKey: TRAINING_QUERY_KEYS.strategies,
    queryFn: () => trainingService.getStrategies(),
    staleTime: 60000,
  })
}

export function useSessions(strategyId?: string) {
  return useQuery<TrainingSession[], Error>({
    queryKey: [...TRAINING_QUERY_KEYS.sessions, strategyId],
    queryFn: () => trainingService.getSessions(strategyId),
    staleTime: 30000,
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActiveSession = data?.some((session: TrainingSession) => ['pending', 'running', 'paused'].includes(session.status))
      return hasActiveSession ? 2000 : false
    },
  })
}

export function useSession(sessionId: string) {
  return useQuery<TrainingSession | null, Error>({
    queryKey: TRAINING_QUERY_KEYS.session(sessionId),
    queryFn: () => trainingService.getSession(sessionId),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && ['pending', 'running'].includes(data.status) ? 2000 : false
    },
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: TrainingConfig) => trainingService.createSession(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.sessions })
      toast.success('Treinamento iniciado com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao iniciar treinamento: ${error.message}`)
    },
  })
}

export function usePauseSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => trainingService.pauseSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.session(sessionId) })
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.sessions })
      toast.success('Treinamento pausado')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao pausar: ${error.message}`)
    },
  })
}

export function useResumeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => trainingService.resumeSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.session(sessionId) })
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.sessions })
      toast.success('Treinamento retomado')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao retomar: ${error.message}`)
    },
  })
}

export function useCancelSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => trainingService.cancelSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.session(sessionId) })
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.sessions })
      toast.success('Treinamento cancelado')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cancelar: ${error.message}`)
    },
  })
}

export function useTestSession() {
  return useMutation({
    mutationFn: (sessionId: string) => trainingService.testSession(sessionId),
    onSuccess: () => {
      toast.success('Backtesting concluído com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro no backtesting: ${error.message}`)
    },
  })
}

export function useSaveModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => trainingService.saveModel(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: TRAINING_QUERY_KEYS.session(sessionId) })
      toast.success('Modelo salvo permanentemente!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar modelo: ${error.message}`)
    },
  })
}

export function useDownloadModel() {
  return useMutation({
    mutationFn: (sessionId: string) => trainingService.downloadModel(sessionId),
    onSuccess: (blob: Blob, sessionId: string) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `model_${sessionId}.h5`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Download iniciado!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao baixar modelo: ${error.message}`)
    },
  })
}

export function useAvailablePairs() {
  return useQuery({
    queryKey: TRAINING_QUERY_KEYS.pairs,
    queryFn: () => trainingService.getAvailablePairs(),
    staleTime: 300000,
  })
}
