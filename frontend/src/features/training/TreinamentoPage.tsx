import { useEffect, useState } from 'react'
import { useStrategies, useCreateSession, useSessions, useTestSession, useSaveModel, useDownloadModel } from './hooks/useTraining'
import { ModelSelector } from './components/ModelSelector'
import { DatasetConfig } from './components/DatasetConfig'
import { HyperparametersForm } from './components/HyperparametersForm'
import { MetricsChart } from './components/MetricsChart'
import { TrainingLogTerminal } from './components/TrainingLogTerminal'
import { Button } from '../../shared/components/ui/Button'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { History, Brain, AlertCircle, Play, Pause, Square, Download, Save, TestTube } from 'lucide-react'
import toast from 'react-hot-toast'
import type { TrainingConfig, Architecture, DataSource, Timeframe, TrainingSession } from './types/training.types'

const availableBots = [
  { id: 'bot1', name: 'Scalper V2', strategy: 'scalper' },
  { id: 'bot2', name: 'Momentum Trader', strategy: 'momentum' },
  { id: 'bot3', name: 'Trend Follower', strategy: 'trend_follower' },
  { id: 'bot4', name: 'Mean Reversion', strategy: 'mean_reversion' },
  { id: 'bot5', name: 'Arbitrage Hunter', strategy: 'arbitrage' },
]

export default function TreinamentoPage() {
  const { data: strategies, isLoading: isLoadingStrategies } = useStrategies()
  const { data: sessions, refetch: refetchSessions } = useSessions()
  const { mutate: createSession, isPending: isCreating } = useCreateSession()
  const { mutate: testSession, isPending: isTesting } = useTestSession()
  const { mutate: saveModel, isPending: isSaving } = useSaveModel()
  const { mutate: downloadModel, isPending: isDownloading } = useDownloadModel()

  const [selectedBotId, setSelectedBotId] = useState('')
  const [selectedStrategyId, setSelectedStrategyId] = useState('')
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(null)
  const [showHistory, setShowHistory] = useState(false)

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
      earlyStopping: {
        enabled: true,
        patience: 10,
      },
    },
  })

  useEffect(() => {
    const runningSession = sessions?.find((item) => ['running', 'pending', 'paused'].includes(item.status))
    setActiveSession(runningSession ?? null)
  }, [sessions])

  const handleStartTraining = () => {
    if (!selectedBotId || !selectedStrategyId) {
      toast.error('Selecione um bot e uma estratégia')
      return
    }

    const trainingConfig: TrainingConfig = {
      botId: selectedBotId,
      strategyId: selectedStrategyId,
      architecture: config.architecture as Architecture,
      modelVersion: config.modelVersion!,
      dataSource: config.dataSource as DataSource,
      trainingPeriod: config.trainingPeriod!,
      includedPairs: config.includedPairs!,
      indicators: config.indicators!,
      timeframe: config.timeframe as Timeframe,
      hyperparameters: config.hyperparameters!,
    }

    createSession(trainingConfig, {
      onSuccess: (newSession) => {
        setActiveSession(newSession)
        refetchSessions()
      },
    })
  }

  const notifyNotImplemented = () => toast.info('Função em desenvolvimento')

  const handleTest = () => activeSession && testSession(activeSession.id)
  const handleSave = () => activeSession && saveModel(activeSession.id)
  const handleDownload = () => activeSession && downloadModel(activeSession.id)

  if (isLoadingStrategies) {
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
            availableBots={availableBots}
            availableStrategies={strategies || []}
            onBotChange={setSelectedBotId}
            onStrategyChange={setSelectedStrategyId}
            onArchitectureChange={(value) => setConfig({ ...config, architecture: value })}
            onVersionChange={(value) => setConfig({ ...config, modelVersion: value })}
          />

          <HyperparametersForm
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
            onDataSourceChange={(value) => setConfig({ ...config, dataSource: value })}
            onStartDateChange={(value) => setConfig({ ...config, trainingPeriod: { ...config.trainingPeriod!, startDate: value } })}
            onEndDateChange={(value) => setConfig({ ...config, trainingPeriod: { ...config.trainingPeriod!, endDate: value } })}
            onPairsChange={(value) => setConfig({ ...config, includedPairs: value })}
            onIndicatorsChange={(value) => setConfig({ ...config, indicators: value })}
            onTimeframeChange={(value) => setConfig({ ...config, timeframe: value })}
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
            <Button onClick={handleStartTraining} disabled={isCreating} isLoading={isCreating}>
              <Play className="h-4 w-4" />
              Iniciar Treinamento
            </Button>
            <Button variant="secondary" onClick={notifyNotImplemented}>
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
            <Button variant="secondary" onClick={notifyNotImplemented}>
              <Play className="h-4 w-4" />
              Retomar
            </Button>
            <Button variant="danger" onClick={notifyNotImplemented}>
              <Square className="h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={isTesting} isLoading={isTesting}>
              <TestTube className="h-4 w-4" />
              Testar
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={isSaving} isLoading={isSaving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={isDownloading} isLoading={isDownloading}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <MetricsChart metrics={activeSession?.metrics || []} isLoading={false} />
        <TrainingLogTerminal logs={activeSession?.logs || []} isLoading={false} onExport={() => {}} />
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
                onClick={() => setActiveSession(session)}
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
                            : session.status === 'failed'
                              ? 'rounded-full bg-red-500/15 px-2 py-1 text-sm text-red-500'
                              : 'rounded-full bg-slate-500/15 px-2 py-1 text-sm text-slate-500'
                      }
                    >
                      {session.status === 'completed'
                        ? 'Concluído'
                        : session.status === 'running'
                          ? 'Em execução'
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
