import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  botDetailMock,
  botHistoryMock,
  botListMock,
  botTemplatesMock,
  createBotMutateAsync,
  deleteBotMutateAsync,
  invalidateQueries,
  pauseBotMutateAsync,
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
  },
  createBotMutateAsync: vi.fn(),
  deleteBotMutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  pauseBotMutateAsync: vi.fn(),
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
}))

import BotsPage from './BotsPage'

describe('BotsPage', () => {
  beforeEach(() => {
    createBotMutateAsync.mockReset()
    deleteBotMutateAsync.mockReset()
    invalidateQueries.mockReset()
    pauseBotMutateAsync.mockReset()
    resumeBotMutateAsync.mockReset()
    runBotCycleMutateAsync.mockReset()
    updateBotMutateAsync.mockReset()
    updateBotMutateAsync.mockResolvedValue({ id: 'bot-1' })
  })

  it('hydrates the selected bot and saves edited configuration', async () => {
    render(<BotsPage />)

    expect(await screen.findByDisplayValue('RSI Alpha')).toBeInTheDocument()
    expect(screen.getAllByText('RSI Specialist').length).toBeGreaterThan(0)

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
})
