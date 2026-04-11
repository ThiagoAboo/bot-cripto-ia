import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from '../../app/providers/WebSocketProvider'
import { useLogs, useTraces, useExportLogs, useExportTraces, useAvailableBots } from './hooks/useLogs'
import { LOGS_QUERY_KEYS } from './hooks/useLogs'
import { ModeSelector } from './components/ModeSelector'
import { LogFilters } from './components/LogFilters'
import { LogTerminal } from './components/LogTerminal'
import { TraceTerminal } from './components/TraceTerminal'
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/components/ui/Card'
import { Activity, Filter } from 'lucide-react'
import type { ViewMode, LogFilters as LogFiltersType, TraceFilters } from './types/logs.types'

interface TraceAdvancedFiltersProps {
  filters: TraceFilters
  onFiltersChange: (filters: TraceFilters) => void
}

function TraceAdvancedFilters({ filters, onFiltersChange }: TraceAdvancedFiltersProps) {
  const { data: bots } = useAvailableBots()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleBotChange = (botId: string) => {
    onFiltersChange({ ...filters, botId: botId === 'all' ? undefined : botId, offset: 0 })
  }

  const handleDurationChange = (minDurationMs: number) => {
    onFiltersChange({ ...filters, minDurationMs: minDurationMs || undefined, offset: 0 })
  }

  const handleOnlyErrorsChange = () => {
    onFiltersChange({ ...filters, onlyErrors: !filters.onlyErrors, offset: 0 })
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary-500" />
          Filtros de Trace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Bot / Estratégia</label>
          <select
            value={filters.botId || 'all'}
            onChange={(e) => handleBotChange(e.target.value)}
            className="w-full rounded-lg border border-dark-300 bg-dark-300 px-3 py-2 text-sm text-white"
          >
            <option value="all">Todos os bots</option>
            {bots?.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Duração mínima (ms)</label>
          <input
            type="number"
            min="0"
            step="50"
            value={filters.minDurationMs || ''}
            onChange={(e) => handleDurationChange(parseInt(e.target.value))}
            placeholder="Ex: 100"
            className="w-full rounded-lg border border-dark-300 bg-dark-300 px-3 py-2 text-sm text-white"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.onlyErrors || false}
            onChange={handleOnlyErrorsChange}
            className="w-4 h-4 rounded border-dark-300 bg-dark-300"
          />
          <span className="text-sm text-gray-300">Apenas traces com erro</span>
        </label>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          {showAdvanced ? 'Ocultar' : 'Mostrar'} filtros avançados
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dark-300">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Função/Método</label>
              <input
                type="text"
                value={filters.functionName || ''}
                onChange={(e) => onFiltersChange({ ...filters, functionName: e.target.value || undefined, offset: 0 })}
                placeholder="Ex: executeTrade"
                className="w-full rounded-lg border border-dark-300 bg-dark-300 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Trace ID</label>
              <input
                type="text"
                value={filters.traceId || ''}
                onChange={(e) => onFiltersChange({ ...filters, traceId: e.target.value || undefined, offset: 0 })}
                placeholder="Ex: trace_001"
                className="w-full rounded-lg border border-dark-300 bg-dark-300 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function LogsPage() {
  const queryClient = useQueryClient()
  const { isConnected, on, off } = useWebSocket()
  const [mode, setMode] = useState<ViewMode>('logs')
  
  const [logOffset, setLogOffset] = useState(0)
  const [traceOffset, setTraceOffset] = useState(0)
  const LIMIT = 50

  const [logFilters, setLogFilters] = useState<LogFiltersType>({
    limit: LIMIT,
    offset: 0,
  })
  const [traceFilters, setTraceFilters] = useState<TraceFilters>({
    limit: LIMIT,
    offset: 0,
  })

  const { data: logsData, isLoading: isLoadingLogs } = useLogs(logFilters)
  const { data: tracesData, isLoading: isLoadingTraces } = useTraces(traceFilters)
  const { mutate: exportLogs, isPending: isExportingLogs } = useExportLogs()
  const { mutate: exportTraces, isPending: isExportingTraces } = useExportTraces()

  useEffect(() => {
    setLogOffset(0)
    setTraceOffset(0)
  }, [logFilters, traceFilters])

  useEffect(() => {
    setLogFilters(prev => ({ ...prev, offset: logOffset }))
  }, [logOffset])

  useEffect(() => {
    setTraceFilters(prev => ({ ...prev, offset: traceOffset }))
  }, [traceOffset])

  useEffect(() => {
    if (!isConnected) {
      return
    }

    const handleLogNew = () => {
      void queryClient.invalidateQueries({ queryKey: LOGS_QUERY_KEYS.logs })
    }

    const handleTraceNew = (payload: { traceId?: string }) => {
      void queryClient.invalidateQueries({ queryKey: LOGS_QUERY_KEYS.traces })

      if (payload.traceId) {
        void queryClient.invalidateQueries({ queryKey: LOGS_QUERY_KEYS.traceGroup(payload.traceId) })
      }
    }

    on('log:new', handleLogNew)
    on('trace:new', handleTraceNew)

    return () => {
      off('log:new', handleLogNew)
      off('trace:new', handleTraceNew)
    }
  }, [isConnected, off, on, queryClient])

  const handleExport = () => {
    if (mode === 'logs') {
      exportLogs(logFilters)
    } else {
      exportTraces(traceFilters)
    }
  }

  const handleLoadMore = () => {
    if (mode === 'logs') {
      setLogOffset(prev => prev + LIMIT)
    } else {
      setTraceOffset(prev => prev + LIMIT)
    }
  }

  const isLoading = mode === 'logs' ? isLoadingLogs : isLoadingTraces
  const isExporting = mode === 'logs' ? isExportingLogs : isExportingTraces

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary-500" />
          Log / Trace Geral
        </h1>
        <p className="text-gray-400 mt-1">
          Auditoria completa do sistema com rastreamento detalhado de execução
        </p>
      </div>

      <ModeSelector mode={mode} onModeChange={setMode} />

      {mode === 'logs' ? (
        <LogFilters
          filters={logFilters}
          onFiltersChange={setLogFilters}
          onExport={handleExport}
          isExporting={isExporting}
        />
      ) : (
        <>
          <LogFilters
            filters={traceFilters as unknown as LogFiltersType}
            onFiltersChange={(f) => setTraceFilters(f as unknown as TraceFilters)}
            onExport={handleExport}
            isExporting={isExporting}
          />
          <TraceAdvancedFilters filters={traceFilters} onFiltersChange={setTraceFilters} />
        </>
      )}

      {mode === 'logs' ? (
        <LogTerminal
          logs={logsData?.items || []}
          isLoading={isLoading}
          total={logsData?.total || 0}
          onLoadMore={handleLoadMore}
        />
      ) : (
        <TraceTerminal
          traces={tracesData?.items || []}
          isLoading={isLoading}
          total={tracesData?.total || 0}
          onLoadMore={handleLoadMore}
        />
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-yellow-400'}`} />
        <span>{isConnected ? 'WebSocket conectado com fallback de polling' : 'Fallback de polling ativo'}</span>
      </div>
    </div>
  )
}
