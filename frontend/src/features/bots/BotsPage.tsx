import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bot, Cpu, Play, Plus, Power, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useWebSocket } from '../../app/providers/WebSocketProvider'
import { Badge } from '../../shared/components/ui/Badge'
import { Button } from '../../shared/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../shared/components/ui/Card'
import { Checkbox } from '../../shared/components/ui/Checkbox'
import { Input } from '../../shared/components/ui/Input'
import { Label } from '../../shared/components/ui/Label'
import { Modal } from '../../shared/components/ui/Modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../shared/components/ui/Select'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../shared/components/ui/Table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/components/ui/Tabs'
import { Textarea } from '../../shared/components/ui/Textarea'
import { formatCurrency, formatDate, formatNumber, formatPercent, getProfitColor } from '../../shared/utils/formatters'
import {
  BOTS_QUERY_KEYS,
  useBotDetail,
  useExportBotHomologationPack,
  useBotHistory,
  useBotHomologationReport,
  useBotModels,
  useBotTemplates,
  useBots,
  useBotWorkerStatus,
  useArchiveBotModel,
  usePromoteBotModel,
  useCreateBot,
  useDeleteBot,
  usePauseBot,
  useResumeBot,
  useRunBotCycle,
  useUpdateBot,
} from './hooks/useBots'
import type {
  BotDetail,
  BotExecutionMode,
  BotHistory,
  BotHomologationReport,
  BotListItem,
  BotModelArtifact,
  BotModelGovernanceSummary,
  BotPaperReadiness,
  BotOperationalStatus,
  BotTemplateSummary,
  CreateBotPayload,
} from './types/bots.types'

interface BotEditorFormState {
  name: string
  description: string
  executionMode: BotExecutionMode
  status: BotOperationalStatus
  timeframe: string
  minConfidence: string
  useGlobalAllowedPairs: boolean
  allowedPairs: string
  maxPairsToAnalyze: string
  maxExecutableOpportunitiesPerCycle: string
  minVolume: string
  maxSpreadPercent: string
  microMomentumThresholdPercent: string
  orderImbalanceThreshold: string
  stopLossPercent: string
  takeProfitPercent: string
  circuitBreakerDailyLossPercent: string
  circuitBreakerCooldownMinutes: string
  maxConsecutiveLosses: string
  maxPositionSize: string
  maxExposurePerCoin: string
  maxTotalExposure: string
  maxConcurrentTrades: string
  minCorrelationThreshold: string
  atrPeriod: string
  targetAtrPercent: string
  minAtrPositionFactor: string
}

const DEFAULT_FORM_STATE: BotEditorFormState = {
  name: '',
  description: '',
  executionMode: 'paper',
  status: 'offline',
  timeframe: '1h',
  minConfidence: '',
  useGlobalAllowedPairs: true,
  allowedPairs: '',
  maxPairsToAnalyze: '',
  maxExecutableOpportunitiesPerCycle: '',
  minVolume: '',
  maxSpreadPercent: '',
  microMomentumThresholdPercent: '',
  orderImbalanceThreshold: '',
  stopLossPercent: '',
  takeProfitPercent: '',
  circuitBreakerDailyLossPercent: '',
  circuitBreakerCooldownMinutes: '',
  maxConsecutiveLosses: '',
  maxPositionSize: '',
  maxExposurePerCoin: '',
  maxTotalExposure: '',
  maxConcurrentTrades: '',
  minCorrelationThreshold: '',
  atrPeriod: '',
  targetAtrPercent: '',
  minAtrPositionFactor: '',
}

function parsePairsInput(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,;]+/).map((entry) => entry.trim().toUpperCase()).filter(Boolean)))
}

function toStringValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return ''
}

function parseOptionalNumber(value: string, integer: boolean = false): number | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return undefined
  return integer ? Math.round(parsed) : parsed
}

function getTemplatePairs(defaultParameters: Record<string, unknown>): string[] {
  return Array.from(new Set(
    (Array.isArray(defaultParameters.allowedPairs) ? defaultParameters.allowedPairs : [])
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ))
}

function resolveTemplatePreset(template: BotTemplateSummary) {
  const templatePairs = getTemplatePairs(template.defaultParameters)

  return {
    name: template.name,
    description: template.description,
    useGlobalAllowedPairs: templatePairs.length === 0,
    allowedPairs: templatePairs.join(', '),
    maxPairsToAnalyze: toStringValue(template.defaultParameters.maxPairsToAnalyze),
    maxExecutableOpportunitiesPerCycle: toStringValue(template.defaultParameters.maxExecutableOpportunitiesPerCycle),
  }
}

function buildFormState(detail?: BotDetail): BotEditorFormState {
  if (!detail) return DEFAULT_FORM_STATE
  const parameters = detail.effectiveParameters

  return {
    name: detail.name,
    description: detail.description ?? '',
    executionMode: detail.executionMode,
    status: detail.status === 'online' ? 'online' : 'offline',
    timeframe: typeof parameters.timeframe === 'string' ? parameters.timeframe : '1h',
    minConfidence: toStringValue(parameters.minConfidence),
    useGlobalAllowedPairs: detail.allowedPairsSource === 'global',
    allowedPairs: detail.effectiveAllowedPairs.join(', '),
    maxPairsToAnalyze: toStringValue(parameters.maxPairsToAnalyze),
    maxExecutableOpportunitiesPerCycle: toStringValue(parameters.maxExecutableOpportunitiesPerCycle),
    minVolume: toStringValue(parameters.minVolume),
    maxSpreadPercent: toStringValue(parameters.maxSpreadPercent),
    microMomentumThresholdPercent: toStringValue(parameters.microMomentumThresholdPercent),
    orderImbalanceThreshold: toStringValue(parameters.orderImbalanceThreshold),
    stopLossPercent: toStringValue(parameters.stopLossPercent),
    takeProfitPercent: toStringValue(parameters.takeProfitPercent),
    circuitBreakerDailyLossPercent: toStringValue(parameters.circuitBreakerDailyLossPercent),
    circuitBreakerCooldownMinutes: toStringValue(parameters.circuitBreakerCooldownMinutes),
    maxConsecutiveLosses: toStringValue(parameters.maxConsecutiveLosses),
    maxPositionSize: toStringValue(parameters.maxPositionSize),
    maxExposurePerCoin: toStringValue(parameters.maxExposurePerCoin),
    maxTotalExposure: toStringValue(parameters.maxTotalExposure),
    maxConcurrentTrades: toStringValue(parameters.maxConcurrentTrades),
    minCorrelationThreshold: toStringValue(parameters.minCorrelationThreshold),
    atrPeriod: toStringValue(parameters.atrPeriod),
    targetAtrPercent: toStringValue(parameters.targetAtrPercent),
    minAtrPositionFactor: toStringValue(parameters.minAtrPositionFactor),
  }
}

function buildUpdatePayload(formState: BotEditorFormState) {
  return {
    name: formState.name.trim(),
    description: formState.description.trim() || null,
    executionMode: formState.executionMode,
    status: formState.status,
    parameters: {
      timeframe: formState.timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
      minConfidence: parseOptionalNumber(formState.minConfidence),
      allowedPairs: formState.useGlobalAllowedPairs ? [] : parsePairsInput(formState.allowedPairs),
      maxPairsToAnalyze: parseOptionalNumber(formState.maxPairsToAnalyze, true),
      maxExecutableOpportunitiesPerCycle: parseOptionalNumber(formState.maxExecutableOpportunitiesPerCycle, true),
      minVolume: parseOptionalNumber(formState.minVolume),
      maxSpreadPercent: parseOptionalNumber(formState.maxSpreadPercent),
      microMomentumThresholdPercent: parseOptionalNumber(formState.microMomentumThresholdPercent),
      orderImbalanceThreshold: parseOptionalNumber(formState.orderImbalanceThreshold),
      stopLossPercent: parseOptionalNumber(formState.stopLossPercent),
      takeProfitPercent: parseOptionalNumber(formState.takeProfitPercent),
      circuitBreakerDailyLossPercent: parseOptionalNumber(formState.circuitBreakerDailyLossPercent),
      circuitBreakerCooldownMinutes: parseOptionalNumber(formState.circuitBreakerCooldownMinutes, true),
      maxConsecutiveLosses: parseOptionalNumber(formState.maxConsecutiveLosses, true),
      maxPositionSize: parseOptionalNumber(formState.maxPositionSize),
      maxExposurePerCoin: parseOptionalNumber(formState.maxExposurePerCoin),
      maxTotalExposure: parseOptionalNumber(formState.maxTotalExposure),
      maxConcurrentTrades: parseOptionalNumber(formState.maxConcurrentTrades, true),
      minCorrelationThreshold: parseOptionalNumber(formState.minCorrelationThreshold),
      atrPeriod: parseOptionalNumber(formState.atrPeriod, true),
      targetAtrPercent: parseOptionalNumber(formState.targetAtrPercent),
      minAtrPositionFactor: parseOptionalNumber(formState.minAtrPositionFactor),
    },
  }
}

