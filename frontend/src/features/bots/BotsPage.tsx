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
  useBotHistory,
  useBotTemplates,
  useBots,
  useBotWorkerStatus,
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
  BotListItem,
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
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{bot.currentPair ?? 'Sem par ativo'}</span>
                      <span>{typeof bot.confidence === 'number' ? `${Math.round(bot.confidence)}%` : 'Sem confiança'}</span>
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
          <Tabs defaultValue="transactions">
            <TabsList>
              <TabsTrigger value="transactions">Transações</TabsTrigger>
              <TabsTrigger value="traces">Decisões</TabsTrigger>
              <TabsTrigger value="training">Treinos</TabsTrigger>
            </TabsList>

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
                            Ainda não há decisões rastreadas para este bot.
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
        )}
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

  useEffect(() => {
    if (!isOpen || selectedTemplateId || !templates?.length) return
    setSelectedTemplateId(templates[0].id)
    setName(templates[0].name)
    setDescription(templates[0].description)
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
    onClose()
  }

  const handleSubmit = async () => {
    if (!selectedTemplateId || !name.trim()) {
      toast.error('Escolha um template e informe um nome para o bot')
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
                    setName(template.name)
                    setDescription(template.description)
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
            <SectionField label="Modo">
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

  const { data: bots, isLoading: isLoadingBots } = useBots()
  const { data: templates, isLoading: isLoadingTemplates } = useBotTemplates()
  const { data: workerStatus } = useBotWorkerStatus()
  const { data: botDetail, isLoading: isLoadingDetail } = useBotDetail(selectedBotId)
  const { data: botHistory, isLoading: isLoadingHistory } = useBotHistory(selectedBotId)

  const createBotMutation = useCreateBot()
  const updateBotMutation = useUpdateBot()
  const deleteBotMutation = useDeleteBot()
  const runBotCycleMutation = useRunBotCycle()
  const pauseBotMutation = usePauseBot()
  const resumeBotMutation = useResumeBot()

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
          <Button variant="primary" onClick={() => selectedBotId && void runBotCycleMutation.mutateAsync(selectedBotId)} disabled={!selectedBotId} isLoading={isRunningCycle}>
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
                  <div className="mb-6 grid gap-4 lg:grid-cols-4">
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Template</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.template?.name ?? botDetail.strategyType}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{botDetail.template?.specialization ?? botDetail.strategyType}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Última análise</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.lastAnalysis ? formatDate(botDetail.lastAnalysis) : 'Sem análise'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{botDetail.currentPair ?? 'Sem par ativo'}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Confiança atual</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{typeof botDetail.confidence === 'number' ? `${Math.round(botDetail.confidence)}%` : 'N/A'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ação sugerida: {botDetail.recommendedAction ?? 'hold'}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Pares permitidos</p>
                      <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{botDetail.effectiveAllowedPairs.length}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>origem: {botDetail.allowedPairsSource === 'global' ? 'global' : 'instância'}</p>
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
                        <SectionField label="Modo de execução">
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
                    <Button variant="secondary" onClick={() => selectedBotId && void runBotCycleMutation.mutateAsync(selectedBotId)} isLoading={isRunningCycle}>
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
