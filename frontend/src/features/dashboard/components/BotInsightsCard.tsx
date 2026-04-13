import { Brain, Radar, TrendingDown, TrendingUp, Minus, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Badge } from '../../../shared/components/ui/Badge'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import type { BotAnalysis, BotStatus } from '../types/dashboard.types'

interface BotInsightsCardProps {
  bots?: BotStatus[]
  selectedBotId: string
  onSelectBot: (botId: string) => void
  data?: BotAnalysis
  isLoading: boolean
}

const actionBadgeVariant = {
  buy: 'success',
  sell: 'error',
  hold: 'default',
} as const

const actionIcon = {
  buy: TrendingUp,
  sell: TrendingDown,
  hold: Minus,
} as const

function formatSpecialistName(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function BotInsightsCard({ bots, selectedBotId, onSelectBot, data, isLoading }: BotInsightsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Radar do Bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!bots || bots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Radar do Bot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Assim que houver bots disponíveis, a análise especialista aparecerá aqui.
          </p>
        </CardContent>
      </Card>
    )
  }

  const selectedBot = bots.find((bot) => bot.id === selectedBotId) ?? bots[0]
  const bestOpportunity = data?.bestOpportunity
  const BestActionIcon = actionIcon[bestOpportunity?.action ?? 'hold']

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary-500" />
          <CardTitle>Radar do Bot</CardTitle>
        </div>

        <Select value={selectedBot.id} onValueChange={onSelectBot}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um bot" />
          </SelectTrigger>
          <SelectContent>
            {bots.map((bot) => (
              <SelectItem key={bot.id} value={bot.id}>
                {bot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-2">
          <Badge variant="primary">{data?.templateName ?? selectedBot.templateName ?? selectedBot.name}</Badge>
          <Badge>{formatSpecialistName(data?.primarySpecialist ?? selectedBot.specialization ?? selectedBot.strategy)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-2)' }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BestActionIcon className="h-4 w-4 text-primary-500" />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {bestOpportunity ? `Melhor oportunidade: ${bestOpportunity.pair}` : 'Nenhum sinal forte agora'}
              </span>
            </div>
            <Badge variant={actionBadgeVariant[bestOpportunity?.action ?? 'hold']}>
              {bestOpportunity ? `${bestOpportunity.action.toUpperCase()} ${bestOpportunity.confidence}%` : 'HOLD'}
            </Badge>
          </div>

          <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {bestOpportunity?.reason ?? 'Os especialistas monitoraram os pares elegíveis, mas preferiram aguardar um contexto mais forte antes de agir.'}
          </p>

          {bestOpportunity && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Preço monitorado: {bestOpportunity.price.toFixed(4)} · Timeframe {data?.timeframe ?? '1h'}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Radar className="h-4 w-4 text-primary-500" />
            Ranking de pares analisados
          </div>

          {(data?.opportunities ?? []).slice(0, 3).map((opportunity) => (
            <div
              key={opportunity.pair}
              className="rounded-2xl border p-3"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-1)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {opportunity.pair}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {opportunity.specialists.map((specialist) => formatSpecialistName(specialist.specialist)).join(' + ')}
                  </p>
                </div>
                <Badge variant={actionBadgeVariant[opportunity.action]}>
                  {opportunity.action.toUpperCase()} {opportunity.confidence}%
                </Badge>
              </div>
            </div>
          ))}

          {!data?.opportunities?.length && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Ainda não houve pares suficientes com mercado carregado para análise.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Sparkles className="h-4 w-4 text-primary-500" />
            Sinais sociais em destaque
          </div>

          {(data?.socialSignals ?? []).slice(0, 3).map((signal) => (
            <div key={signal.pair} className="flex items-center justify-between rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {signal.pair}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {signal.mentions} menções · {signal.sources.join(', ')}
                </p>
              </div>
              <Badge variant={signal.sentiment === 'bullish' ? 'success' : signal.sentiment === 'bearish' ? 'error' : 'default'}>
                Score {signal.score}
              </Badge>
            </div>
          ))}

          {!data?.socialSignals?.length && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhum sinal social forte entrou no radar deste bot no momento.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
