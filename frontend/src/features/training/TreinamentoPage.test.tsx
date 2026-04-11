import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  emitMock,
  onMock,
  offMock,
  resetSocketListeners,
  emitSocketEvent,
  refetchSessions,
  refetchActiveSession,
} = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>()

  return {
    emitMock: vi.fn(),
    onMock: vi.fn((event: string, callback: (payload?: unknown) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }

      listeners.get(event)?.add(callback)
    }),
    offMock: vi.fn((event: string, callback?: (payload?: unknown) => void) => {
      if (!callback) {
        listeners.delete(event)
        return
      }

      listeners.get(event)?.delete(callback)
    }),
    resetSocketListeners: () => {
      listeners.clear()
    },
    emitSocketEvent: (event: string, payload?: unknown) => {
      listeners.get(event)?.forEach((callback) => callback(payload))
    },
    refetchSessions: vi.fn(),
    refetchActiveSession: vi.fn(),
  }
})

const activeSession = {
  id: 'session-1',
  botId: 'bot-1',
  strategyId: 'strategy-1',
  strategyName: 'Momentum Trader',
  status: 'running' as const,
  startTime: '2026-04-10T10:00:00.000Z',
  logs: [],
  metrics: [],
}

vi.mock('../../app/providers/WebSocketProvider', () => ({
  useWebSocket: () => ({
    socket: null,
    isConnected: true,
    isEnabled: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: emitMock,
    on: onMock,
    off: offMock,
  }),
}))

vi.mock('./hooks/useTraining', () => ({
  useAvailableBots: () => ({
    data: [
      {
        id: 'bot-1',
        name: 'Momentum Persistido',
        strategyType: 'momentum',
        status: 'online',
        isPaused: false,
      },
    ],
    isLoading: false,
  }),
  useStrategies: () => ({
    data: [
      {
        id: 'strategy_momentum',
        name: 'Momentum Persistido',
        strategyType: 'momentum',
        description: 'Derivada do banco',
      },
    ],
    isLoading: false,
  }),
  useCreateSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUploadDataset: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useSessions: () => ({
    data: [activeSession],
    refetch: refetchSessions,
  }),
  useSession: () => ({
    data: activeSession,
    isLoading: false,
    refetch: refetchActiveSession,
  }),
  usePauseSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useResumeSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCancelSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useTestSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useSaveModel: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDownloadModel: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('./components/ModelSelector', () => ({
  ModelSelector: ({
    availableBots,
    botId,
    strategyId,
  }: {
    availableBots: Array<{ name: string }>
    botId: string
    strategyId: string
  }) => (
    <div>
      <div>ModelSelector</div>
      <div data-testid="available-bot-name">{availableBots[0]?.name ?? 'none'}</div>
      <div data-testid="selected-bot-id">{botId || 'none'}</div>
      <div data-testid="selected-strategy-id">{strategyId || 'none'}</div>
    </div>
  ),
}))

vi.mock('./components/DatasetConfig', () => ({
  DatasetConfig: () => <div>DatasetConfig</div>,
}))

vi.mock('./components/HyperparametersForm', () => ({
  HyperparametersForm: () => <div>HyperparametersForm</div>,
}))

vi.mock('./components/MetricsChart', () => ({
  MetricsChart: () => <div>MetricsChart</div>,
}))

vi.mock('./components/TrainingLogTerminal', () => ({
  TrainingLogTerminal: () => <div>TrainingLogTerminal</div>,
}))

vi.mock('../../shared/components/ui/Skeleton', () => ({
  Skeleton: () => <div>Skeleton</div>,
}))

import TreinamentoPage from './TreinamentoPage'

describe('TreinamentoPage realtime subscription', () => {
  beforeEach(() => {
    emitMock.mockClear()
    onMock.mockClear()
    offMock.mockClear()
    refetchSessions.mockClear()
    refetchActiveSession.mockClear()
    resetSocketListeners()
  })

  it('subscribes to the active session and unsubscribes on unmount', async () => {
    const { unmount } = render(<TreinamentoPage />)

    await waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith('subscribe:training', 'session-1')
    })

    act(() => {
      emitSocketEvent('training:status', { sessionId: 'session-1', status: 'running' })
    })

    expect(refetchActiveSession).toHaveBeenCalled()
    expect(refetchSessions).toHaveBeenCalled()

    unmount()

    expect(emitMock).toHaveBeenCalledWith('unsubscribe:training', 'session-1')
  })

  it('hydrates the model selector with the persisted bot catalog', async () => {
    const { getByTestId } = render(<TreinamentoPage />)

    await waitFor(() => {
      expect(getByTestId('available-bot-name')).toHaveTextContent('Momentum Persistido')
      expect(getByTestId('selected-bot-id')).toHaveTextContent('bot-1')
      expect(getByTestId('selected-strategy-id')).toHaveTextContent('strategy_momentum')
    })
  })
})
