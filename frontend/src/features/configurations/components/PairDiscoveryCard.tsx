import { useState } from 'react'
import { RadioTower, RefreshCcw, Sparkles } from 'lucide-react'

import { useLatestSocialSignals, usePairDiscoveryApply, usePairDiscoveryPreview } from '../hooks/useConfigurations'
import type {
  FeesConfig,
  PairDiscoveryConfig,
  PairDiscoveryPreview,
  PairDiscoverySources,
  SocialSignal,
} from '../types/configurations.types'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Checkbox } from '../../../shared/components/ui/Checkbox'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Switch } from '../../../shared/components/ui/Switch'
import { Textarea } from '../../../shared/components/ui/Textarea'

interface PairDiscoveryCardProps {
  data: PairDiscoveryConfig
  allowedPairs: string[]
  fees: FeesConfig
  onChange: (data: PairDiscoveryConfig) => void
  onApplyResult: (payload: { allowedPairs: string[]; pairDiscovery: PairDiscoveryConfig }) => void
}

const SOURCE_OPTIONS: Array<{ key: keyof PairDiscoverySources; label: string }> = [
  { key: 'reddit', label: 'Reddit' },
  { key: 'rss', label: 'RSS / News' },
  { key: 'x', label: 'X / Twitter' },
  { key: 'telegram', label: 'Telegram' },
]

function getSignalBadgeVariant(signal: SocialSignal): 'success' | 'warning' | 'default' {
  if (signal.sentiment === 'bullish') {
    return 'success'
  }

  if (signal.sentiment === 'bearish') {
    return 'warning'
  }

  return 'default'
}

function getPreviewBadgeVariant(action: 'add' | 'remove'): 'success' | 'warning' {
  return action === 'add' ? 'success' : 'warning'
}

