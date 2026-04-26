// Tipos específicos da tela de Log / Trace Geral

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'
export type TraceLevel = 'DEBUG' | 'TRACE' | 'INFO' | 'WARN' | 'ERROR'
export type LogModule = 
  | 'dashboard' 
  | 'configurations' 
  | 'training' 
  | 'transactions' 
  | 'bot' 
  | 'system' 
  | 'api' 
  | 'database'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  module: LogModule
  message: string
  details?: Record<string, any>
  isSystem?: boolean
}

export interface TraceEntry {
  id: string
  timestamp: string
  level: TraceLevel
  module: LogModule
  traceId: string
  parentTraceId?: string
  functionName: string
  message: string
  stage?: string
  snapshot?: unknown
  durationMs: number
  botId?: string
  botName?: string
  currentPair?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  errorFlag?: boolean
}

export interface TraceGroup {
  traceId: string
  entries: TraceEntry[]
  startTime: string
  endTime: string
  totalDurationMs: number
  hasError: boolean
  botId?: string
  botName?: string
}

export interface TraceAnalysisExportPack {
  exportType: 'trace_analysis_pack_v1'
  generatedAt: string
  filters: {
    levels: string[]
    modules: string[]
    traceId: string | null
    functionName: string | null
    botId: string | null
    currentPair: string | null
    recommendedAction: 'buy' | 'sell' | 'hold' | null
    stage: string | null
    minDurationMs: number | null
    onlyErrors: boolean
    startDate: string | null
    endDate: string | null
    search: string | null
  }
  summary: {
    totalTraces: number
    errorTraces: number
    uniqueTraceIds: number
    snapshotTraces: number
    stages: Array<{
      stage: string
      count: number
      errorCount: number
    }>
    firstTimestamp: string | null
    lastTimestamp: string | null
  }
  traces: TraceEntry[]
}

export interface LogFilters {
  levels?: LogLevel[]
  modules?: LogModule[]
  startDate?: string
  endDate?: string
  search?: string
  limit: number
  offset: number
}

export interface TraceFilters {
  levels?: TraceLevel[]
  modules?: LogModule[]
  startDate?: string
  endDate?: string
  search?: string
  traceId?: string
  functionName?: string
  botId?: string
  stage?: string
  currentPair?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  minDurationMs?: number
  onlyErrors?: boolean
  limit: number
  offset: number
}

export type ViewMode = 'logs' | 'traces'

export const LOG_MODULES: { value: LogModule; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'configurations', label: 'Configurações' },
  { value: 'training', label: 'Treinamento' },
  { value: 'transactions', label: 'Transações' },
  { value: 'bot', label: 'Bot' },
  { value: 'system', label: 'Sistema' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
]

export const LOG_LEVELS: { value: LogLevel; label: string; color: string }[] = [
  { value: 'INFO', label: 'INFO', color: 'text-blue-400' },
  { value: 'WARN', label: 'WARN', color: 'text-yellow-400' },
  { value: 'ERROR', label: 'ERROR', color: 'text-red-400' },
]

export const TRACE_LEVELS: { value: TraceLevel; label: string; color: string }[] = [
  { value: 'DEBUG', label: 'DEBUG', color: 'text-purple-400' },
  { value: 'TRACE', label: 'TRACE', color: 'text-gray-400' },
]