function SectionField({ label, children, description }: { label: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {description && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>}
    </div>
  )
}

function BotStatusBadge({ bot }: { bot: BotListItem | BotDetail }) {
  if (bot.status === 'training') return <Badge variant="warning">Treinando</Badge>
  if (bot.status === 'error') return <Badge variant="error">Erro</Badge>
  if (bot.status === 'online') return <Badge variant={bot.isPaused ? 'warning' : 'success'}>{bot.isPaused ? 'Pausado' : 'Online'}</Badge>
  return <Badge variant="default">Offline</Badge>
}

function ActionBadge({ action }: { action?: 'buy' | 'sell' | 'hold' }) {
  if (action === 'buy') return <Badge variant="success">Compra</Badge>
  if (action === 'sell') return <Badge variant="error">Venda</Badge>
  return <Badge variant="default">Hold</Badge>
}

function DecisionExecutionBadge({ status }: { status: 'skipped' | 'suggested' | 'submitted' | 'executed' }) {
  if (status === 'executed') return <Badge variant="success">Executado</Badge>
  if (status === 'submitted') return <Badge variant="warning">Enviado</Badge>
  if (status === 'suggested') return <Badge variant="primary">Sugerido</Badge>
  return <Badge variant="default">Ignorado</Badge>
}

function ModelReadinessBadge({ modelReady }: { modelReady: boolean }) {
  return modelReady
    ? <Badge variant="success">Modelo pronto</Badge>
    : <Badge variant="warning">Modelo pendente</Badge>
}

function PaperReadinessBadge({ readiness }: { readiness?: BotPaperReadiness }) {
  if (!readiness) {
    return <Badge variant="default">Paper sem histórico</Badge>
  }

  return readiness.readyForFullAuto
    ? <Badge variant="success">Pronto para full_auto</Badge>
    : <Badge variant="warning">Em validação paper</Badge>
}

function ModelGovernanceBadge({ model }: { model: BotModelArtifact }) {
  if (model.governanceRole === 'champion') {
    return <Badge variant="success">Champion</Badge>
  }

  if (model.governanceRole === 'archived') {
    return <Badge variant="default">Arquivado</Badge>
  }

  return <Badge variant="primary">Challenger</Badge>
}

