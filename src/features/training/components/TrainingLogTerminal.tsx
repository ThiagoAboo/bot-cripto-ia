import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { Download, Terminal, ChevronDown } from 'lucide-react'
import { cn } from '../../../shared/utils/formatters'
import type { TrainingLog } from '../types/training.types'

interface TrainingLogTerminalProps {
  logs: TrainingLog[]
  isLoading: boolean
  onExport: () => void
}

const levelColors = {
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
} as const

export function TrainingLogTerminal({ logs, isLoading, onExport }: TrainingLogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const handleScroll = () => {
    if (containerRef.current) {
      const isAtBottom = containerRef.current.scrollHeight - containerRef.current.scrollTop <= containerRef.current.clientHeight + 100
      autoScrollRef.current = isAtBottom
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log de Treinamento</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary-500" />
          Log de Treinamento
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </CardHeader>

      <CardContent>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[260px] overflow-y-auto rounded-2xl border p-3 font-mono text-xs"
          style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              Aguardando início do treinamento...
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1 rounded px-1 py-0.5 hover:bg-white/5">
                <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span>{' '}
                <span className={cn('font-semibold', levelColors[log.level])}>{log.level}</span>{' '}
                {log.epoch !== undefined && <span className="text-purple-400">[Época {log.epoch}]</span>}{' '}
                <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{logs.length} registros</span>
          <button
            type="button"
            onClick={() => {
              if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight
                autoScrollRef.current = true
              }
            }}
            className="flex items-center gap-1 transition-colors hover:text-primary-500"
          >
            <ChevronDown className="h-3 w-3" />
            Rolar para o fim
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
