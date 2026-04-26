import { useQuery, useMutation } from '@tanstack/react-query'
import { logsService } from '../services/logs.service'
import type { LogFilters, TraceFilters } from '../types/logs.types'
import toast from 'react-hot-toast'

export const LOGS_QUERY_KEYS = {
  logs: ['logs'],
  traces: ['traces'],
  traceGroup: (traceId: string) => ['traces', 'group', traceId],
  bots: ['logs', 'bots'],
}

export function useLogs(filters: LogFilters) {
  return useQuery({
    queryKey: [...LOGS_QUERY_KEYS.logs, filters],
    queryFn: () => logsService.getLogs(filters),
    staleTime: 30000,
    refetchInterval: 5000,
  })
}

export function useTraces(filters: TraceFilters) {
  return useQuery({
    queryKey: [...LOGS_QUERY_KEYS.traces, filters],
    queryFn: () => logsService.getTraces(filters),
    staleTime: 30000,
    refetchInterval: 5000,
  })
}

export function useTraceGroup(traceId: string) {
  return useQuery({
    queryKey: LOGS_QUERY_KEYS.traceGroup(traceId),
    queryFn: () => logsService.getTraceGroup(traceId),
    enabled: !!traceId,
  })
}

export function useExportLogs() {
  return useMutation({
    mutationFn: (filters: LogFilters) => logsService.exportLogs(filters),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `logs_${new Date().toISOString()}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Logs exportados com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao exportar logs')
    },
  })
}

export function useExportTraces() {
  return useMutation({
    mutationFn: (filters: TraceFilters) => logsService.exportTraces(filters),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `traces_${new Date().toISOString()}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Traces exportados com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao exportar traces')
    },
  })
}

export function useCopyTracesForAnalysis() {
  return useMutation({
    mutationFn: (filters: TraceFilters) => logsService.exportTracesForAnalysis(filters),
    onSuccess: async (payload) => {
      const text = JSON.stringify(payload, null, 2)

      try {
        await navigator.clipboard.writeText(text)
        toast.success('Pacote de traces copiado para análise')
        return
      } catch {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `trace_analysis_pack_${new Date().toISOString()}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('Pacote de traces gerado em arquivo JSON')
      }
    },
    onError: () => {
      toast.error('Erro ao gerar pacote de análise dos traces')
    },
  })
}

export function useAvailableBots() {
  return useQuery({
    queryKey: LOGS_QUERY_KEYS.bots,
    queryFn: () => logsService.getAvailableBots(),
    staleTime: 60000,
  })
}