function MetricCard({ icon: Icon, title, value, caption }: { icon: typeof Bot; title: string; value: string; caption: string }) {
  return (
    <Card variant="compact">
      <CardContent className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-500">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>{title}</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{caption}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function toInputDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function toIsoBoundary(date: string, boundary: 'start' | 'end'): string | undefined {
  if (!date) {
    return undefined
  }

  return boundary === 'start'
    ? `${date}T00:00:00.000Z`
    : `${date}T23:59:59.999Z`
}

function VerdictBadge({ report }: { report?: BotHomologationReport }) {
  if (!report) {
    return <Badge variant="default">Sem relatório</Badge>
  }

  if (report.verdict.status === 'approved') {
    return <Badge variant="success">Homologado</Badge>
  }

  if (report.verdict.status === 'attention') {
    return <Badge variant="warning">Em atenção</Badge>
  }

  return <Badge variant="error">Bloqueado</Badge>
}

function BotListPanel({
  bots,
  selectedBotId,
  onSelectBot,
  onCreate,
  workerRunning,
  isLoading,
}: {
  bots: BotListItem[] | undefined
  selectedBotId: string
  onSelectBot: (botId: string) => void
  onCreate: () => void
  workerRunning: boolean
  isLoading: boolean
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Frota de Bots</CardTitle>
          <CardDescription>Instâncias, especializações e modos operacionais.</CardDescription>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Novo bot
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Worker de execução</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {workerRunning ? 'Loop automático ativo' : 'Worker parado'}
            </p>
          </div>
          <Badge variant={workerRunning ? 'success' : 'warning'}>{workerRunning ? 'Ativo' : 'Parado'}</Badge>
        </div>

        <div className="space-y-2">
          {isLoading
            ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-28 rounded-2xl" />)
            : bots?.map((bot) => {
                const isSelected = bot.id === selectedBotId
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => onSelectBot(bot.id)}
                    className="w-full rounded-2xl border p-4 text-left transition-all duration-200"
                    style={{
                      borderColor: isSelected ? 'var(--primary-500)' : 'var(--border-color)',
                      backgroundColor: isSelected ? 'color-mix(in srgb, var(--surface-1) 86%, var(--primary-500) 14%)' : 'var(--surface-1)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{bot.name}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{bot.templateName ?? bot.strategy}</p>
                      </div>
                      <BotStatusBadge bot={bot} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="default">{bot.executionMode ?? 'paper'}</Badge>
                      <Badge variant={bot.userId ? 'primary' : 'default'}>{bot.userId ? 'Customizado' : 'Sistema'}</Badge>
                      {bot.indicatorType && <Badge variant="default">{bot.indicatorType}</Badge>}
                      <PaperReadinessBadge readiness={bot.paperReadiness} />
                    </div>

                    <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <span>Foco: {bot.focusPair ?? 'dinâmico'}</span>
                        <span>{typeof bot.confidence === 'number' ? `${Math.round(bot.confidence)}%` : 'Sem confiança'}</span>
                      </div>
                      <div>Melhor oportunidade: {bot.currentPair ?? 'sem oportunidade relevante'}</div>
                    </div>
                  </button>
                )
              })}
        </div>
      </CardContent>
    </Card>
  )
}

function BotHistoryPanel({ history, isLoading }: { history?: BotHistory; isLoading: boolean }) {
  const summary = history?.decisionSummary ?? {
    total: 0,
    pending: 0,
    evaluated: 0,
    correct: 0,
    accuracyPercent: 0,
    averageConfidence: 0,
    averageMarketReturnPercent: 0,
    averageStrategyReturnPercent: 0,
    bestEdgePercent: 0,
    worstEdgePercent: 0,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico Operacional</CardTitle>
        <CardDescription>Transações, decisões rastreadas e sessões de treino do bot.</CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Sinais rastreados</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.total}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{summary.pending} pendentes de avaliação</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Acurácia online</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(summary.accuracyPercent)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{summary.correct}/{summary.evaluated} sinais avaliados</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Confiança média</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(summary.averageConfidence)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>sinais sugeridos pelo modelo</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Retorno médio da estratégia</p>
                <p className={`mt-2 font-semibold ${getProfitColor(summary.averageStrategyReturnPercent)}`}>{formatPercent(summary.averageStrategyReturnPercent)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>mercado: {formatPercent(summary.averageMarketReturnPercent)}</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Melhor edge</p>
                <p className={`mt-2 font-semibold ${getProfitColor(summary.bestEdgePercent)}`}>{formatPercent(summary.bestEdgePercent)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>pior: {formatPercent(summary.worstEdgePercent)}</p>
              </div>
            </div>

            <Tabs defaultValue="decisions">
            <TabsList>
              <TabsTrigger value="decisions">Sinais</TabsTrigger>
              <TabsTrigger value="transactions">Transações</TabsTrigger>
              <TabsTrigger value="traces">Traces</TabsTrigger>
              <TabsTrigger value="training">Treinos</TabsTrigger>
            </TabsList>

            <TabsContent value="decisions">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Momento</TableHead>
                    <TableHead>Par</TableHead>
                    <TableHead>Sinal</TableHead>
                    <TableHead>Execução</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Edge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.decisions.length
                    ? history.decisions.map((decision) => (
                        <TableRow key={decision.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{formatDate(decision.createdAt)}</div>
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                horizonte: {decision.horizonCandles} candle(s)
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{decision.pair}</div>
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{decision.timeframe}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <ActionBadge action={decision.action} />
                                <span style={{ color: 'var(--text-secondary)' }}>{formatPercent(decision.confidence)}</span>
                              </div>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{decision.reason}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <DecisionExecutionBadge status={decision.executionStatus} />
                                <Badge variant={decision.executionMode === 'full_auto' ? 'error' : decision.executionMode === 'semi_auto' ? 'primary' : 'default'}>
                                  {decision.executionMode}
                                </Badge>
                              </div>
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {typeof decision.requestedQuantity === 'number' ? `qtd. ${formatNumber(decision.requestedQuantity, 6)}` : 'sem ordem'}
                              </div>
                              {(typeof decision.slippagePercent === 'number' || typeof decision.simulatedFillPercent === 'number') && (
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {typeof decision.slippagePercent === 'number' ? `slippage ${formatPercent(decision.slippagePercent)}` : ''}
                                  {typeof decision.slippagePercent === 'number' && typeof decision.simulatedFillPercent === 'number' ? ' · ' : ''}
                                  {typeof decision.simulatedFillPercent === 'number' ? `fill ${formatPercent(decision.simulatedFillPercent * 100)}` : ''}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={decision.evaluationStatus === 'evaluated' ? 'success' : 'warning'}>
                                  {decision.evaluationStatus === 'evaluated' ? 'Avaliado' : 'Pendente'}
                                </Badge>
                                {typeof decision.isCorrect === 'boolean' && (
                                  <Badge variant={decision.isCorrect ? 'success' : 'error'}>
                                    {decision.isCorrect ? 'Acerto' : 'Erro'}
                                  </Badge>
                                )}
                              </div>
                              {decision.evaluationStatus === 'evaluated' && (
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  mercado {formatPercent(decision.marketReturnPercent ?? 0)} · estratégia {formatPercent(decision.strategyReturnPercent ?? 0)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={getProfitColor(decision.realizedEdgePercent ?? 0)}>
                            {decision.evaluationStatus === 'evaluated'
                              ? formatPercent(decision.realizedEdgePercent ?? 0)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center" style={{ color: 'var(--text-muted)' }}>
                            Ainda não há sinais avaliáveis para este bot.
                          </TableCell>
                        </TableRow>
                      )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="transactions">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Par</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Qtd.</TableHead>
                    <TableHead>PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.transactions.length
                    ? history.transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>{formatDate(transaction.date)}</TableCell>
                          <TableCell>{transaction.pair}</TableCell>
                          <TableCell>
                            <Badge variant={transaction.type === 'buy' ? 'success' : 'error'}>
                              {transaction.type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{transaction.status}</div>
                              {transaction.externalStatus && (
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Binance: {transaction.externalStatus}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{formatNumber(transaction.quantity, 6)}</div>
                              {transaction.requestedQuantity !== transaction.quantity && (
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Solicitado: {formatNumber(transaction.requestedQuantity, 6)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={getProfitColor(transaction.profitBrl ?? 0)}>
                            {transaction.profitBrl !== null
                              ? `${formatCurrency(transaction.profitBrl)} · ${formatPercent(transaction.profitPercent ?? 0)}`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center" style={{ color: 'var(--text-muted)' }}>
                            Ainda não há transações para este bot.
                          </TableCell>
                        </TableRow>
                      )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="traces">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Momento</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.traces.length
                    ? history.traces.map((trace) => (
                        <TableRow key={trace.id}>
                          <TableCell>{formatDate(trace.timestamp)}</TableCell>
                          <TableCell>{trace.functionName}</TableCell>
                          <TableCell>{trace.message}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <ActionBadge action={trace.recommendedAction} />
                              {trace.errorFlag && <Badge variant="error">Erro</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{formatNumber(trace.durationMs, 0)} ms</TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center" style={{ color: 'var(--text-muted)' }}>
                            Ainda não há traces operacionais para este bot.
                          </TableCell>
                        </TableRow>
                      )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="training">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Melhor época</TableHead>
                    <TableHead>Best val loss</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.trainingSessions.length
                    ? history.trainingSessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{formatDate(session.startTime)}</TableCell>
                          <TableCell>{session.status}</TableCell>
                          <TableCell>{session.bestEpoch ?? '-'}</TableCell>
                          <TableCell>{typeof session.bestValLoss === 'number' ? formatNumber(session.bestValLoss, 4) : '-'}</TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center" style={{ color: 'var(--text-muted)' }}>
                            Ainda não há sessões de treino associadas.
                          </TableCell>
                        </TableRow>
                      )}
                </TableBody>
              </Table>
            </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BotHomologationPanel({
  botName,
  report,
  isLoading,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onExportPack,
  isExportingPack,
}: {
  botName?: string
  report?: BotHomologationReport
  isLoading: boolean
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onExportPack: () => void
  isExportingPack: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Homologação Assistida</CardTitle>
            <CardDescription>
              Relatório consolidado de paper, execução, traces e bloqueios para validar o comportamento do bot.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <SectionField label="Início">
              <Input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
            </SectionField>
            <SectionField label="Fim">
              <Input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
            </SectionField>
            <Button variant="secondary" onClick={onExportPack} isLoading={isExportingPack} disabled={isLoading || !report}>
              <Save className="h-4 w-4" />
              Exportar pacote
            </Button>
            <VerdictBadge report={report} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : report ? (
          <div className="space-y-6">
            {botName && (
              <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                Pacote de exportacao inclui o resumo consolidado e os traces essenciais desta janela para o bot <span style={{ color: 'var(--text-primary)' }}>{botName}</span>.
              </div>
            )}
            <div
              className="rounded-3xl border p-5"
              style={{
                borderColor: report.verdict.status === 'approved'
                  ? 'var(--success-500)'
                  : report.verdict.status === 'attention'
                    ? 'var(--warning-500)'
                    : 'var(--danger-500)',
                backgroundColor: report.verdict.status === 'approved'
                  ? 'color-mix(in srgb, var(--success-500) 12%, transparent)'
                  : report.verdict.status === 'attention'
                    ? 'color-mix(in srgb, var(--warning-500) 12%, transparent)'
                    : 'color-mix(in srgb, var(--danger-500) 12%, transparent)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge report={report} />
                <Badge variant={report.fullAutoEligibility.eligible ? 'success' : 'warning'}>
                  {report.fullAutoEligibility.eligible ? 'full_auto elegível' : 'full_auto bloqueado'}
                </Badge>
                <Badge variant="default">{report.period.days} dia(s)</Badge>
              </div>
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {report.verdict.summary}
              </p>
              {report.verdict.blockers.length > 0 && (
                <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {report.verdict.blockers.map((blocker) => (
                    <p key={blocker}>- {blocker}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Sinais avaliados</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {report.paperReadiness.evaluatedSignals}/{report.paperReadiness.minimumEvaluatedSignals}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>prontos para decisão de paper</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Acurácia online</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(report.paperReadiness.accuracyPercent)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>meta mínima {formatPercent(report.paperReadiness.minimumAccuracyPercent)}</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>PnL consolidado</p>
                <p className={`mt-2 font-semibold ${getProfitColor(report.executionSummary.totalProfitBrl)}`}>{formatCurrency(report.executionSummary.totalProfitBrl)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  médio {formatPercent(report.executionSummary.averageProfitPercent)}
                </p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Traces com erro</p>
                <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {report.operationalSummary.errorTraces}/{report.operationalSummary.totalTraces}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  snapshots em {formatPercent(report.operationalSummary.snapshotCoveragePercent)}
                </p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Achados da homologação</h3>
                <div className="mt-4 space-y-3">
                  {report.findings.map((finding) => (
                    <div key={`${finding.severity}-${finding.title}-${finding.detail}`} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={finding.severity === 'critical' ? 'error' : finding.severity === 'warning' ? 'warning' : 'default'}>
                          {finding.severity}
                        </Badge>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{finding.title}</span>
                      </div>
                      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{finding.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Resumo operacional</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Execuções reais/paper</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{report.executionSummary.executedTransactions}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>enviadas/pedentes {report.executionSummary.submittedTransactions}</p>
                  </div>
                  <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Drawdown observado</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(report.paperReadiness.maxObservedDrawdownPercent)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>limite {formatPercent(report.paperReadiness.maximumDrawdownPercent)}</p>
                  </div>
                  <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Slippage médio</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(report.executionSummary.averageSlippagePercent)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>latência {formatNumber(report.executionSummary.averageSimulatedLatencyMs, 0)} ms</p>
                  </div>
                  <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Sequência de erros</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{report.paperReadiness.maxConsecutiveIncorrect}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>limite {report.paperReadiness.maximumConsecutiveIncorrect}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Funções mais lentas</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {report.operationalSummary.slowestFunctions.slice(0, 4).map((entry) => (
                      <div key={`${entry.module}-${entry.functionName}`} className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{entry.functionName}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{entry.module} · {entry.count} ocorrência(s)</p>
                        </div>
                        <div className="text-right">
                          <p style={{ color: 'var(--text-primary)' }}>{formatNumber(entry.averageDurationMs, 0)} ms</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>máx {formatNumber(entry.maxDurationMs, 0)} ms</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="pairs">
              <TabsList>
                <TabsTrigger value="pairs">Pares</TabsTrigger>
                <TabsTrigger value="incidents">Incidentes</TabsTrigger>
                <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
              </TabsList>

              <TabsContent value="pairs">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Par</TableHead>
                      <TableHead>Sinais</TableHead>
                      <TableHead>Acurácia</TableHead>
                      <TableHead>Retorno</TableHead>
                      <TableHead>Edge</TableHead>
                      <TableHead>PnL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.pairBreakdown.length
                      ? report.pairBreakdown.slice(0, 8).map((entry) => (
                          <TableRow key={entry.pair}>
                            <TableCell>{entry.pair}</TableCell>
                            <TableCell>{entry.decisions}</TableCell>
                            <TableCell>{formatPercent(entry.accuracyPercent)}</TableCell>
                            <TableCell className={getProfitColor(entry.averageStrategyReturnPercent)}>{formatPercent(entry.averageStrategyReturnPercent)}</TableCell>
                            <TableCell className={getProfitColor(entry.averageEdgePercent)}>{formatPercent(entry.averageEdgePercent)}</TableCell>
                            <TableCell className={getProfitColor(entry.profitBrl)}>{formatCurrency(entry.profitBrl)}</TableCell>
                          </TableRow>
                        ))
                      : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center" style={{ color: 'var(--text-muted)' }}>
                              Ainda não há dados por par nesta janela.
                            </TableCell>
                          </TableRow>
                        )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="incidents">
                <div className="space-y-3">
                  {report.recentIncidents.length
                    ? report.recentIncidents.map((incident) => (
                        <div key={incident.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="error">{incident.level}</Badge>
                            {incident.stage && <Badge variant="default">{incident.stage}</Badge>}
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(incident.timestamp)}</span>
                          </div>
                          <p className="mt-2 font-medium" style={{ color: 'var(--text-primary)' }}>{incident.message}</p>
                          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {incident.functionName} · {incident.currentPair ?? 'sem par'} · {formatNumber(incident.durationMs, 0)} ms
                          </p>
                        </div>
                      ))
                    : (
                        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          Nenhum incidente recente nesta janela.
                        </div>
                      )}
                </div>
              </TabsContent>

              <TabsContent value="snapshots">
                <div className="space-y-4">
                  {report.recentSnapshots.length
                    ? report.recentSnapshots.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={entry.errorFlag ? 'error' : 'default'}>{entry.errorFlag ? 'Erro' : entry.level}</Badge>
                            {entry.stage && <Badge variant="primary">{entry.stage}</Badge>}
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(entry.timestamp)}</span>
                          </div>
                          <p className="mt-2 font-medium" style={{ color: 'var(--text-primary)' }}>{entry.message}</p>
                          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-2xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                            {JSON.stringify(entry.snapshot ?? {}, null, 2)}
                          </pre>
                        </div>
                      ))
                    : (
                        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          Ainda não há snapshots estruturados para esta janela.
                        </div>
                      )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            Nenhum relatório disponível para o período selecionado.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BotModelsPanel({
  botName,
  models,
  governance,
  isLoading,
  isPromoting,
  isArchiving,
  onPromote,
  onArchive,
}: {
  botName: string
  models?: BotModelArtifact[]
  governance?: BotModelGovernanceSummary
  isLoading: boolean
  isPromoting: boolean
  isArchiving: boolean
  onPromote: (modelId: string) => Promise<void>
  onArchive: (modelId: string) => Promise<void>
}) {
  const activeModel = models?.find((item) => item.isActive) ?? models?.find((item) => item.governanceRole === 'champion')
  const recommendedPromotion = governance?.recommendedPromotion

  return (
    <Card>
      <CardHeader>
        <CardTitle>Governança de Modelos</CardTitle>
        <CardDescription>
          Controle champion/challenger do bot {botName}, promovendo versões testadas antes do uso operacional.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {governance?.fullAutoEligibility ? (
          <div
            className="rounded-2xl border p-4"
            style={{
              borderColor: governance.fullAutoEligibility.eligible ? 'var(--success-500)' : 'var(--warning-500)',
              backgroundColor: governance.fullAutoEligibility.eligible
                ? 'color-mix(in srgb, var(--success-500) 12%, transparent)'
                : 'color-mix(in srgb, var(--warning-500) 12%, transparent)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={governance.fullAutoEligibility.eligible ? 'success' : 'warning'}>
                {governance.fullAutoEligibility.eligible ? 'full_auto elegível' : 'full_auto bloqueado'}
              </Badge>
              {governance.championModelVersion && <Badge variant="default">{governance.championModelVersion}</Badge>}
            </div>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {governance.fullAutoEligibility.eligible
                ? 'O champion atual já cumpre os critérios formais para operação real.'
                : 'O champion atual ainda não pode abrir novas posições em full_auto.'}
            </p>
            {!governance.fullAutoEligibility.eligible && governance.fullAutoEligibility.blockers.length > 0 && (
              <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {governance.fullAutoEligibility.blockers.map((blocker) => (
                  <p key={blocker}>- {blocker}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeModel ? (
          <div className="rounded-2xl border border-success-500/25 bg-success-500/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ModelGovernanceBadge model={activeModel} />
              <Badge variant="default">{activeModel.modelVersion}</Badge>
              {activeModel.architecture && <Badge variant="default">{activeModel.architecture}</Badge>}
            </div>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Modelo ativo: {activeModel.modelVersion}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Promovido em {activeModel.promotedAt ? formatDate(activeModel.promotedAt) : 'data não disponível'} ·
              validação {activeModel.validationStrategy ?? 'N/A'} ·
              horizonte {activeModel.forecastHorizonCandles ?? 0} candle(s)
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            Ainda não há champion definido para este bot.
          </div>
        )}

        {recommendedPromotion ? (
          <div className="rounded-2xl border border-primary-500/25 bg-primary-500/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">Promoção recomendada</Badge>
                  <Badge variant="default">{recommendedPromotion.modelVersion}</Badge>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  O challenger {recommendedPromotion.modelVersion} superou o champion atual pelos critérios configurados.
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {recommendedPromotion.reason}
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => void onPromote(recommendedPromotion.artifactId)}
                isLoading={isPromoting}
              >
                Promover recomendado
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : models?.length ? (
          <div className="space-y-3">
            {models.map((model) => (
              <div
                key={model.id}
                className="rounded-2xl border p-4"
                style={{ borderColor: model.isActive ? 'var(--success-500)' : 'var(--border-color)' }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ModelGovernanceBadge model={model} />
                      <Badge variant="default">{model.modelVersion}</Badge>
                      {model.architecture && <Badge variant="default">{model.architecture}</Badge>}
                      {model.isActive && <Badge variant="success">Ativo na instância</Badge>}
                    </div>

                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {model.trainingSessionId ? `Treino ${model.trainingSessionId}` : 'Sem vínculo de sessão'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Criado em {formatDate(model.createdAt)} · fingerprint {model.fingerprint.slice(0, 10)}...
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Accuracy {typeof model.evaluation.accuracyPercent === 'number' ? formatPercent(model.evaluation.accuracyPercent) : 'N/A'} ·
                      F1 {typeof model.evaluation.f1Score === 'number' ? formatPercent(model.evaluation.f1Score) : 'N/A'} ·
                      best epoch {model.evaluation.bestEpoch ?? 'N/A'}
                    </div>
                    {model.paperReadiness && (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Paper {model.paperReadiness.evaluatedSignals}/{model.paperReadiness.minimumEvaluatedSignals} sinais ·
                        acurácia {formatPercent(model.paperReadiness.accuracyPercent)} ·
                        retorno {formatPercent(model.paperReadiness.averageStrategyReturnPercent)} ·
                        edge {formatPercent(model.paperReadiness.averageEdgePercent)}
                      </div>
                    )}
                    {model.decisionSummary && (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {model.decisionSummary.evaluated} sinais avaliados ·
                        pendentes {model.decisionSummary.pending} ·
                        confiança média {formatPercent(model.decisionSummary.averageConfidence)}
                      </div>
                    )}
                    {model.operationalReadiness && !model.operationalReadiness.modelReady && (
                      <div className="text-xs" style={{ color: 'var(--warning-500)' }}>
                        {model.operationalReadiness.operationalBlockReason ?? 'Artefato ainda não está pronto para operação contínua.'}
                      </div>
                    )}
                    {model.paperReadiness && model.paperReadiness.blockers.length > 0 && (
                      <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {model.paperReadiness.blockers.slice(0, 2).map((blocker) => (
                          <p key={blocker}>- {blocker}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!model.isActive && model.governanceRole !== 'archived' && (
                      <Button
                        size="sm"
                        onClick={() => void onPromote(model.id)}
                        isLoading={isPromoting}
                      >
                        Promover
                      </Button>
                    )}
                    {!model.isActive && model.governanceRole !== 'archived' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void onArchive(model.id)}
                        isLoading={isArchiving}
                      >
                        Arquivar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            Nenhum artefato de modelo foi salvo ainda para esta instância.
          </div>
        )}

        <div className="rounded-2xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
          O champion alimenta o `modelUrl` ativo do bot. Novos modelos salvos entram como challenger, a menos que seja o primeiro modelo do bot.
        </div>
      </CardContent>
    </Card>
  )
}

function CreateBotModal({
  isOpen,
  templates,
  isLoading,
  onClose,
  onCreate,
  isSubmitting,
}: {
  isOpen: boolean
  templates: BotTemplateSummary[] | undefined
  isLoading: boolean
  onClose: () => void
  onCreate: (payload: CreateBotPayload) => Promise<void>
  isSubmitting: boolean
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [executionMode, setExecutionMode] = useState<BotExecutionMode>('paper')
  const [status, setStatus] = useState<BotOperationalStatus>('offline')
  const [useGlobalAllowedPairs, setUseGlobalAllowedPairs] = useState(true)
  const [allowedPairs, setAllowedPairs] = useState('')
  const [maxPairsToAnalyze, setMaxPairsToAnalyze] = useState('')
  const [maxExecutableOpportunitiesPerCycle, setMaxExecutableOpportunitiesPerCycle] = useState('')

  useEffect(() => {
    if (!isOpen || selectedTemplateId || !templates?.length) return
    const preset = resolveTemplatePreset(templates[0])
    setSelectedTemplateId(templates[0].id)
    setName(preset.name)
    setDescription(preset.description)
    setUseGlobalAllowedPairs(preset.useGlobalAllowedPairs)
    setAllowedPairs(preset.allowedPairs)
    setMaxPairsToAnalyze(preset.maxPairsToAnalyze)
    setMaxExecutableOpportunitiesPerCycle(preset.maxExecutableOpportunitiesPerCycle)
  }, [isOpen, selectedTemplateId, templates])

  const selectedTemplate = templates?.find((template) => template.id === selectedTemplateId)

  const resetAndClose = () => {
    setSelectedTemplateId('')
    setName('')
    setDescription('')
    setExecutionMode('paper')
    setStatus('offline')
    setUseGlobalAllowedPairs(true)
    setAllowedPairs('')
    setMaxPairsToAnalyze('')
    setMaxExecutableOpportunitiesPerCycle('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!selectedTemplateId || !name.trim()) {
      toast.error('Escolha um template e informe um nome para o bot')
      return
    }

    if (executionMode === 'full_auto') {
      toast.error('Crie a instância em paper ou semi_auto. O modo full_auto só é liberado após champion válido e paper readiness suficiente.')
      return
    }

    await onCreate({
      templateId: selectedTemplateId,
      name: name.trim(),
      description: description.trim() || undefined,
      executionMode,
      status,
      parameters: {
        allowedPairs: useGlobalAllowedPairs ? [] : parsePairsInput(allowedPairs),
        maxPairsToAnalyze: parseOptionalNumber(maxPairsToAnalyze, true),
        maxExecutableOpportunitiesPerCycle: parseOptionalNumber(maxExecutableOpportunitiesPerCycle, true),
      },
    })

    resetAndClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Criar bot customizado"
      size="lg"
      footer={(
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>Criar bot</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <SectionField label="Template base">
            {isLoading ? (
              <Skeleton className="h-11 rounded-xl" />
            ) : (
              <Select
                value={selectedTemplateId}
                onValueChange={(value) => {
                  setSelectedTemplateId(value)
                  const template = templates?.find((entry) => entry.id === value)
                  if (template) {
                    const preset = resolveTemplatePreset(template)
                    setName(preset.name)
                    setDescription(preset.description)
                    setUseGlobalAllowedPairs(preset.useGlobalAllowedPairs)
                    setAllowedPairs(preset.allowedPairs)
                    setMaxPairsToAnalyze(preset.maxPairsToAnalyze)
                    setMaxExecutableOpportunitiesPerCycle(preset.maxExecutableOpportunitiesPerCycle)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SectionField>

          <SectionField label="Nome do bot">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: MACD Intraday Bot" />
          </SectionField>

          <SectionField label="Descrição">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[100px]" />
          </SectionField>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionField label="Modo" description="Novas instâncias precisam nascer em paper ou semi_auto e só migram para full_auto depois da validação do champion.">
              <Select value={executionMode} onValueChange={(value) => setExecutionMode(value as BotExecutionMode)}>
                <SelectTrigger><SelectValue placeholder="Modo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">paper</SelectItem>
                  <SelectItem value="semi_auto">semi_auto</SelectItem>
                  <SelectItem value="full_auto">full_auto</SelectItem>
                </SelectContent>
              </Select>
            </SectionField>

            <SectionField label="Status inicial">
              <Select value={status} onValueChange={(value) => setStatus(value as BotOperationalStatus)}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">offline</SelectItem>
                  <SelectItem value="online">online</SelectItem>
                </SelectContent>
              </Select>
            </SectionField>
          </div>

          <div className="space-y-2 rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
            <Checkbox
              checked={useGlobalAllowedPairs}
              onChange={(event) => setUseGlobalAllowedPairs(event.target.checked)}
              label="Herdar pares globais"
            />
            <SectionField label="Pares permitidos">
              <Textarea
                value={allowedPairs}
                onChange={(event) => setAllowedPairs(event.target.value)}
                disabled={useGlobalAllowedPairs}
                className="min-h-[90px]"
                placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
              />
            </SectionField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionField
              label="Máx. pares por ciclo"
              description="Deixe em branco para analisar toda a lista gerenciada."
            >
              <Input
                value={maxPairsToAnalyze}
                onChange={(event) => setMaxPairsToAnalyze(event.target.value)}
                placeholder="Sem limite"
              />
            </SectionField>

            <SectionField
              label="Máx. execuções por ciclo"
              description="Limita quantas oportunidades podem seguir para execução/sugestão no mesmo ciclo."
            >
              <Input
                value={maxExecutableOpportunitiesPerCycle}
                onChange={(event) => setMaxExecutableOpportunitiesPerCycle(event.target.value)}
                placeholder="1"
              />
            </SectionField>
          </div>
        </div>

        <Card variant="compact" className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Resumo do template</CardTitle>
            <CardDescription>Defaults herdados quando a instância não sobrescreve.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTemplate ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedTemplate.name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selectedTemplate.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.indicatorType && <Badge variant="primary">{selectedTemplate.indicatorType}</Badge>}
                  {selectedTemplate.specialization && <Badge variant="default">{selectedTemplate.specialization}</Badge>}
                  <Badge variant="default">{selectedTemplate.strategyType}</Badge>
                </div>
                <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                  {JSON.stringify(selectedTemplate.defaultParameters, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Selecione um template para ver os defaults.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </Modal>
  )
}

export function BotsPage() {
  const queryClient = useQueryClient()
  const { isConnected, on, off } = useWebSocket()
  const [selectedBotId, setSelectedBotId] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [formState, setFormState] = useState<BotEditorFormState>(DEFAULT_FORM_STATE)
  const [homologationStartDate, setHomologationStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 14)
    return toInputDate(date)
  })
  const [homologationEndDate, setHomologationEndDate] = useState(() => toInputDate(new Date()))

  const { data: bots, isLoading: isLoadingBots } = useBots()
  const { data: templates, isLoading: isLoadingTemplates } = useBotTemplates()
  const { data: workerStatus } = useBotWorkerStatus()
  const { data: botDetail, isLoading: isLoadingDetail } = useBotDetail(selectedBotId)
  const { data: botHistory, isLoading: isLoadingHistory } = useBotHistory(selectedBotId)
  const { data: botHomologationReport, isLoading: isLoadingHomologationReport } = useBotHomologationReport(selectedBotId, {
    startDate: toIsoBoundary(homologationStartDate, 'start'),
    endDate: toIsoBoundary(homologationEndDate, 'end'),
  })
  const { data: botModels, isLoading: isLoadingModels } = useBotModels(selectedBotId)

  const createBotMutation = useCreateBot()
  const updateBotMutation = useUpdateBot()
  const deleteBotMutation = useDeleteBot()
  const exportHomologationPackMutation = useExportBotHomologationPack()
  const runBotCycleMutation = useRunBotCycle()
  const pauseBotMutation = usePauseBot()
  const resumeBotMutation = useResumeBot()
  const promoteBotModelMutation = usePromoteBotModel()
  const archiveBotModelMutation = useArchiveBotModel()

  useEffect(() => {
    if (!bots || bots.length === 0) {
      if (selectedBotId) setSelectedBotId('')
      return
    }

    if (!selectedBotId || !bots.some((bot) => bot.id === selectedBotId)) {
      setSelectedBotId(bots[0].id)
    }
  }, [bots, selectedBotId])

  useEffect(() => {
    if (botDetail) {
      setFormState(buildFormState(botDetail))
    }
  }, [botDetail])

  useEffect(() => {
    if (!isConnected) return

    const invalidateBots = () => {
      void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.list })
      void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.workerStatus })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bots-status'] })
      if (selectedBotId) {
        void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.detail(selectedBotId) })
        void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.history(selectedBotId) })
        void queryClient.invalidateQueries({ queryKey: ['bots', 'homologation-report', selectedBotId] })
      }
    }

    const handleDashboardUpdate = (payload: { scope?: 'portfolio' | 'bots' }) => {
      if (payload.scope === 'bots') invalidateBots()
    }
    const handleOrderUpdated = () => selectedBotId && void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.history(selectedBotId) })
    const handleTraceNew = () => selectedBotId && void queryClient.invalidateQueries({ queryKey: BOTS_QUERY_KEYS.history(selectedBotId) })

    on('dashboard:update', handleDashboardUpdate)
    on('order:created', handleOrderUpdated)
    on('order:updated', handleOrderUpdated)
    on('trace:new', handleTraceNew)

    return () => {
      off('dashboard:update', handleDashboardUpdate)
      off('order:created', handleOrderUpdated)
      off('order:updated', handleOrderUpdated)
      off('trace:new', handleTraceNew)
    }
  }, [isConnected, off, on, queryClient, selectedBotId])

  const customBots = bots?.filter((bot) => Boolean(bot.userId)).length ?? 0
  const liveBots = bots?.filter((bot) => bot.status === 'online' && !bot.isPaused).length ?? 0
  const bestConfidence = useMemo(() => {
    const confidences = bots?.map((bot) => bot.confidence).filter((value): value is number => typeof value === 'number') ?? []
    if (confidences.length === 0) return 'N/A'
    return `${Math.round(Math.max(...confidences))}%`
  }, [bots])
  const fullAutoEligibility = botModels?.governance.fullAutoEligibility

  const handleCreateBot = async (payload: CreateBotPayload) => {
    const createdBot = await createBotMutation.mutateAsync(payload)
    setSelectedBotId(createdBot.id)
    setIsCreateModalOpen(false)
  }

  const handleSaveBot = async () => {
    if (!selectedBotId || !formState.name.trim()) {
      toast.error('Selecione um bot e preencha o nome antes de salvar')
      return
    }

     if (formState.executionMode === 'full_auto' && fullAutoEligibility && !fullAutoEligibility.eligible) {
      toast.error(fullAutoEligibility.blockers[0] ?? 'O champion atual ainda não está apto para full_auto')
      return
    }

    const updatedBot = await updateBotMutation.mutateAsync({
      botId: selectedBotId,
      payload: buildUpdatePayload(formState),
    })

    if (updatedBot.id !== selectedBotId) {
      setSelectedBotId(updatedBot.id)
    }
  }

  const handleDeleteBot = async () => {
    if (!botDetail) return
    if (!botDetail.isCustom) {
      toast.error('Bots do sistema não podem ser excluídos')
      return
    }

    await deleteBotMutation.mutateAsync(botDetail.id)
    setSelectedBotId('')
  }

  const handlePauseResume = async () => {
    if (!botDetail) return
    if (botDetail.isPaused) {
      await resumeBotMutation.mutateAsync(botDetail.id)
      return
    }
    await pauseBotMutation.mutateAsync(botDetail.id)
  }

  const isSaving = updateBotMutation.isPending
  const isDeleting = deleteBotMutation.isPending
  const isRunningCycle = runBotCycleMutation.isPending
  const isPausing = pauseBotMutation.isPending || resumeBotMutation.isPending
  const isPromotingModel = promoteBotModelMutation.isPending
  const isArchivingModel = archiveBotModelMutation.isPending

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="app-page-title text-3xl font-bold">Bots IA</h1>
          <p className="app-page-subtitle mt-2 text-sm">
            Gerencie instâncias operacionais, risco, pares permitidos e histórico de decisões.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Criar bot
          </Button>
          <Button
            variant="primary"
            onClick={() => selectedBotId && void runBotCycleMutation.mutateAsync(selectedBotId)}
            disabled={!selectedBotId || (botDetail ? !botDetail.modelReady : false)}
            isLoading={isRunningCycle}
          >
            <Play className="h-4 w-4" />
            Rodar ciclo agora
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Bot} title="Bots carregados" value={String(bots?.length ?? 0)} caption="instâncias visíveis na conta" />
        <MetricCard icon={Cpu} title="Customizados" value={String(customBots)} caption="instâncias próprias do usuário" />
        <MetricCard icon={Power} title="Ativos" value={String(liveBots)} caption="online e sem pausa" />
        <MetricCard icon={ShieldCheck} title="Melhor confiança" value={bestConfidence} caption={workerStatus?.running ? 'worker ativo e monitorando' : 'worker parado'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <BotListPanel
            bots={bots}
            selectedBotId={selectedBotId}
            onSelectBot={setSelectedBotId}
            onCreate={() => setIsCreateModalOpen(true)}
            workerRunning={Boolean(workerStatus?.running)}
            isLoading={isLoadingBots}
          />
        </div>

        <div className="space-y-6 xl:col-span-8">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Configuração da Instância</CardTitle>
                  <CardDescription>Ajuste modo, limites de risco, pares permitidos e especialização operacional.</CardDescription>
                </div>
                {botDetail && (
                  <div className="flex flex-wrap items-center gap-2">
                    <BotStatusBadge bot={botDetail} />
                    <ActionBadge action={botDetail.recommendedAction} />
                    <ModelReadinessBadge modelReady={botDetail.modelReady} />
                    <PaperReadinessBadge readiness={botDetail.paperReadiness} />
                    <Badge variant={botDetail.isCustom ? 'primary' : 'default'}>{botDetail.isCustom ? 'Instância customizada' : 'Bot do sistema'}</Badge>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {isLoadingDetail ? (
                <div className="space-y-4">
                  <Skeleton className="h-11 rounded-xl" />
                  <Skeleton className="h-28 rounded-2xl" />
                  <Skeleton className="h-80 rounded-3xl" />
                </div>
              ) : botDetail ? (
                <>
                  {!botDetail.modelReady && botDetail.operationalBlockReason && (
                    <div className="mb-6 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {botDetail.operationalBlockReason}
                    </div>
                  )}

                  {!botDetail.paperReadiness.readyForFullAuto && (
                    <div className="mb-6 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        O bot ainda está em validação paper.
                      </p>
                      <p className="mt-1">
                        {botDetail.paperReadiness.evaluatedSignals}/{botDetail.paperReadiness.minimumEvaluatedSignals} sinais avaliados, acurácia em {formatPercent(botDetail.paperReadiness.accuracyPercent)} e drawdown observado de {formatPercent(botDetail.paperReadiness.maxObservedDrawdownPercent)}.
                      </p>
                      <ul className="mt-3 list-disc space-y-1 pl-5">
                        {botDetail.paperReadiness.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {botDetail.paperReadiness.readyForFullAuto && (
                    <div className="mb-6 rounded-2xl border border-success-500/30 bg-success-500/10 p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Este bot já cumpriu os critérios mínimos de validação paper.
                      </p>
                      <p className="mt-1">
                        Acurácia de {formatPercent(botDetail.paperReadiness.accuracyPercent)}, retorno médio de {formatPercent(botDetail.paperReadiness.averageStrategyReturnPercent)} e edge médio de {formatPercent(botDetail.paperReadiness.averageEdgePercent)}.
                      </p>
                    </div>
                  )}

                  <div className="mb-6 grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Template</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.template?.name ?? botDetail.strategyType}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{botDetail.template?.specialization ?? botDetail.strategyType}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Última análise</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.lastAnalysis ? formatDate(botDetail.lastAnalysis) : 'Sem análise'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {botDetail.currentPair ?? botDetail.focusPair ?? 'Sem par monitorado'}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Par de foco</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.focusPair ?? 'Dinâmico'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>prioridade atual de cobertura do bot</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Melhor oportunidade</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.currentPair ?? 'Nenhuma forte agora'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ação sugerida: {botDetail.recommendedAction ?? 'hold'}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Confiança atual</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{typeof botDetail.confidence === 'number' ? `${Math.round(botDetail.confidence)}%` : 'N/A'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ranking da oportunidade líder do ciclo</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Pares permitidos</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.effectiveAllowedPairs.length}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        origem: {botDetail.allowedPairsSource === 'global'
                          ? 'global'
                          : botDetail.allowedPairsSource === 'template'
                            ? 'template'
                            : 'instancia'}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Modelo ativo</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.modelReady ? 'Pronto para operar' : 'Pendente'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {botDetail.modelArchitecture ?? 'sem arquitetura'} · {botDetail.modelVersion}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Validação</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.validationStrategy ?? 'N/A'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>horizonte: {botDetail.forecastHorizonCandles ?? 0} candle(s)</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Paper readiness</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {botDetail.paperReadiness.readyForFullAuto ? 'Liberado' : 'Em validação'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {botDetail.paperReadiness.evaluatedSignals}/{botDetail.paperReadiness.minimumEvaluatedSignals} sinais avaliados
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Acurácia paper</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatPercent(botDetail.paperReadiness.accuracyPercent)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        drawdown: {formatPercent(botDetail.paperReadiness.maxObservedDrawdownPercent)}
                      </p>
                    </div>
                  </div>

                  {!botDetail.isCustom && (
                    <div className="mb-6 rounded-2xl border border-primary-500/25 bg-primary-500/8 p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Ao salvar alterações neste bot do sistema, o backend cria uma instância customizada só para a sua conta.
                    </div>
                  )}
                  
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Identidade e operação</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          Nome, modo operacional, timeframe e confiança mínima.
                        </p>
                      </div>

                      <SectionField label="Nome do bot">
                        <Input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} />
                      </SectionField>

                      <SectionField label="Descrição">
                        <Textarea value={formState.description} onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))} className="min-h-[100px]" />
                      </SectionField>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField
                          label="Modo de execução"
                          description={formState.executionMode === 'full_auto' && fullAutoEligibility && !fullAutoEligibility.eligible
                            ? fullAutoEligibility.blockers[0]
                            : 'paper executa na carteira local, semi_auto só sugere e full_auto exige champion validado em paper.'}
                        >
                          <Select value={formState.executionMode} onValueChange={(value) => setFormState((current) => ({ ...current, executionMode: value as BotExecutionMode }))}>
                            <SelectTrigger><SelectValue placeholder="Modo" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paper">paper</SelectItem>
                              <SelectItem value="semi_auto">semi_auto</SelectItem>
                              <SelectItem value="full_auto">full_auto</SelectItem>
                            </SelectContent>
                          </Select>
                        </SectionField>

                        <SectionField label="Status desejado">
                          <Select value={formState.status} onValueChange={(value) => setFormState((current) => ({ ...current, status: value as BotOperationalStatus }))}>
                            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="offline">offline</SelectItem>
                              <SelectItem value="online">online</SelectItem>
                            </SelectContent>
                          </Select>
                        </SectionField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Timeframe">
                          <Select value={formState.timeframe} onValueChange={(value) => setFormState((current) => ({ ...current, timeframe: value }))}>
                            <SelectTrigger><SelectValue placeholder="Timeframe" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1m">1m</SelectItem>
                              <SelectItem value="5m">5m</SelectItem>
                              <SelectItem value="15m">15m</SelectItem>
                              <SelectItem value="1h">1h</SelectItem>
                              <SelectItem value="4h">4h</SelectItem>
                              <SelectItem value="1d">1d</SelectItem>
                            </SelectContent>
                          </Select>
                        </SectionField>

                        <SectionField label="Confiança mínima (%)">
                          <Input value={formState.minConfidence} onChange={(event) => setFormState((current) => ({ ...current, minConfidence: event.target.value }))} placeholder="60" />
                        </SectionField>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Microestrutura</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          Filtros de spread, liquidez e momentum para perfis de scalping e micro trades.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Volume minimo 24h">
                          <Input value={formState.minVolume} onChange={(event) => setFormState((current) => ({ ...current, minVolume: event.target.value }))} placeholder="250000" />
                        </SectionField>
                        <SectionField label="Spread maximo (%)">
                          <Input value={formState.maxSpreadPercent} onChange={(event) => setFormState((current) => ({ ...current, maxSpreadPercent: event.target.value }))} placeholder="0.05" />
                        </SectionField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Micro momentum minimo (%)">
                          <Input value={formState.microMomentumThresholdPercent} onChange={(event) => setFormState((current) => ({ ...current, microMomentumThresholdPercent: event.target.value }))} placeholder="0.05" />
                        </SectionField>
                        <SectionField label="Imbalance minimo">
                          <Input value={formState.orderImbalanceThreshold} onChange={(event) => setFormState((current) => ({ ...current, orderImbalanceThreshold: event.target.value }))} placeholder="0.58" />
                        </SectionField>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Pares e cobertura</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          Controle a lista de ativos da instância sem mexer no restante da frota.
                        </p>
                      </div>

                      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                        <Checkbox
                          checked={formState.useGlobalAllowedPairs}
                          onChange={(event) => setFormState((current) => ({ ...current, useGlobalAllowedPairs: event.target.checked }))}
                          label="Usar pares globais da configuração"
                        />
                      </div>

                      <SectionField label="Pares permitidos" description="Separe por vírgula, ponto e vírgula ou quebra de linha.">
                        <Textarea
                          value={formState.allowedPairs}
                          onChange={(event) => setFormState((current) => ({ ...current, allowedPairs: event.target.value }))}
                          disabled={formState.useGlobalAllowedPairs}
                          className="min-h-[160px]"
                          placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
                        />
                      </SectionField>

                      <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Pares efetivos agora</p>
                        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
                          {botDetail.effectiveAllowedPairs.length ? botDetail.effectiveAllowedPairs.join(', ') : 'Nenhum par efetivo disponível.'}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField
                          label="Máx. pares por ciclo"
                          description="Em branco, o bot percorre toda a lista gerenciada."
                        >
                          <Input
                            value={formState.maxPairsToAnalyze}
                            onChange={(event) => setFormState((current) => ({ ...current, maxPairsToAnalyze: event.target.value }))}
                            placeholder="Sem limite"
                          />
                        </SectionField>
                        <SectionField
                          label="Máx. execuções por ciclo"
                          description="Quantidade máxima de oportunidades aprovadas por ciclo."
                        >
                          <Input
                            value={formState.maxExecutableOpportunitiesPerCycle}
                            onChange={(event) => setFormState((current) => ({ ...current, maxExecutableOpportunitiesPerCycle: event.target.value }))}
                            placeholder="1"
                          />
                        </SectionField>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Risco e circuit breaker</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          Limites defensivos usados antes do envio das ordens.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Stop loss (%)">
                          <Input value={formState.stopLossPercent} onChange={(event) => setFormState((current) => ({ ...current, stopLossPercent: event.target.value }))} placeholder="2" />
                        </SectionField>
                        <SectionField label="Take profit (%)">
                          <Input value={formState.takeProfitPercent} onChange={(event) => setFormState((current) => ({ ...current, takeProfitPercent: event.target.value }))} placeholder="4" />
                        </SectionField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Perda diária máxima (%)">
                          <Input value={formState.circuitBreakerDailyLossPercent} onChange={(event) => setFormState((current) => ({ ...current, circuitBreakerDailyLossPercent: event.target.value }))} placeholder="6" />
                        </SectionField>
                        <SectionField label="Cooldown do breaker (min)">
                          <Input value={formState.circuitBreakerCooldownMinutes} onChange={(event) => setFormState((current) => ({ ...current, circuitBreakerCooldownMinutes: event.target.value }))} placeholder="90" />
                        </SectionField>
                      </div>

                      <SectionField label="Máximo de perdas consecutivas">
                        <Input value={formState.maxConsecutiveLosses} onChange={(event) => setFormState((current) => ({ ...current, maxConsecutiveLosses: event.target.value }))} placeholder="3" />
                      </SectionField>
                    </div>

                    <div className="space-y-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border-color)' }}>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Sizing e portfólio</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          Exposição, ATR e correlação para controlar a distribuição de capital.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Tamanho máximo da posição">
                          <Input value={formState.maxPositionSize} onChange={(event) => setFormState((current) => ({ ...current, maxPositionSize: event.target.value }))} placeholder="0.15" />
                        </SectionField>
                        <SectionField label="Exposição máxima por moeda">
                          <Input value={formState.maxExposurePerCoin} onChange={(event) => setFormState((current) => ({ ...current, maxExposurePerCoin: event.target.value }))} placeholder="0.25" />
                        </SectionField>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Exposição máxima total">
                          <Input value={formState.maxTotalExposure} onChange={(event) => setFormState((current) => ({ ...current, maxTotalExposure: event.target.value }))} placeholder="0.7" />
                        </SectionField>
                        <SectionField label="Máximo de trades simultâneos">
                          <Input value={formState.maxConcurrentTrades} onChange={(event) => setFormState((current) => ({ ...current, maxConcurrentTrades: event.target.value }))} placeholder="4" />
                        </SectionField>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="Correlação mínima para bloqueio">
                          <Input value={formState.minCorrelationThreshold} onChange={(event) => setFormState((current) => ({ ...current, minCorrelationThreshold: event.target.value }))} placeholder="0.85" />
                        </SectionField>
                        <SectionField label="Período do ATR">
                          <Input value={formState.atrPeriod} onChange={(event) => setFormState((current) => ({ ...current, atrPeriod: event.target.value }))} placeholder="14" />
                        </SectionField>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <SectionField label="ATR alvo (%)">
                          <Input value={formState.targetAtrPercent} onChange={(event) => setFormState((current) => ({ ...current, targetAtrPercent: event.target.value }))} placeholder="1.8" />
                        </SectionField>
                        <SectionField label="Fator mínimo da posição por ATR">
                          <Input value={formState.minAtrPositionFactor} onChange={(event) => setFormState((current) => ({ ...current, minAtrPositionFactor: event.target.value }))} placeholder="0.35" />
                        </SectionField>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <Card variant="compact">
                      <CardHeader>
                        <CardTitle className="text-base">Parâmetros herdados do template</CardTitle>
                        <CardDescription>Base usada quando a instância não sobrescreve um campo.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          {JSON.stringify(botDetail.templateParameters, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>

                    <Card variant="compact">
                      <CardHeader>
                        <CardTitle className="text-base">Parâmetros efetivos da instância</CardTitle>
                        <CardDescription>Resultado final usado pelo runner neste momento.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border p-4 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          {JSON.stringify(botDetail.effectiveParameters, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <Button variant="outline" onClick={handlePauseResume} isLoading={isPausing}>
                      <Power className="h-4 w-4" />
                      {botDetail.isPaused ? 'Retomar bot' : 'Pausar bot'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => selectedBotId && void runBotCycleMutation.mutateAsync(selectedBotId)}
                      disabled={!botDetail.modelReady}
                      isLoading={isRunningCycle}
                    >
                      <Play className="h-4 w-4" />
                      Rodar ciclo
                    </Button>
                    <Button variant="primary" onClick={handleSaveBot} isLoading={isSaving}>
                      <Save className="h-4 w-4" />
                      Salvar alterações
                    </Button>
                    {botDetail.isCustom && (
                      <Button variant="danger" onClick={handleDeleteBot} isLoading={isDeleting}>
                        <Trash2 className="h-4 w-4" />
                        Excluir instância
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum bot selecionado</p>
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Escolha uma instância na lista ao lado ou crie um bot novo para começar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {botDetail && (
            <BotModelsPanel
              botName={botDetail.name}
              models={botModels?.items}
              governance={botModels?.governance}
              isLoading={isLoadingModels}
              isPromoting={isPromotingModel}
              isArchiving={isArchivingModel}
              onPromote={async (modelId) => {
                await promoteBotModelMutation.mutateAsync({
                  botId: botDetail.id,
                  modelId,
                })
              }}
              onArchive={async (modelId) => {
                await archiveBotModelMutation.mutateAsync({
                  botId: botDetail.id,
                  modelId,
                })
              }}
            />
          )}

          <BotHomologationPanel
            botName={botDetail?.name}
            report={botHomologationReport}
            isLoading={isLoadingHomologationReport}
            startDate={homologationStartDate}
            endDate={homologationEndDate}
            onStartDateChange={setHomologationStartDate}
            onEndDateChange={setHomologationEndDate}
            onExportPack={() => {
              if (!botDetail) {
                return
              }

              void exportHomologationPackMutation.mutateAsync({
                botId: botDetail.id,
                botName: botDetail.name,
                params: {
                  startDate: toIsoBoundary(homologationStartDate, 'start'),
                  endDate: toIsoBoundary(homologationEndDate, 'end'),
                },
              })
            }}
            isExportingPack={exportHomologationPackMutation.isPending}
          />

          <BotHistoryPanel history={botHistory} isLoading={isLoadingHistory} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span>WebSocket:</span>
          <Badge variant={isConnected ? 'success' : 'warning'}>{isConnected ? 'Conectado' : 'Desconectado'}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>Worker:</span>
          <Badge variant={workerStatus?.running ? 'success' : 'warning'}>
            {workerStatus?.running ? 'Executando ciclos automaticamente' : 'Sem loop automático'}
          </Badge>
        </div>
      </div>

      <CreateBotModal
        isOpen={isCreateModalOpen}
        templates={templates}
        isLoading={isLoadingTemplates}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateBot}
        isSubmitting={createBotMutation.isPending}
      />
    </div>
  )
}

export default BotsPage
