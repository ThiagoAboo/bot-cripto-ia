import { lazy, Suspense, useEffect, useState } from 'react'
import {
  useAvailableBots,
  useStrategies,
  useCreateSession,
  useUploadDataset,
  useSessions,
  useSession,
  usePauseSession,
  useResumeSession,
  useCancelSession,
  useTestSession,
  useSaveModel,
  useDownloadModel,
} from './hooks/useTraining'
import { ModelSelector } from './components/ModelSelector'
import { DatasetConfig } from './components/DatasetConfig'
import { HyperparametersForm } from './components/HyperparametersForm'
import { TrainingLogTerminal } from './components/TrainingLogTerminal'
import { BacktestSummaryCard } from './components/BacktestSummaryCard'
import { Button } from '../../shared/components/ui/Button'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { History, Brain, AlertCircle, Play, Pause, Square, Download, Save, TestTube } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWebSocket } from '../../app/providers/WebSocketProvider'
import type { TrainingConfig, Architecture, DataSource, Timeframe, TrainingSession, BacktestResult } from './types/training.types'

const MetricsChart = lazy(async () => {
  const module = await import('./components/MetricsChart')
  return { default: module.MetricsChart }
})

function MetricsChartFallback() {
  return (
    <div className="rounded-3xl border p-6" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}>
      <div className="mb-6">
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-[350px] w-full" />
    </div>
  )
}

