import { useRef, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { Terminal, ChevronDown, Info, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '../../../shared/utils/formatters'
import { formatDate } from '../../../shared/utils/formatters'
import type { LogEntry } from '../types/logs.types'

interface LogTerminalProps {
  logs: LogEntry[]
  isLoading: boolean
  total: number
  onLoadMore: () => void
}

const levelIcons = {
  INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  WARN: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  ERROR: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
}

export function LogTerminal({ logs, isLoading, total, onLoadMore }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    if (containerRef.current) {
      const isAtBottom =
        containerRef.current.scrollHeight - containerRef.current.scrollTop <=
        containerRef.current.clientHeight + 100
      setAutoScroll(isAtBottom)
    }
  }

  if (isLoading && logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary-500" />
            Terminal de Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary-500" />
          Terminal de Logs
          <span className="text-xs text-gray-500 ml-2">({total} registros)</span>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setAutoScroll(!autoScroll)}>
          <ChevronDown className={cn('w-4 h-4 transition-transform', autoScroll && 'rotate-180')} />
          <span className="ml-1 text-xs">{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}</span>
        </Button>
      </CardHeader>
      
      <CardContent>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="bg-black/40 rounded-lg font-mono text-xs h-[500px] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Nenhum log encontrado
            </div>
          ) : (
            logs.map((log, index) => {
              const LevelIcon = levelIcons[log.level].icon
              return (
                <div
                  key={`${log.id}-${index}`}
                  className={cn(
                    'px-3 py-2 border-b border-dark-300 hover:bg-dark-300/30 transition-colors',
                    levelIcons[log.level].bg
                  )}
                >
                  <div className="flex items-start gap-2">
                    <LevelIcon className={cn('w-3 h-3 mt-0.5', levelIcons[log.level].color)} />
                    <span className="text-gray-500 shrink-0">[{formatDate(log.timestamp, 'full')}]</span>
                    <span className={cn('font-semibold shrink-0', levelIcons[log.level].color)}>
                      {log.level}
                    </span>
                    <span className="text-purple-400 shrink-0">[{log.module}]</span>
                    <span className="text-gray-300 break-all">{log.message}</span>
                  </div>
                  {log.details && (
                    <div className="ml-6 mt-1 text-gray-500 text-xs">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        
        {logs.length < total && (
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