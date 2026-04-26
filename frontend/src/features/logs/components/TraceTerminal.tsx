import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { GitBranch, ChevronDown, ChevronRight, Clock, AlertCircle, Bot, Target } from 'lucide-react'
import { cn } from '../../../shared/utils/formatters'
import { formatDate } from '../../../shared/utils/formatters'
import { useTraceGroup } from '../hooks/useLogs'
import type { TraceEntry } from '../types/logs.types'

interface TraceTerminalProps {
  traces: TraceEntry[]
  isLoading: boolean
  total: number
  onLoadMore: () => void
}

function getTraceLevelClass(level: TraceEntry['level']): string {
  if (level === 'ERROR') return 'bg-error/20 text-error'
  if (level === 'WARN') return 'bg-warning/20 text-warning'
  if (level === 'INFO') return 'bg-primary-500/20 text-primary-300'
  if (level === 'DEBUG') return 'bg-purple-500/20 text-purple-400'
  return 'bg-gray-500/20 text-gray-400'
}

function TraceGroupItem({ traceId }: { traceId: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data: group, isLoading } = useTraceGroup(traceId)

  if (isLoading) {
    return <Skeleton className="h-12 w-full" />
  }

  if (!group) return null

  const durationColor = group.totalDurationMs > 1000 ? 'text-warning' : 'text-success'

  return (
    <div className="border border-dark-300 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-dark-300/50 hover:bg-dark-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <GitBranch className="w-4 h-4 text-primary-500" />
          <span className="font-mono text-sm">{traceId}</span>
          {group.botName && (
            <span className="flex items-center gap-1 text-xs text-primary-400">
              <Bot className="w-3 h-3" />
              {group.botName}
            </span>
          )}
          {group.hasError && (
            <AlertCircle className="w-4 h-4 text-error" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={cn('flex items-center gap-1', durationColor)}>
            <Clock className="w-3 h-3" />
            {group.totalDurationMs}ms
          </span>
          <span className="text-gray-500">
            {formatDate(group.startTime, 'time')}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-2 bg-black/20">
          {group.entries.map((trace, idx) => {
            const isLast = idx === group.entries.length - 1
            const indent = trace.parentTraceId !== trace.traceId ? 'ml-6' : ''
            
            return (
              <div key={trace.id} className={cn('relative', indent)}>
                {!isLast && (
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-dark-400 ml-2" />
                )}
                <div className="flex items-start gap-2 pl-4">
                  <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 text-xs">{formatDate(trace.timestamp, 'time')}</span>
                      <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', getTraceLevelClass(trace.level))}>
                        {trace.level}
                      </span>
                      <span className="text-cyan-400 text-xs font-mono">{trace.functionName}</span>
                      {trace.stage && (
                        <span className="rounded bg-primary-500/15 px-1.5 py-0.5 text-xs text-primary-300">
                          {trace.stage}
                        </span>
                      )}
                      {trace.currentPair && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Target className="w-3 h-3" />
                          {trace.currentPair}
                        </span>
                      )}
                      {trace.recommendedAction && (
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          trace.recommendedAction === 'buy' ? 'bg-success/20 text-success' :
                          trace.recommendedAction === 'sell' ? 'bg-error/20 text-error' :
                          'bg-gray-500/20 text-gray-400'
                        )}>
                          {trace.recommendedAction.toUpperCase()}
                          {trace.confidence && ` (${trace.confidence}%)`}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-300 text-sm mt-1">{trace.message}</p>
                    {trace.durationMs > 0 && (
                      <p className="text-gray-500 text-xs mt-1">⏱️ Duração: {trace.durationMs}ms</p>
                    )}
                    {trace.snapshot !== undefined && (
                      <details className="mt-2 rounded-lg border border-dark-300 bg-dark-400/30 p-2">
                        <summary className="cursor-pointer text-xs text-gray-400">Snapshot estruturado</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-300">
                          {JSON.stringify(trace.snapshot, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TraceTerminal({ traces, isLoading, total, onLoadMore }: TraceTerminalProps) {
  const groupedTraces = traces.reduce((acc, trace) => {
    if (!acc[trace.traceId]) {
      acc[trace.traceId] = []
    }
    acc[trace.traceId].push(trace)
    return acc
  }, {} as Record<string, TraceEntry[]>)

  if (isLoading && traces.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary-500" />
            Terminal de Traces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary-500" />
          Terminal de Traces
          <span className="text-xs text-gray-500 ml-2">({total} execuções)</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {Object.keys(groupedTraces).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum trace encontrado
            </div>
          ) : (
            Object.keys(groupedTraces).map((traceId) => (
              <TraceGroupItem key={traceId} traceId={traceId} />
            ))
          )}
        </div>
        
        {traces.length < total && (
          <div className="mt-4 text-center">
            <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? 'Carregando...' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
