import { apiClient } from '../../../shared/services/api.client'
import type { 
  LogEntry, 
  TraceEntry, 
  TraceGroup, 
  LogFilters, 
  TraceFilters 
} from '../types/logs.types'

export const logsService = {
  async getLogs(filters: LogFilters): Promise<{ items: LogEntry[]; total: number }> {
    const params = new URLSearchParams()
    params.append('page', (filters.offset / filters.limit + 1).toString())
    params.append('limit', filters.limit.toString())
    if (filters.levels && filters.levels.length > 0) params.append('levels', filters.levels.join(','))
    if (filters.modules && filters.modules.length > 0) params.append('modules', filters.modules.join(','))
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.search) params.append('search', filters.search)
    
    return apiClient.getData(`/logs?${params.toString()}`)
  },

  async getTraces(filters: TraceFilters): Promise<{ items: TraceEntry[]; total: number }> {
    const params = new URLSearchParams()
    params.append('page', (filters.offset / filters.limit + 1).toString())
    params.append('limit', filters.limit.toString())
    if (filters.levels && filters.levels.length > 0) params.append('levels', filters.levels.join(','))
    if (filters.modules && filters.modules.length > 0) params.append('modules', filters.modules.join(','))
    if (filters.traceId) params.append('traceId', filters.traceId)
    if (filters.functionName) params.append('functionName', filters.functionName)
    if (filters.botId) params.append('botId', filters.botId)
    if (filters.currentPair) params.append('currentPair', filters.currentPair)
    if (filters.recommendedAction) params.append('recommendedAction', filters.recommendedAction)
    if (filters.minDurationMs) params.append('minDurationMs', filters.minDurationMs.toString())
    if (filters.onlyErrors) params.append('onlyErrors', 'true')
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.search) params.append('search', filters.search)
    
    return apiClient.getData(`/traces?${params.toString()}`)
  },

  async getTraceGroup(traceId: string): Promise<TraceGroup | null> {
    return apiClient.getData(`/traces/group/${traceId}`)
  },

  async exportLogs(filters: LogFilters): Promise<Blob> {
    const params = new URLSearchParams()
    if (filters.levels && filters.levels.length > 0) params.append('levels', filters.levels.join(','))
    if (filters.modules && filters.modules.length > 0) params.append('modules', filters.modules.join(','))
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.search) params.append('search', filters.search)
    
    const response = await apiClient.get(`/logs/export?${params.toString()}`, {
      responseType: 'blob'
    })
    return response
  },

  async exportTraces(filters: TraceFilters): Promise<Blob> {
    const params = new URLSearchParams()
    if (filters.levels && filters.levels.length > 0) params.append('levels', filters.levels.join(','))
    if (filters.modules && filters.modules.length > 0) params.append('modules', filters.modules.join(','))
    if (filters.traceId) params.append('traceId', filters.traceId)
    if (filters.functionName) params.append('functionName', filters.functionName)
    if (filters.botId) params.append('botId', filters.botId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.search) params.append('search', filters.search)
    
    const response = await apiClient.get(`/traces/export?${params.toString()}`, {
      responseType: 'blob'
    })
    return response
  },

  async getAvailableBots(): Promise<{ id: string; name: string }[]> {
    return apiClient.getData('/traces/bots')
  },
}
