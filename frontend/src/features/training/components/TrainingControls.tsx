import { Button } from '../../../shared/components/ui/Button'
import { Play, Pause, Square, Download, Save, TestTube } from 'lucide-react'
import type { TrainingStatus } from '../types/training.types'

interface TrainingControlsProps {
  status: TrainingStatus
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onTest: () => void
  onSave: () => void
  onDownload: () => void
  isPending: boolean
  isTesting: boolean
  isSaving: boolean
  isDownloading: boolean
  hasModel: boolean
}

export function TrainingControls({
  status,
  onStart,
  onPause,
  onResume,
  onCancel,
  onTest,
  onSave,
  onDownload,
  isPending,
  isTesting,
  isSaving,
  isDownloading,
  hasModel,
}: TrainingControlsProps) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isPendingStatus = status === 'pending'
  const isCompleted = status === 'completed'
  const isActive = isRunning || isPaused || isPendingStatus

  return (
    <div className="flex flex-wrap gap-3">
      {!isActive && !isCompleted && (
        <Button onClick={onStart} disabled={isPending}>
          <Play className="w-4 h-4 mr-2" />
          Iniciar Treinamento
        </Button>
      )}

      {isRunning && (
        <Button variant="secondary" onClick={onPause} disabled={isPending}>
          <Pause className="w-4 h-4 mr-2" />
          Pausar
        </Button>
      )}

      {isPaused && (
        <Button variant="primary" onClick={onResume} disabled={isPending}>
          <Play className="w-4 h-4 mr-2" />
          Retomar
        </Button>
      )}

      {isActive && (
        <Button variant="danger" onClick={onCancel} disabled={isPending}>
          <Square className="w-4 h-4 mr-2" />
          Cancelar
        </Button>
      )}

      {(isCompleted || hasModel) && (
        <Button variant="secondary" onClick={onTest} disabled={isTesting}>
          {isTesting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Testando...
            </>
          ) : (
            <>
              <TestTube className="w-4 h-4 mr-2" />
              Testar
            </>
          )}
        </Button>
      )}

      {(isCompleted || hasModel) && (
        <Button variant="secondary" onClick={onSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </>
          )}
        </Button>
      )}

      {(isCompleted || hasModel) && (
        <Button variant="outline" onClick={onDownload} disabled={isDownloading}>
          {isDownloading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Baixando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </>
          )}
        </Button>
      )}
    </div>
  )
}