export function PairDiscoveryCard({
  data,
  allowedPairs,
  fees,
  onChange,
  onApplyResult,
}: PairDiscoveryCardProps) {
  const { data: socialSignals, isLoading: isLoadingSignals, refetch: refetchSignals } = useLatestSocialSignals()
  const previewMutation = usePairDiscoveryPreview()
  const applyMutation = usePairDiscoveryApply()
  const [preview, setPreview] = useState<PairDiscoveryPreview | null>(null)
  const needsConfirmation = Boolean(applyMutation.data?.requiresConfirmation && !applyMutation.data?.applied)

  const handleToggle = (field: keyof PairDiscoveryConfig, value: boolean) => {
    onChange({ ...data, [field]: value })
  }

  const handleNumberChange = (field: keyof PairDiscoveryConfig, value: number) => {
    onChange({ ...data, [field]: Number.isFinite(value) ? value : 0 })
  }

  const handleSourceChange = (field: keyof PairDiscoverySources, value: boolean) => {
    onChange({
      ...data,
      sources: {
        ...data.sources,
        [field]: value,
      },
    })
  }

  const handleExcludedAssetsChange = (value: string) => {
    const excludedAssets = value
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean)

    onChange({
      ...data,
      excludedAssets: Array.from(new Set(excludedAssets)),
    })
  }

  const buildPayload = () => ({
    allowedPairs,
    fees,
    pairDiscovery: data,
  })

  const handleGeneratePreview = () => {
    previewMutation.mutate(buildPayload(), {
      onSuccess: (result) => {
        setPreview(result)
      },
    })
  }

  const handleApplySuggestions = (force = false) => {
    applyMutation.mutate({
      ...buildPayload(),
      force,
    }, {
      onSuccess: (result) => {
        setPreview(result.preview)

        if (result.applied && result.configuration) {
          onApplyResult({
            allowedPairs: result.configuration.botParameters.allowedPairs,
            pairDiscovery: result.configuration.botParameters.pairDiscovery,
          })
        }
      },
    })
  }

  const effectivePreview = applyMutation.data?.preview ?? preview

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RadioTower className="w-5 h-5 text-primary-500" />
          Descoberta Automática de Moedas
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Curadoria de pares para trade usando sinais sociais, notícias e listas gerenciadas automaticamente
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-lg border border-dark-400 bg-dark-300 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Ativar descoberta automática</p>
              <p className="text-xs text-gray-500">
                Habilita a curadoria contínua para sugerir ou ajustar pares elegíveis
              </p>
            </div>
            <Switch
              checked={data.autoDiscoveryEnabled}
              onCheckedChange={(checked) => handleToggle('autoDiscoveryEnabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Auto incluir em moedas permitidas</p>
              <p className="text-xs text-gray-500">
                Adiciona pares fortes automaticamente respeitando o limite máximo configurado
              </p>
            </div>
            <Switch
              checked={data.autoAddToAllowedPairs}
              onCheckedChange={(checked) => handleToggle('autoAddToAllowedPairs', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Auto remover pares gerenciados</p>
              <p className="text-xs text-gray-500">
                Remove apenas pares adicionados automaticamente quando perderem força
              </p>
            </div>
            <Switch
              checked={data.autoRemoveFromAllowedPairs}
              onCheckedChange={(checked) => handleToggle('autoRemoveFromAllowedPairs', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Exigir revisão humana</p>
              <p className="text-xs text-gray-500">
                Gera sugestão antes de aplicar alterações na lista de trade
              </p>
            </div>
            <Switch
              checked={data.reviewRequired}
              onCheckedChange={(checked) => handleToggle('reviewRequired', checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pairDiscoveryScore">Score social mínimo</Label>
            <Input
              id="pairDiscoveryScore"
              type="number"
              min="0"
              max="100"
              value={data.minSocialScore}
              onChange={(event) => handleNumberChange('minSocialScore', parseFloat(event.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pairDiscoveryMentions">Menções mínimas</Label>
            <Input
              id="pairDiscoveryMentions"
              type="number"
              min="0"
              value={data.minMentions}
              onChange={(event) => handleNumberChange('minMentions', parseFloat(event.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pairDiscoveryMaxPairs">Máximo de pares</Label>
            <Input
              id="pairDiscoveryMaxPairs"
              type="number"
              min="1"
              value={data.maxPairs}
              onChange={(event) => handleNumberChange('maxPairs', parseFloat(event.target.value))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Fontes monitoradas</Label>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-dark-400 bg-dark-300 p-4">
            {SOURCE_OPTIONS.map((source) => (
              <Checkbox
                key={source.key}
                checked={data.sources[source.key]}
                onChange={(event) => handleSourceChange(source.key, event.target.checked)}
                label={source.label}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pairDiscoveryExcludedAssets">Ativos excluídos</Label>
          <Textarea
            id="pairDiscoveryExcludedAssets"
            rows={3}
            value={data.excludedAssets.join(', ')}
            onChange={(event) => handleExcludedAssetsChange(event.target.value)}
            placeholder="BNB, USDC"
          />
          <p className="text-xs text-gray-500">
            Ativos excluídos nunca entram automaticamente na lista de trade, mesmo com score alto.
          </p>
        </div>

        <div className="rounded-lg border border-dark-400 bg-dark-300 p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Radar social</p>
              <p className="text-xs text-gray-500">
                Últimos sinais detectados e simulação da próxima curadoria automática
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                isLoading={isLoadingSignals}
                onClick={() => {
                  void refetchSignals()
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                Atualizar sinais
              </Button>
              <Button
                variant="outline"
                size="sm"
                isLoading={previewMutation.isPending}
                onClick={handleGeneratePreview}
              >
                <Sparkles className="h-4 w-4" />
                Gerar preview
              </Button>
              {effectivePreview && effectivePreview.items.length > 0 && (
                <Button
                  size="sm"
                  isLoading={applyMutation.isPending}
                  onClick={() => handleApplySuggestions(needsConfirmation)}
                >
                  {needsConfirmation ? 'Confirmar aplicação' : 'Aplicar sugestões'}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-dark-400 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pares atuais</p>
              <p className="mt-1 text-lg font-semibold text-white">{allowedPairs.length}</p>
            </div>
            <div className="rounded-lg border border-dark-400 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Gerenciados</p>
              <p className="mt-1 text-lg font-semibold text-white">{data.managedPairs?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-dark-400 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Sinais ativos</p>
              <p className="mt-1 text-lg font-semibold text-white">{socialSignals?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-dark-400 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Review</p>
              <p className="mt-1 text-lg font-semibold text-white">{data.reviewRequired ? 'Ligado' : 'Desligado'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Moedas em destaque</p>
              {socialSignals && socialSignals.length > 0 && (
                <Badge variant="primary">{socialSignals.length} sinais</Badge>
              )}
            </div>

            {socialSignals && socialSignals.length > 0 ? (
              <div className="space-y-2">
                {socialSignals.slice(0, 6).map((signal) => (
                  <div key={signal.pair} className="rounded-lg border border-dark-400 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{signal.pair}</p>
                      <Badge variant={getSignalBadgeVariant(signal)}>{signal.sentiment}</Badge>
                      <Badge variant="primary">Score {signal.score}</Badge>
                      <Badge>{signal.mentions} menções</Badge>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Fontes: {signal.sources.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Nenhum sinal disponível no momento. Atualize o radar para consultar novamente.
              </p>
            )}
          </div>

          {effectivePreview && (
            <div className="space-y-3 rounded-lg border border-primary-500/20 bg-primary-500/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white">Preview da próxima curadoria</p>
                <Badge variant="primary">{effectivePreview.summary.additions} adições</Badge>
                <Badge variant="warning">{effectivePreview.summary.removals} remoções</Badge>
                <Badge>{effectivePreview.summary.nextAllowed} pares finais</Badge>
              </div>

              {!effectivePreview.autoDiscoveryEnabled && (
                <p className="text-sm text-gray-400">
                  A descoberta automática está desativada. O radar social segue disponível, mas nenhuma mudança será sugerida até a ativação.
                </p>
              )}

              {effectivePreview.items.length > 0 ? (
                <div className="space-y-2">
                  {effectivePreview.items.map((item) => (
                    <div key={`${item.action}-${item.pair}`} className="rounded-lg border border-dark-400 bg-dark-300 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{item.pair}</p>
                        <Badge variant={getPreviewBadgeVariant(item.action)}>
                          {item.action === 'add' ? 'Adicionar' : 'Remover'}
                        </Badge>
                        {item.score !== null && <Badge variant="primary">Score {item.score}</Badge>}
                        <Badge>{item.mentions} menções</Badge>
                      </div>
                      <p className="mt-2 text-sm text-gray-300">{item.reason}</p>
                      {item.sources.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          Fontes: {item.sources.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Nenhuma alteração sugerida com os critérios atuais.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
