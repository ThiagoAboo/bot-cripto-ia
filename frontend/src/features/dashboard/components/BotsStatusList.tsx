import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { cn } from '../../../shared/utils/formatters'
import { Bot, Pause, Play, AlertCircle, Loader2, Circle, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import type { BotStatus } from '../types/dashboard.types'

interface BotsStatusListProps {
  data?: BotStatus[]
  isLoading: boolean
  onPause: (botId: string) => void
  onResume: (botId: string) => void
  isMutating: boolean
}

const statusConfig = {
  online: { label: 'Online', icon: Circle, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  offline: { label: 'Offline', icon: Circle, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20' },
  training: { label: 'Treinando', icon: Loader2, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  error: { label: 'Erro', icon: AlertCircle, color: 'text-error', bg: 'bg-error/10', border: 'border-error/20' },
} as const

const actionConfig = {
  buy: { label: 'Recomenda COMPRA', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  sell: { label: 'Recomenda VENDA', icon: TrendingDown, color: 'text-error', bg: 'bg-error/10' },
  hold: { label: 'Aguardar', icon: Minus, color: 'text-slate-400', bg: 'bg-slate-400/10' },
} as const

export function BotsStatusList({ data, isLoading, onPause, onResume, isMutating }: BotsStatusListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estratégias Ativas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estratégias Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <Bot className="mx-auto mb-3 h-12 w-12" style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Nenhuma estratégia configurada</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary-500" />
          Estratégias Ativas
        </CardTitle>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Cada bot executa uma estratégia de análise diferente e decide qual moeda negociar
        </p>
      </CardHeader>

      <CardContent className="max-h-[560px] space-y-4 overflow-y-auto pr-2">
        {data.map((bot) => {
          const config = statusConfig[bot.status]
          const StatusIcon = config.icon
          const isOnline = bot.status === 'online'
          const action = bot.recommendedAction || 'hold'
          const ActionIcon = actionConfig[action].icon

          return (
            <div
              key={bot.id}
              className={cn('rounded-2xl border p-4', config.bg, config.border)}
              style={{ backgroundColor: undefined }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {bot.name}
                  </h4>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {bot.description}
                  </p>
                </div>

                {isOnline && (
                  <Button
                    variant={bot.isPaused ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => (bot.isPaused ? onResume(bot.id) : onPause(bot.id))}
                    disabled={isMutating}
                  >
                    {isMutating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : bot.isPaused ? (
                      <>
                        <Play className="h-3 w-3" />
                        Retomar
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3" />
                        Pausar
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={cn('h-3 w-3', config.color, bot.status === 'training' && 'animate-spin')} />
                    <span className={cn('font-medium', config.color)}>
                      {config.label}
                      {isOnline && bot.isPaused && ' (Pausado)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>Analisando:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {bot.currentPair || '---'}
                    </span>
                  </div>
                </div>

                {isOnline && !bot.isPaused && bot.recommendedAction && (
                  <div className="flex items-center justify-between gap-3 border-t pt-2" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-2">
                      <div className={cn('flex items-center gap-1 rounded-full px-2 py-1', actionConfig[action].bg)}>
                        <ActionIcon className={cn('h-3 w-3', actionConfig[action].color)} />
                        <span className={cn('text-xs font-medium', actionConfig[action].color)}>{actionConfig[action].label}</span>
                      </div>
                      {bot.confidence && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Confiança: {bot.confidence}%
                        </span>
                      )}
                    </div>
                    {bot.lastAnalysis && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(bot.lastAnalysis).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}

                {bot.status === 'error' && <div className="text-center text-xs text-error">Falha na última execução</div>}
                {bot.status === 'training' && <div className="text-center text-xs text-warning">Treinando nova versão da estratégia...</div>}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
