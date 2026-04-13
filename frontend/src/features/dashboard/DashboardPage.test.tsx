import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueries,
  onMock,
  offMock,
  resetSocketListeners,
  emitSocketEvent,
  dashboardQueryKeys,
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
    dashboardQueryKeys: {
      totalBalance: ['dashboard', 'total-balance'],
      currenciesBalance: ['dashboard', 'currencies-balance'],
      recentTransactions: ['dashboard', 'recent-transactions'],
      botsStatus: ['dashboard', 'bots-status'],
      botAnalysis: (botId: string) => ['dashboard', 'bot-analysis', botId],
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

vi.mock('./hooks/useDashboardData', () => ({
  DASHBOARD_QUERY_KEYS: dashboardQueryKeys,
  useTotalBalance: () => ({ data: { totalBrl: 1000 }, isLoading: false }),
  useCurrenciesBalance: () => ({ data: [], isLoading: false }),
  useRecentTransactions: () => ({ data: [], isLoading: false }),
  useBotsStatus: () => ({ data: [{ id: 'bot-1', name: 'Bot 1', strategy: 'momentum', status: 'online', isPaused: false }], isLoading: false }),
  useBotAnalysis: () => ({ data: undefined, isLoading: false }),
  usePauseBot: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeBot: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('./hooks/usePerformanceData', () => ({
  usePerformanceData: () => ({
    data: [],
    isLoading: false,
    selectedPeriod: '7d',
    onPeriodChange: vi.fn(),
  }),
}))

vi.mock('./components/TotalBalanceCard', () => ({
  TotalBalanceCard: () => <div>TotalBalanceCard</div>,
}))

vi.mock('./components/CurrencyBalanceCard', () => ({
  CurrencyBalanceCard: () => <div>CurrencyBalanceCard</div>,
}))

vi.mock('./components/PerformanceChart', () => ({
  PerformanceChart: () => <div>PerformanceChart</div>,
}))

vi.mock('./components/RecentTransactionsTable', () => ({
  RecentTransactionsTable: () => <div>RecentTransactionsTable</div>,
}))

vi.mock('./components/BotsStatusList', () => ({
  BotsStatusList: () => <div>BotsStatusList</div>,
}))

vi.mock('./components/BotInsightsCard', () => ({
  BotInsightsCard: () => <div>BotInsightsCard</div>,
}))

import DashboardPage from './DashboardPage'

describe('DashboardPage realtime updates', () => {
  beforeEach(() => {
    invalidateQueries.mockClear()
    onMock.mockClear()
    offMock.mockClear()
    resetSocketListeners()
  })

  it('invalidates portfolio queries when a portfolio update arrives', async () => {
    render(<DashboardPage />)

    await waitFor(() => {
    expect(onMock).toHaveBeenCalledWith('dashboard:update', expect.any(Function))
  })

  act(() => {
    emitSocketEvent('dashboard:update', { scope: 'portfolio' })
  })

  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardQueryKeys.totalBalance })
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardQueryKeys.currenciesBalance })
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardQueryKeys.recentTransactions })
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', 'performance'] })
  })

  it('invalidates only bot status when a bot update arrives', async () => {
    render(<DashboardPage />)

    await waitFor(() => {
      expect(onMock).toHaveBeenCalledWith('dashboard:update', expect.any(Function))
    })

  act(() => {
    emitSocketEvent('dashboard:update', { scope: 'bots' })
  })

  expect(invalidateQueries).toHaveBeenCalledTimes(2)
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardQueryKeys.botsStatus })
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', 'bot-analysis'] })
})
})
