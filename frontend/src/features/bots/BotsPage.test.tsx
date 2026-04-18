import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  botDetailMock,
  botHistoryMock,
  botListMock,
  botModelsMock,
  botTemplatesMock,
  archiveBotModelMutateAsync,
  createBotMutateAsync,
  deleteBotMutateAsync,
  invalidateQueries,
  pauseBotMutateAsync,
  promoteBotModelMutateAsync,
  resumeBotMutateAsync,
  runBotCycleMutateAsync,
  updateBotMutateAsync,
} = vi.hoisted(() => ({
  botListMock: [{
    id: 'bot-1',
    name: 'RSI Alpha',
    strategy: 'rsi',
    strategyId: 'rsi',
    templateId: 'template-rsi',
    templateName: 'RSI Specialist',
    indicatorType: 'RSI',
    specialization: 'mean_reversion',
    executionMode: 'paper',
    status: 'online',
    isPaused: false,
    confidence: 72,
    currentPair: 'BTC/USDT',
    paperReadiness: {
      readyForFullAuto: true,
      evaluatedSignals: 42,
      pendingSignals: 2,
      minimumEvaluatedSignals: 30,
      accuracyPercent: 63,
      minimumAccuracyPercent: 55,
      averageStrategyReturnPercent: 0.42,
      minimumAverageStrategyReturnPercent: 0.15,
      averageEdgePercent: 0.18,
      minimumAverageEdgePercent: 0,
      maxObservedDrawdownPercent: 4.2,
      maximumDrawdownPercent: 12,
      maxConsecutiveIncorrect: 3,
      currentConsecutiveIncorrect: 0,
      maximumConsecutiveIncorrect: 5,
      lastEvaluatedAt: '2026-04-13T16:00:00.000Z',
      blockers: [],
    },
  }],
  botTemplatesMock: [{
    id: 'template-rsi',
    slug: 'rsi-specialist',
    name: 'RSI Specialist',
    strategyType: 'rsi',
    indicatorType: 'RSI',
    specialization: 'mean_reversion',
    description: 'Template RSI',
    defaultParameters: { timeframe: '1h' },
    source: 'template',
  }],
  botModelsMock: {
    botId: 'bot-1',
    items: [
      {
        id: 'model-1',
        botId: 'bot-1',
        trainingSessionId: 'session-1',
        modelVersion: 'v1',
        modelUrl: '/models/rsi-alpha-v1.json',
        fingerprint: 'fingerprint-1',
        architecture: 'random_forest',
        validationStrategy: 'walk_forward',
        forecastHorizonCandles: 5,
        governanceRole: 'champion',
        isActive: true,
        notes: 'Modelo em produção paper.',
        promotedAt: '2026-04-13T12:00:00.000Z',
        createdAt: '2026-04-13T12:00:00.000Z',
        updatedAt: '2026-04-13T12:00:00.000Z',
        evaluation: {
          accuracyPercent: 63,
          f1Score: 0.61,
          logLoss: 0.33,
          walkForwardFolds: 5,
        },
        reproducibility: {
          configFingerprint: 'cfg-1',
          metricsFingerprint: 'met-1',
        },
      },
      {
        id: 'model-2',
        botId: 'bot-1',
        trainingSessionId: 'session-2',
        modelVersion: 'v2',
        modelUrl: '/models/rsi-alpha-v2.json',
        fingerprint: 'fingerprint-2',
        architecture: 'xgboost',
        validationStrategy: 'walk_forward',
        forecastHorizonCandles: 5,
        governanceRole: 'challenger',
        isActive: false,
        notes: 'Candidato mais recente.',
        createdAt: '2026-04-14T08:00:00.000Z',
        updatedAt: '2026-04-14T08:00:00.000Z',
        evaluation: {
          accuracyPercent: 66,
          f1Score: 0.64,
          logLoss: 0.29,
          walkForwardFolds: 5,
        },
        reproducibility: {
          configFingerprint: 'cfg-2',
          metricsFingerprint: 'met-2',
        },
      },
    ],
  },
  botDetailMock: {
    id: 'bot-1',
    name: 'RSI Alpha',
    strategyType: 'rsi',
    strategyId: 'rsi',
    templateId: 'template-rsi',
    executionMode: 'paper',
    isSystemManaged: false,
    isCustom: true,
    status: 'online',
    isPaused: false,
    currentPair: 'BTC/USDT',
    recommendedAction: 'buy',
    confidence: 72,
    description: 'Instância de teste',
    modelVersion: 'v1',
    modelUrl: '/models/rsi-alpha.json',
    hasModel: true,
    modelReady: true,
    modelArchitecture: 'random_forest',
    validationStrategy: 'walk_forward',
    forecastHorizonCandles: 5,
    operationalBlockReason: undefined,
    paperReadiness: {
      readyForFullAuto: true,
      evaluatedSignals: 42,
      pendingSignals: 2,
      minimumEvaluatedSignals: 30,
      accuracyPercent: 63,
      minimumAccuracyPercent: 55,
      averageStrategyReturnPercent: 0.42,
      minimumAverageStrategyReturnPercent: 0.15,
      averageEdgePercent: 0.18,
      minimumAverageEdgePercent: 0,
      maxObservedDrawdownPercent: 4.2,
      maximumDrawdownPercent: 12,
      maxConsecutiveIncorrect: 3,
      currentConsecutiveIncorrect: 0,
      maximumConsecutiveIncorrect: 5,
      lastEvaluatedAt: '2026-04-13T16:00:00.000Z',
      blockers: [],
    },
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T11:00:00.000Z',
    template: {
      id: 'template-rsi',
      slug: 'rsi-specialist',
      name: 'RSI Specialist',
      strategyType: 'rsi',
      indicatorType: 'RSI',
      specialization: 'mean_reversion',
      description: 'Template RSI',
    },
    templateParameters: { timeframe: '1h', minConfidence: 60 },
    instanceParameters: { allowedPairs: ['BTC/USDT', 'ETH/USDT'] },
    effectiveParameters: {
      timeframe: '1h',
      minConfidence: 60,
      allowedPairs: ['BTC/USDT', 'ETH/USDT'],
      stopLossPercent: 2,
    },
    effectiveAllowedPairs: ['BTC/USDT', 'ETH/USDT'],
    allowedPairsSource: 'instance',
  },
  botHistoryMock: {
    botId: 'bot-1',
    transactions: [],
    traces: [],
    trainingSessions: [],
    decisions: [],
    decisionSummary: {
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
    },
    paperReadiness: {
      readyForFullAuto: true,
      evaluatedSignals: 42,
      pendingSignals: 2,
      minimumEvaluatedSignals: 30,
      accuracyPercent: 63,
      minimumAccuracyPercent: 55,
      averageStrategyReturnPercent: 0.42,
      minimumAverageStrategyReturnPercent: 0.15,
      averageEdgePercent: 0.18,
      minimumAverageEdgePercent: 0,
      maxObservedDrawdownPercent: 4.2,
      maximumDrawdownPercent: 12,
      maxConsecutiveIncorrect: 3,
      currentConsecutiveIncorrect: 0,
      maximumConsecutiveIncorrect: 5,
      lastEvaluatedAt: '2026-04-13T16:00:00.000Z',
      blockers: [],
    },
  },
  archiveBotModelMutateAsync: vi.fn(),
  createBotMutateAsync: vi.fn(),
  deleteBotMutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  pauseBotMutateAsync: vi.fn(),
  promoteBotModelMutateAsync: vi.fn(),
  resumeBotMutateAsync: vi.fn(),
  runBotCycleMutateAsync: vi.fn(),
  updateBotMutateAsync: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
    }),
  }
})

