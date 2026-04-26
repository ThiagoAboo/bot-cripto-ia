import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  botDetailMock,
  botHistoryMock,
  botHomologationReportMock,
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
        decisionSummary: {
          total: 42,
          pending: 2,
          evaluated: 40,
          correct: 25,
          accuracyPercent: 62.5,
          averageConfidence: 71,
          averageMarketReturnPercent: 0.18,
          averageStrategyReturnPercent: 0.31,
          bestEdgePercent: 1.8,
          worstEdgePercent: -0.9,
        },
        paperReadiness: {
          readyForFullAuto: true,
          evaluatedSignals: 40,
          pendingSignals: 2,
          minimumEvaluatedSignals: 30,
          accuracyPercent: 62.5,
          minimumAccuracyPercent: 55,
          averageStrategyReturnPercent: 0.31,
          minimumAverageStrategyReturnPercent: 0.15,
          averageEdgePercent: 0.09,
          minimumAverageEdgePercent: 0,
          maxObservedDrawdownPercent: 4.8,
          maximumDrawdownPercent: 12,
          maxConsecutiveIncorrect: 3,
          currentConsecutiveIncorrect: 0,
          maximumConsecutiveIncorrect: 5,
          blockers: [],
        },
        operationalReadiness: {
          hasModel: true,
          modelReady: true,
          hasEnginePackage: true,
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
        decisionSummary: {
          total: 44,
          pending: 1,
          evaluated: 43,
          correct: 29,
          accuracyPercent: 67.44,
          averageConfidence: 74,
          averageMarketReturnPercent: 0.2,
          averageStrategyReturnPercent: 0.41,
          bestEdgePercent: 2.1,
          worstEdgePercent: -0.6,
        },
        paperReadiness: {
          readyForFullAuto: true,
          evaluatedSignals: 43,
          pendingSignals: 1,
          minimumEvaluatedSignals: 30,
          accuracyPercent: 67.44,
          minimumAccuracyPercent: 55,
          averageStrategyReturnPercent: 0.41,
          minimumAverageStrategyReturnPercent: 0.15,
          averageEdgePercent: 0.16,
          minimumAverageEdgePercent: 0,
          maxObservedDrawdownPercent: 5.1,
          maximumDrawdownPercent: 12,
          maxConsecutiveIncorrect: 3,
          currentConsecutiveIncorrect: 0,
          maximumConsecutiveIncorrect: 5,
          blockers: [],
        },
        operationalReadiness: {
          hasModel: true,
          modelReady: true,
          hasEnginePackage: true,
        },
      },
    ],
    governance: {
      evaluatedAt: '2026-04-14T09:00:00.000Z',
      championArtifactId: 'model-1',
      championModelVersion: 'v1',
      championModelUrl: '/models/rsi-alpha-v1.json',
      recommendedPromotion: {
        artifactId: 'model-2',
        modelVersion: 'v2',
        modelUrl: '/models/rsi-alpha-v2.json',
        reason: 'accuracy +4.94 pp · retorno medio +0.1000% · edge medio +0.0700% · drawdown delta 0.30 pp',
        accuracyGainPercent: 4.94,
        averageStrategyReturnGainPercent: 0.1,
        averageEdgeGainPercent: 0.07,
        challengerAccuracyPercent: 67.44,
        championAccuracyPercent: 62.5,
        challengerAverageStrategyReturnPercent: 0.41,
        championAverageStrategyReturnPercent: 0.31,
        challengerAverageEdgePercent: 0.16,
        championAverageEdgePercent: 0.09,
      },
      fullAutoEligibility: {
        eligible: true,
        blockers: [],
        championArtifactId: 'model-1',
        championModelVersion: 'v1',
        championModelUrl: '/models/rsi-alpha-v1.json',
        botModelSynchronized: true,
      },
      policy: {
        modelDecisionWindow: 60,
        minimumAccuracyGainPercent: 1,
        minimumAverageStrategyReturnGainPercent: 0.05,
        minimumAverageEdgeGainPercent: 0,
        maximumDrawdownDeltaPercent: 2,
        autoPromotionEnabled: false,
      },
    },
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
  botHomologationReportMock: {
    botId: 'bot-1',
    generatedAt: '2026-04-14T12:00:00.000Z',
    period: {
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-14T23:59:59.999Z',
      days: 14,
    },
    verdict: {
      status: 'attention',
      approvedForFullAuto: false,
      summary: 'O bot esta em acompanhamento antes da liberacao operacional.',
      blockers: ['Aguardar mais evidencias em paper.'],
    },
    decisionSummary: {
      total: 12,
      pending: 2,
      evaluated: 10,
      correct: 7,
      accuracyPercent: 70,
      averageConfidence: 73,
      averageMarketReturnPercent: 0.21,
      averageStrategyReturnPercent: 0.35,
      bestEdgePercent: 1.4,
      worstEdgePercent: -0.6,
    },
    paperReadiness: {
      readyForFullAuto: false,
      evaluatedSignals: 10,
      pendingSignals: 2,
      minimumEvaluatedSignals: 30,
      accuracyPercent: 70,
      minimumAccuracyPercent: 55,
      averageStrategyReturnPercent: 0.35,
      minimumAverageStrategyReturnPercent: 0.15,
      averageEdgePercent: 0.08,
      minimumAverageEdgePercent: 0,
      maxObservedDrawdownPercent: 5.3,
      maximumDrawdownPercent: 12,
      maxConsecutiveIncorrect: 2,
      currentConsecutiveIncorrect: 0,
      maximumConsecutiveIncorrect: 5,
      lastEvaluatedAt: '2026-04-14T12:00:00.000Z',
      blockers: ['Ainda nao atingiu a amostra minima para full_auto.'],
    },
    fullAutoEligibility: {
      eligible: false,
      blockers: ['Champion ainda em validacao.'],
      championArtifactId: 'model-1',
      championModelVersion: 'v1',
      championModelUrl: '/models/rsi-alpha-v1.json',
      botModelSynchronized: true,
    },
    executionSummary: {
      totalTransactions: 4,
      executedTransactions: 3,
      submittedTransactions: 1,
      profitableSells: 2,
      losingSells: 1,
      averageProfitPercent: 0.42,
      totalProfitBrl: 185.5,
      averageSlippagePercent: 0.12,
      averageSimulatedLatencyMs: 380,
      averageSimulatedFillPercent: 0.94,
      executionStatusBreakdown: {
        executed: 3,
        submitted: 1,
      },
      executionModeBreakdown: {
        paper: 4,
      },
    },
    operationalSummary: {
      totalTraces: 16,
      errorTraces: 1,
      snapshotCoveragePercent: 75,
      averageTraceDurationMs: 124.3,
      slowestFunctions: [
        {
          functionName: 'applyBotRuntimeCycleResult',
          module: 'bot',
          count: 4,
          averageDurationMs: 180.2,
          maxDurationMs: 320.1,
          errorCount: 1,
        },
      ],
      stageBreakdown: [
        {
          stage: 'runtime_plan_received',
          count: 4,
          errorCount: 0,
          averageDurationMs: 110.4,
        },
      ],
    },
    pairBreakdown: [
      {
        pair: 'BTC/USDT',
        decisions: 8,
        evaluatedDecisions: 6,
        executedTransactions: 2,
        errorTraces: 1,
        accuracyPercent: 66.67,
        averageStrategyReturnPercent: 0.31,
        averageEdgePercent: 0.09,
        profitBrl: 124.3,
      },
    ],
    findings: [
      {
        severity: 'warning',
        title: 'Amostra insuficiente',
        detail: 'O bot ainda precisa acumular mais sinais avaliados em paper.',
      },
    ],
    recentIncidents: [
      {
        id: 'trace-incident-1',
        timestamp: '2026-04-14T12:00:00.000Z',
        level: 'WARN',
        module: 'bot',
        traceId: 'trace-group-1',
        functionName: 'applyBotRuntimeCycleResult',
        message: 'Execucao adiada por ordem ainda aberta na corretora',
        stage: 'execution_blocked_open_order',
        durationMs: 245,
        currentPair: 'BTC/USDT',
        recommendedAction: 'buy',
        confidence: 73,
        errorFlag: true,
        snapshot: {
          blockingOrder: {
            pair: 'BTC/USDT',
            status: 'pending',
          },
        },
      },
    ],
    recentSnapshots: [
      {
        id: 'trace-snapshot-1',
        timestamp: '2026-04-14T12:00:00.000Z',
        level: 'INFO',
        module: 'bot',
        traceId: 'trace-group-2',
        functionName: 'applyBotRuntimeCycleResult',
        message: 'Plano do runtime Python recebido para aplicacao',
        stage: 'runtime_plan_received',
        durationMs: 140,
        currentPair: 'BTC/USDT',
        recommendedAction: 'buy',
        confidence: 74,
        errorFlag: false,
        snapshot: {
          selectedPlan: {
            status: 'suggested',
            pair: 'BTC/USDT',
            action: 'buy',
          },
        },
      },
    ],
    balanceTimeline: [
      {
        timestamp: '2026-04-14T12:00:00.000Z',
        totalBrl: 10250.45,
      },
    ],
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
    homologationReport: (botId: string) => ['bots', 'homologation-report', botId],
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
  useBotHomologationReport: () => ({
    data: botHomologationReportMock,
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
    expect(screen.getByText('Homologação Assistida')).toBeInTheDocument()
    expect(screen.getByText('Achados da homologação')).toBeInTheDocument()

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
    expect(screen.getByText('Promoção recomendada')).toBeInTheDocument()
    expect(screen.getByText('full_auto elegível')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Promover' }))

    await waitFor(() => {
      expect(promoteBotModelMutateAsync).toHaveBeenCalledWith({
        botId: 'bot-1',
        modelId: 'model-2',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Promover recomendado' }))

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
