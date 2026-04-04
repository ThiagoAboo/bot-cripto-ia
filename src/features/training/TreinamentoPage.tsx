import { useState, useEffect } from 'react'
import { useStrategies, useCreateSession, useSessions, useTestSession, useSaveModel, useDownloadModel } from './hooks/useTraining'
import { ModelSelector } from './components/ModelSelector'
import { DatasetConfig } from './components/DatasetConfig'
import { HyperparametersForm } from './components/HyperparametersForm'
import { TrainingControls } from './components/TrainingControls'
import { MetricsChart } from './components/MetricsChart'
import { TrainingLogTerminal } from './components/TrainingLogTerminal'
import { Button } from '../../shared/components/ui/Button'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { History, Brain, AlertCircle, Play, Pause, Square, Download, Save, TestTube } from 'lucide-react'
import toast from 'react-hot-toast'
import type { TrainingConfig, Architecture, DataSource, Timeframe, TrainingSession } from './types/training.types'

// Mock de bots disponíveis
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
    const runningSession = sessions?.find(s => s.status === 'running' || s.status === 'pending' || s.status === 'paused')
    if (runningSession) {
      setActiveSession(runningSession)
    } else {
      setActiveSession(null)
    }
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

  const handlePause = () => {
    if (activeSession) {
      // TODO: Implement pause
      toast.info('Função em desenvolvimento')
    }
  }

  const handleResume = () => {
    if (activeSession) {
      // TODO: Implement resume
      toast.info('Função em desenvolvimento')
    }
  }

  const handleCancel = () => {
    if (activeSession) {
      // TODO: Implement cancel
      toast.info('Função em desenvolvimento')
    }
  }

  const handleTest = () => {
    if (activeSession) {
      testSession(activeSession.id)
    }
  }

  const handleSave = () => {
    if (activeSession) {
      saveModel(activeSession.id)
    }
  }

  const handleDownload = () => {
    if (activeSession) {
      downloadModel(activeSession.id)
    }
  }

  if (isLoadingStrategies) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Treinamento da IA</h1>
            <p className="text-gray-400 mt-1">Configure e treine modelos de IA por estratégia</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Treinamento da IA</h1>
          <p className="text-gray-400 mt-1">Configure e treine modelos de IA por estratégia</p>
        </div>
        
        <Button
          variant={showHistory ? 'primary' : 'secondary'}
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="w-4 h-4 mr-2" />
          {showHistory ? 'Ocultar Histórico' : 'Ver Histórico'}
        </Button>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1 */}
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

        {/* Coluna 2 */}
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

      {/* Controles de Execução */}
      <div className="bg-dark-200 rounded-lg p-4 border border-dark-300">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-white">Controles de Treinamento</h3>
            {activeSession && (
              <p className="text-sm text-gray-400 mt-1">
                Sessão ativa: {activeSession.id} - Status: {activeSession.status}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleStartTraining} disabled={isCreating}>
              <Play className="w-4 h-4 mr-2" />
              Iniciar Treinamento
            </Button>
            <Button variant="secondary" onClick={handlePause}>
              <Pause className="w-4 h-4 mr-2" />
              Pausar
            </Button>
            <Button variant="secondary" onClick={handleResume}>
              <Play className="w-4 h-4 mr-2" />
              Retomar
            </Button>
            <Button variant="danger" onClick={handleCancel}>
              <Square className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={isTesting}>
              <TestTube className="w-4 h-4 mr-2" />
              Testar
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={isDownloading}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>
      </div>

      {/* Métricas e Logs */}
      <div className="grid grid-cols-1 gap-6">
        <MetricsChart metrics={activeSession?.metrics || []} isLoading={false} />
        <TrainingLogTerminal
          logs={activeSession?.logs || []}
          isLoading={false}
          onExport={() => {}}
        />
      </div>

      {/* Histórico de Treinamentos */}
      {showHistory && sessions && sessions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary-500" />
            Histórico de Treinamentos
          </h3>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 rounded-lg bg-dark-200 border border-dark-300 hover:border-primary-500/50 transition-colors cursor-pointer"
                onClick={() => setActiveSession(session)}
              >
                <div>
                  <p className="font-medium text-white">{session.strategyName}</p>
                  <p className="text-sm text-gray-400">
                    Início: {new Date(session.startTime).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    session.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                    session.status === 'running' ? 'bg-yellow-500/20 text-yellow-500' :
                    session.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {session.status === 'completed' ? 'Concluído' :
                     session.status === 'running' ? 'Em execução' :
                     session.status === 'failed' ? 'Falhou' :
                     session.status === 'cancelled' ? 'Cancelado' :
                     'Pendente'}
                  </span>
                  {session.bestValLoss && (
                    <p className="text-sm text-gray-400 mt-1">
                      Melhor Loss: {session.bestValLoss.toFixed(6)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso */}
      {!activeSession && !showHistory && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-8">
          <AlertCircle className="w-4 h-4" />
          Nenhum treinamento em andamento. Configure os parâmetros e clique em "Iniciar Treinamento"
        </div>
      )}
    </div>
  )
}