vi.mock('../../app/providers/WebSocketProvider', () => ({
  useWebSocket: () => ({
    socket: null,
    isConnected: true,
    isEnabled: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./hooks/useBots', () => ({
  BOTS_QUERY_KEYS: {
    list: ['bots', 'list'],
    detail: (botId: string) => ['bots', 'detail', botId],
    history: (botId: string) => ['bots', 'history', botId],
    models: (botId: string) => ['bots', 'models', botId],
    templates: ['bots', 'templates'],
    workerStatus: ['bots', 'worker-status'],
  },
  useBots: () => ({
    data: botListMock,
    isLoading: false,
  }),
  useBotTemplates: () => ({
    data: botTemplatesMock,
    isLoading: false,
  }),
  useBotWorkerStatus: () => ({
    data: { running: true },
  }),
  useBotDetail: () => ({
    data: botDetailMock,
    isLoading: false,
  }),
  useBotHistory: () => ({
    data: botHistoryMock,
    isLoading: false,
  }),
  useBotModels: () => ({
    data: botModelsMock,
    isLoading: false,
  }),
  useCreateBot: () => ({
    mutateAsync: createBotMutateAsync,
    isPending: false,
  }),
  useUpdateBot: () => ({
    mutateAsync: updateBotMutateAsync,
    isPending: false,
  }),
  useDeleteBot: () => ({
    mutateAsync: deleteBotMutateAsync,
    isPending: false,
  }),
  useRunBotCycle: () => ({
    mutateAsync: runBotCycleMutateAsync,
    isPending: false,
  }),
  usePauseBot: () => ({
    mutateAsync: pauseBotMutateAsync,
    isPending: false,
  }),
  useResumeBot: () => ({
    mutateAsync: resumeBotMutateAsync,
    isPending: false,
  }),
  usePromoteBotModel: () => ({
    mutateAsync: promoteBotModelMutateAsync,
    isPending: false,
  }),
  useArchiveBotModel: () => ({
    mutateAsync: archiveBotModelMutateAsync,
    isPending: false,
  }),
}))

import BotsPage from './BotsPage'

describe('BotsPage', () => {
  beforeEach(() => {
    archiveBotModelMutateAsync.mockReset()
    createBotMutateAsync.mockReset()
    deleteBotMutateAsync.mockReset()
    invalidateQueries.mockReset()
    pauseBotMutateAsync.mockReset()
    promoteBotModelMutateAsync.mockReset()
    resumeBotMutateAsync.mockReset()
    runBotCycleMutateAsync.mockReset()
    updateBotMutateAsync.mockReset()
    archiveBotModelMutateAsync.mockResolvedValue({ id: 'model-2' })
    promoteBotModelMutateAsync.mockResolvedValue({ id: 'model-2' })
    updateBotMutateAsync.mockResolvedValue({ id: 'bot-1' })
  })

  it('hydrates the selected bot and saves edited configuration', async () => {
    render(<BotsPage />)

    expect(await screen.findByDisplayValue('RSI Alpha')).toBeInTheDocument()
    expect(screen.getAllByText('RSI Specialist').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pronto para full_auto').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByDisplayValue('RSI Alpha'), {
      target: { value: 'RSI Alpha Custom' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(updateBotMutateAsync).toHaveBeenCalledWith({
        botId: 'bot-1',
        payload: expect.objectContaining({
          name: 'RSI Alpha Custom',
          executionMode: 'paper',
          status: 'online',
          parameters: expect.objectContaining({
            timeframe: '1h',
            minConfidence: 60,
            allowedPairs: ['BTC/USDT', 'ETH/USDT'],
            stopLossPercent: 2,
          }),
        }),
      })
    })
  })

  it('renders model governance and triggers promote/archive actions', async () => {
    render(<BotsPage />)

    expect(await screen.findByText('Governança de Modelos')).toBeInTheDocument()
    expect(screen.getAllByText('Champion').length).toBeGreaterThan(0)
    expect(screen.getByText('Challenger')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Promover' }))

    await waitFor(() => {
      expect(promoteBotModelMutateAsync).toHaveBeenCalledWith({
        botId: 'bot-1',
        modelId: 'model-2',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }))

    await waitFor(() => {
      expect(archiveBotModelMutateAsync).toHaveBeenCalledWith({
        botId: 'bot-1',
        modelId: 'model-2',
      })
    })
  })
})
