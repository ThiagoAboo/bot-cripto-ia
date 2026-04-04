import { Card, CardContent } from '../../../shared/components/ui/Card'
import { FileText, GitBranch } from 'lucide-react'
import { cn } from '../../../shared/utils/formatters'
import type { ViewMode } from '../types/logs.types'

interface ModeSelectorProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <Card>
      <CardContent className="p-2">
        <div className="flex gap-2">
          <button
            onClick={() => onModeChange('logs')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200',
              mode === 'logs'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-dark-300 text-gray-400 hover:bg-dark-400 hover:text-white'
            )}
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium">Logs</span>
            <span className="text-xs opacity-70">Eventos e Erros</span>
          </button>
          
          <button
            onClick={() => onModeChange('traces')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200',
              mode === 'traces'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-dark-300 text-gray-400 hover:bg-dark-400 hover:text-white'
            )}
          >
            <GitBranch className="w-5 h-5" />
            <span className="font-medium">Traces</span>
            <span className="text-xs opacity-70">Rastreamento</span>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}