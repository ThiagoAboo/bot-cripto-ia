import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueries,
  onMock,
  offMock,
  resetSocketListeners,
  emitSocketEvent,
  logsQueryKeys,
} = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>()

  return {
    invalidateQueries: vi.fn(),
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
    logsQueryKeys: {
      logs: ['logs'],
      traces: ['traces'],
      traceGroup: (traceId: string) => ['traces', 'group', traceId],
      bots: ['logs', 'bots'],
    },
  }
})

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
    on: onMock,
    off: offMock,
  }),
}))

vi.mock('./hooks/useLogs', () => ({
  LOGS_QUERY_KEYS: logsQueryKeys,
  useLogs: () => ({
    data: { items: [], total: 0, page: 1, limit: 50, totalPages: 0 },
    isLoading: false,
  }),
  useTraces: () => ({
    data: { items: [], total: 0, page: 1, limit: 50, totalPages: 0 },
    isLoading: false,
  }),
  useExportLogs: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useExportTraces: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useAvailableBots: () => ({
    data: [],
  }),
}))

vi.mock('./components/ModeSelector', () => ({
  ModeSelector: () => <div>ModeSelector</div>,
}))

vi.mock('./components/LogFilters', () => ({
  LogFilters: () => <div>LogFilters</div>,
}))

vi.mock('./components/LogTerminal', () => ({
  LogTerminal: () => <div>LogTerminal</div>,
}))

vi.mock('./components/TraceTerminal', () => ({
  TraceTerminal: () => <div>TraceTerminal</div>,
}))

import LogsPage from './LogsPage'

describe('LogsPage realtime updates', () => {
  beforeEach(() => {
    invalidateQueries.mockClear()
    onMock.mockClear()
    offMock.mockClear()
    resetSocketListeners()
  })

  it('shows websocket status and invalidates logs when a new log arrives', async () => {
    render(<LogsPage />)

    expect(screen.getByText('WebSocket conectado com fallback de polling')).toBeInTheDocument()

    await waitFor(() => {
      expect(onMock).toHaveBeenCalledWith('log:new', expect.any(Function))
    })

    act(() => {
      emitSocketEvent('log:new', { id: 'log-1' })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: logsQueryKeys.logs })
  })

  it('invalidates traces and the related group when a trace arrives', async () => {
    render(<LogsPage />)

    await waitFor(() => {
      expect(onMock).toHaveBeenCalledWith('trace:new', expect.any(Function))
    })

    act(() => {
      emitSocketEvent('trace:new', { traceId: 'trace-123' })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: logsQueryKeys.traces })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: logsQueryKeys.traceGroup('trace-123') })
  })
})
