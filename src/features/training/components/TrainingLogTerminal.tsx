import { useRef, useEffect } from 'react'
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
}

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
      const isAtBottom =
        containerRef.current.scrollHeight - containerRef.current.scrollTop <=
        containerRef.current.clientHeight + 100
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
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary-500" />
          Log de Treinamento
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onExport}>
          <Download className="w-4 h-4 mr-1" />
          Exportar
        </Button>
      </CardHeader>
      
      <CardContent>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="bg-black/50 rounded-lg p-3 font-mono text-xs h-[250px] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Aguardando início do treinamento...
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1 hover:bg-white/5 px-1 rounded">
                <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                <span className={cn('font-semibold', levelColors[log.level])}>
                  {log.level}
                </span>{' '}
                {log.epoch !== undefined && (
                  <span className="text-purple-400">[Época {log.epoch}]</span>
                )}{' '}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))
          )}
        </div>
        
        <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
          <span>{logs.length} registros</span>
          <button
            onClick={() => {
              if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight
                autoScrollRef.current = true
              }
            }}
            className="flex items-center gap-1 hover:text-gray-300 transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
            Rolar para o fim
          </button>
        </div>
      </CardContent>
    </Card>
  )
}