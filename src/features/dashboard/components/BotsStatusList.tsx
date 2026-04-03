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
  online: {
    label: 'Online',
    icon: Circle,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/20',
  },
  offline: {
    label: 'Offline',
    icon: Circle,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10',
    border: 'border-gray-400/20',
  },
  training: {
    label: 'Treinando',
    icon: Loader2,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/20',
  },
  error: {
    label: 'Erro',
    icon: AlertCircle,
    color: 'text-error',
    bg: 'bg-error/10',
    border: 'border-error/20',
  },
}

const actionConfig = {
  buy: { label: 'Recomenda COMPRA', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  sell: { label: 'Recomenda VENDA', icon: TrendingDown, color: 'text-error', bg: 'bg-error/10' },
  hold: { label: 'Aguardar', icon: Minus, color: 'text-gray-400', bg: 'bg-gray-400/10' },
}

export function BotsStatusList({
  data,
  isLoading,
  onPause,
  onResume,
  isMutating,
}: BotsStatusListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estratégias Ativas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </div>
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
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
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">Nenhuma estratégia configurada</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-500" />
          Estratégias Ativas
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Cada bot executa uma estratégia de análise diferente e decide qual moeda negociar
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {data.map((bot) => {
          const config = statusConfig[bot.status]
          const StatusIcon = config.icon
          const isOnline = bot.status === 'online'
          const isPaused = bot.isPaused
          const action = bot.recommendedAction || 'hold'
          const ActionIcon = actionConfig[action].icon
          
          return (
            <div
              key={bot.id}
              className={cn(
                'p-3 rounded-lg border transition-all duration-200',
                config.bg,
                config.border
              )}
            >
              {/* Cabeçalho do Bot */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', config.bg)}>
                    <Bot className={cn('w-5 h-5', config.color)} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-white">{bot.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400">
                        {bot.strategy}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{bot.description}</p>
                  </div>
                </div>
                
                {/* Botão de Ação */}
                {bot.status === 'online' && (
                  <Button
                    variant={bot.isPaused ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => (bot.isPaused ? onResume(bot.id) : onPause(bot.id))}
                    disabled={isMutating}
                    className="ml-2"
                  >
                    {isMutating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : bot.isPaused ? (
                      <>
                        <Play className="w-3 h-3 mr-1" />
                        Retomar
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 mr-1" />
                        Pausar
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Status e Informações */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {StatusIcon && (
                      <StatusIcon
                        className={cn(
                          'w-3 h-3',
                          config.color,
                          bot.status === 'training' && 'animate-spin'
                        )}
                      />
                    )}
                    <span className={cn('font-medium', config.color)}>
                      {config.label}
                      {isOnline && isPaused && ' (Pausado)'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-end gap-2">
                  <span className="text-gray-500">Analisando:</span>
                  <span className="font-mono text-white">{bot.currentPair || '---'}</span>
                </div>
                
                {/* Recomendação */}
                {bot.status === 'online' && !bot.isPaused && bot.recommendedAction && (
                  <div className="col-span-2 flex items-center justify-between mt-2 pt-2 border-t border-dark-300">
                    <div className="flex items-center gap-2">
                      <div className={cn('px-2 py-0.5 rounded-full flex items-center gap-1', actionConfig[action].bg)}>
                        <ActionIcon className={cn('w-3 h-3', actionConfig[action].color)} />
                        <span className={cn('text-xs font-medium', actionConfig[action].color)}>
                          {actionConfig[action].label}
                        </span>
                      </div>
                      {bot.confidence && (
                        <span className="text-gray-500">
                          Confiança: {bot.confidence}%
                        </span>
                      )}
                    </div>
                    {bot.lastAnalysis && (
                      <span className="text-gray-600 text-xs">
                        {new Date(bot.lastAnalysis).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Bot offline/error */}
                {(bot.status === 'offline' || bot.status === 'error') && (
                  <div className="col-span-2 text-center text-xs text-gray-500 mt-2">
                    {bot.status === 'offline' ? '⚠️ Desconectado' : '❌ Falha na última execução'}
                  </div>
                )}
                
                {/* Bot em treinamento */}
                {bot.status === 'training' && (
                  <div className="col-span-2 text-center text-xs text-warning mt-2">
                    🧠 Treinando nova versão da estratégia...
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}