export default function TreinamentoPage() {
  const { data: availableBots, isLoading: isLoadingBots } = useAvailableBots()
  const { data: strategies, isLoading: isLoadingStrategies } = useStrategies()
  const { data: sessions, refetch: refetchSessions } = useSessions()
  const { mutate: createSession, isPending: isCreating } = useCreateSession()
  const { mutate: uploadDataset, isPending: isUploadingDataset } = useUploadDataset()
  const { mutate: pauseSession, isPending: isPausing } = usePauseSession()
  const { mutate: resumeSession, isPending: isResuming } = useResumeSession()
  const { mutate: cancelSession, isPending: isCancelling } = useCancelSession()
  const { mutate: testSession, isPending: isTesting } = useTestSession()
  const { mutate: saveModel, isPending: isSaving } = useSaveModel()
  const { mutate: downloadModel, isPending: isDownloading } = useDownloadModel()
  const { isConnected, emit, on, off } = useWebSocket()

  const [selectedBotId, setSelectedBotId] = useState('')
  const [selectedStrategyId, setSelectedStrategyId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null)

  const [config, setConfig] = useState<Partial<TrainingConfig>>({
    architecture: 'lstm',
    modelVersion: 'v1.0.0',
    dataSource: 'exchange',
    trainingPeriod: {
      startDate: new Date(Date.now() - 90 * 24 * 3600000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    },
    includedPairs: ['BTC/USDT', 'ETH/USDT'],
    indicators: ['RSI', 'MACD'],
    timeframe: '1h',
    hyperparameters: {
      hiddenLayers: 2,
      neuronsPerLayer: [64, 32],
      dropoutRate: 0.2,
      activation: 'relu',
      batchSize: 32,
      epochs: 100,
      learningRate: 0.001,
      optimizer: 'adam',
      lossFunction: 'mse',
      validationSplit: 20,
      sequenceLength: 48,
      forecastHorizonCandles: 5,
      buyThresholdPercent: 0.3,
      sellThresholdPercent: -0.3,
      walkForwardFolds: 3,
      nEstimators: 100,
      maxDepth: 10,
      randomState: 42,
      earlyStopping: {
        enabled: true,
        patience: 10,
      },
    },
  })

  const fallbackSession = sessions?.find((item) => ['running', 'pending', 'paused'].includes(item.status)) ?? null
  const activeSessionId = selectedSessionId ?? fallbackSession?.id ?? ''
  const {
    data: activeSessionDetails,
    isLoading: isLoadingActiveSession,
    refetch: refetchActiveSession,
  } = useSession(activeSessionId)

  const activeSession = activeSessionId
    ? activeSessionDetails ?? sessions?.find((item) => item.id === activeSessionId) ?? null
    : null

  useEffect(() => {
    if (!selectedSessionId && fallbackSession) {
      setSelectedSessionId(fallbackSession.id)
      return
    }

    if (selectedSessionId && sessions && !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(fallbackSession?.id ?? null)
    }
  }, [fallbackSession, selectedSessionId, sessions])

  useEffect(() => {
    setBacktestResult(null)
  }, [activeSessionId])

  useEffect(() => {
    if (!availableBots || availableBots.length === 0) {
      return
    }

    if (!selectedBotId || !availableBots.some((bot) => bot.id === selectedBotId)) {
      setSelectedBotId(availableBots[0].id)
    }
  }, [availableBots, selectedBotId])

  useEffect(() => {
    if (!availableBots || availableBots.length === 0 || !strategies || strategies.length === 0) {
      return
    }

    const selectedBot = availableBots.find((bot) => bot.id === selectedBotId) ?? availableBots[0]
    const matchingStrategy = selectedBot.strategyId
      ? strategies.find((strategy) => strategy.id === selectedBot.strategyId)
      : strategies.find((strategy) => strategy.strategyType === selectedBot.strategyType)

    if (matchingStrategy && matchingStrategy.id !== selectedStrategyId) {
      setSelectedStrategyId(matchingStrategy.id)
    }
  }, [availableBots, selectedBotId, selectedStrategyId, strategies])

  useEffect(() => {
    if (!activeSessionId || !isConnected) {
      return
    }

    const handleTrainingStatus = (payload: { sessionId: string; status: TrainingSession['status'] }) => {
      if (payload.sessionId !== activeSessionId) {
        return
      }

      void refetchActiveSession()
      void refetchSessions()
    }

    const handleTrainingMetric = (payload: { sessionId: string }) => {
      if (payload.sessionId !== activeSessionId) {
        return
      }

      void refetchActiveSession()
    }

    const handleTrainingLog = (payload: { sessionId: string }) => {
      if (payload.sessionId !== activeSessionId) {
        return
      }

      void refetchActiveSession()
    }

    emit('subscribe:training', activeSessionId)
    on('training:status', handleTrainingStatus)
    on('training:metrics', handleTrainingMetric)
    on('training:log', handleTrainingLog)

    return () => {
      emit('unsubscribe:training', activeSessionId)
      off('training:status', handleTrainingStatus)
      off('training:metrics', handleTrainingMetric)
      off('training:log', handleTrainingLog)
    }
  }, [activeSessionId, emit, isConnected, off, on, refetchActiveSession, refetchSessions])

  const handleStartTraining = () => {
    if (!selectedBotId || !selectedStrategyId) {
      toast.error('Selecione um bot e uma estratégia')
      return
    }

    if (config.dataSource === 'upload' && !config.uploadedFileUrl) {
      toast.error('Envie um arquivo CSV antes de iniciar o treinamento')
      return
    }

    const trainingConfig: TrainingConfig = {
      botId: selectedBotId,
      strategyId: selectedStrategyId,
      architecture: config.architecture as Architecture,
      modelVersion: config.modelVersion!,
      dataSource: config.dataSource as DataSource,
      uploadedFileUrl: config.uploadedFileUrl,
      trainingPeriod: config.trainingPeriod!,
      includedPairs: config.includedPairs!,
      indicators: config.indicators!,
      timeframe: config.timeframe as Timeframe,
      hyperparameters: config.hyperparameters!,
    }

    createSession(trainingConfig, {
      onSuccess: (newSession) => {
        setSelectedSessionId(newSession.id)
        void refetchSessions()
      },
    })
  }

  const handlePause = () => activeSession && pauseSession(activeSession.id)
  const handleResume = () => activeSession && resumeSession(activeSession.id)
  const handleCancel = () => activeSession && cancelSession(activeSession.id)
  const handleTest = () => activeSession && testSession(activeSession.id, {
    onSuccess: (result) => {
      setBacktestResult(result)
    },
  })
  const handleSave = () => activeSession && saveModel(activeSession.id)
  const handleDownload = () => activeSession && downloadModel(activeSession.id)
  const handleExportLogs = () => {
    if (!activeSession || activeSession.logs.length === 0) {
      toast.error('Nenhum log disponivel para exportar')
      return
    }

    const content = activeSession.logs
      .map((log) => `[${log.timestamp}] ${log.level}${log.epoch !== undefined ? ` [Epoca ${log.epoch}]` : ''} ${log.message}`)
      .join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `training_logs_${activeSession.id}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(anchor)
  }

  const hasBlockingSession = !!activeSession && ['pending', 'running', 'paused'].includes(activeSession.status)
  const canPause = !!activeSession && ['pending', 'running'].includes(activeSession.status)
  const canResume = activeSession?.status === 'paused'
  const canCancel = !!activeSession && !['completed', 'failed', 'cancelled'].includes(activeSession.status)
  const canUseModel = activeSession?.status === 'completed'
  const isMutatingSession = isPausing || isResuming || isCancelling

  if (isLoadingBots || isLoadingStrategies) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="app-page-title text-3xl font-bold">Treinamento da IA</h1>
            <p className="app-page-subtitle mt-2">Configure e treine modelos de IA por estratégia</p>
          </div>
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Skeleton className="h-[440px]" />
          <Skeleton className="h-[440px]" />
          <Skeleton className="h-[440px]" />
          <Skeleton className="h-[440px]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="app-page-title text-3xl font-bold">Treinamento da IA</h1>
          <p className="app-page-subtitle mt-2">Configure e treine modelos de IA por estratégia</p>
        </div>

        <Button variant={showHistory ? 'primary' : 'secondary'} onClick={() => setShowHistory((value) => !value)}>
          <History className="h-4 w-4" />
          {showHistory ? 'Ocultar Histórico' : 'Ver Histórico'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ModelSelector
            botId={selectedBotId}
            strategyId={selectedStrategyId}
            architecture={config.architecture as Architecture}
            modelVersion={config.modelVersion!}
            availableBots={availableBots || []}
            availableStrategies={strategies || []}
            onBotChange={setSelectedBotId}
            onStrategyChange={setSelectedStrategyId}
            onArchitectureChange={(value) => setConfig({ ...config, architecture: value })}
            onVersionChange={(value) => setConfig({ ...config, modelVersion: value })}
          />

          <HyperparametersForm
            architecture={config.architecture as Architecture}
            hyperparameters={config.hyperparameters!}
            onChange={(value) => setConfig({ ...config, hyperparameters: value })}
          />
        </div>

        <div className="space-y-6">
          <DatasetConfig
            dataSource={config.dataSource as DataSource}
            startDate={config.trainingPeriod!.startDate}
            endDate={config.trainingPeriod!.endDate}
            includedPairs={config.includedPairs!}
            indicators={config.indicators!}
            timeframe={config.timeframe as Timeframe}
            uploadedFileUrl={config.uploadedFileUrl}
            isUploadingFile={isUploadingDataset}
            onDataSourceChange={(value) => setConfig({ ...config, dataSource: value })}
            onStartDateChange={(value) => setConfig({ ...config, trainingPeriod: { ...config.trainingPeriod!, startDate: value } })}
            onEndDateChange={(value) => setConfig({ ...config, trainingPeriod: { ...config.trainingPeriod!, endDate: value } })}
            onPairsChange={(value) => setConfig({ ...config, includedPairs: value })}
            onIndicatorsChange={(value) => setConfig({ ...config, indicators: value })}
            onTimeframeChange={(value) => setConfig({ ...config, timeframe: value })}
            onUploadFile={(file) => {
              uploadDataset(file, {
                onSuccess: (result) => {
                  setConfig((current) => ({
                    ...current,
                    uploadedFileUrl: result.url,
                  }))
                },
              })
            }}
          />
        </div>
      </div>

      <div
        className="rounded-3xl border p-4 sm:p-5"
        style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Controles de Treinamento
            </h3>
            {activeSession && (
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Sessão ativa: {activeSession.id} - Status: {activeSession.status}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleStartTraining} disabled={isCreating || hasBlockingSession} isLoading={isCreating}>
              <Play className="h-4 w-4" />
              Iniciar Treinamento
            </Button>
            <Button variant="secondary" onClick={handlePause} disabled={!canPause || isMutatingSession} isLoading={isPausing}>
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
            <Button variant="secondary" onClick={handleResume} disabled={!canResume || isMutatingSession} isLoading={isResuming}>
              <Play className="h-4 w-4" />
              Retomar
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={!canCancel || isMutatingSession} isLoading={isCancelling}>
              <Square className="h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={!canUseModel || isTesting} isLoading={isTesting}>
              <TestTube className="h-4 w-4" />
              Testar
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={!canUseModel || isSaving} isLoading={isSaving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={!activeSession?.modelUrl || isDownloading} isLoading={isDownloading}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {backtestResult && activeSession && backtestResult.sessionId === activeSession.id && (
          <BacktestSummaryCard result={backtestResult} />
        )}
        <Suspense fallback={<MetricsChartFallback />}>
          <MetricsChart
            metrics={activeSession?.metrics || []}
            isLoading={Boolean(activeSessionId) && isLoadingActiveSession}
            evaluation={activeSession?.evaluation}
          />
        </Suspense>
        <TrainingLogTerminal
          logs={activeSession?.logs || []}
          isLoading={Boolean(activeSessionId) && isLoadingActiveSession}
          onExport={handleExportLogs}
        />
      </div>

      {showHistory && sessions && sessions.length > 0 && (
        <div>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Brain className="h-5 w-5 text-primary-500" />
            Histórico de Treinamentos
          </h3>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="cursor-pointer rounded-2xl border p-4 transition-all hover:border-primary-500/40"
                style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {session.strategyName}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Início: {new Date(session.startTime).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span
                      className={
                        session.status === 'completed'
                          ? 'rounded-full bg-green-500/15 px-2 py-1 text-sm text-green-500'
                          : session.status === 'running'
                            ? 'rounded-full bg-yellow-500/15 px-2 py-1 text-sm text-yellow-500'
                            : session.status === 'paused'
                              ? 'rounded-full bg-amber-500/15 px-2 py-1 text-sm text-amber-500'
                            : session.status === 'failed'
                              ? 'rounded-full bg-red-500/15 px-2 py-1 text-sm text-red-500'
                              : 'rounded-full bg-slate-500/15 px-2 py-1 text-sm text-slate-500'
                      }
                    >
                      {session.status === 'completed'
                        ? 'Concluído'
                        : session.status === 'running'
                          ? 'Em execução'
                          : session.status === 'paused'
                            ? 'Pausado'
                          : session.status === 'failed'
                            ? 'Falhou'
                            : session.status === 'cancelled'
                              ? 'Cancelado'
                              : 'Pendente'}
                    </span>
                    {session.bestValLoss && (
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Melhor Loss: {session.bestValLoss.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!activeSession && !showHistory && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border px-4 py-6 text-sm" style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
          <AlertCircle className="h-4 w-4" />
          Nenhum treinamento em andamento. Configure os parâmetros e clique em "Iniciar Treinamento"
        </div>
      )}
    </div>
  )
}
