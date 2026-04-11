import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueries,
  onMock,
  offMock,
  resetSocketListeners,
  emitSocketEvent,
  transactionsQueryKeys,
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
    transactionsQueryKeys: {
      transactions: ['transactions'],
      balance: ['transactions', 'balance'],
      exchangeRate: (from: string, to: string) => ['transactions', 'exchange-rate', from, to],
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

vi.mock('./hooks/useTransactions', () => ({
  TRANSACTIONS_QUERY_KEYS: transactionsQueryKeys,
  useTransactions: () => ({
    data: {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    },
    isLoading: false,
  }),
  useBalance: () => ({
    data: [{ currency: 'USDT', available: 100, reserved: 0, total: 100 }],
    isLoading: false,
  }),
  useExchangeRate: () => ({
    data: { rate: 5 },
    isLoading: false,
  }),
}))

vi.mock('./services/transactions.service', () => ({
  transactionsService: {
    exportTransactions: vi.fn(),
  },
}))

vi.mock('./components/CurrencySelector', () => ({
  CurrencySelector: () => <div>CurrencySelector</div>,
}))

vi.mock('./components/PairChart', () => ({
  PairChart: () => <div>PairChart</div>,
}))

vi.mock('./components/AvailableBalance', () => ({
  AvailableBalance: () => <div>AvailableBalance</div>,
}))

vi.mock('./components/ManualOrderForm', () => ({
  ManualOrderForm: () => <div>ManualOrderForm</div>,
}))

vi.mock('./components/TransactionFilters', () => ({
  TransactionFilters: () => <div>TransactionFilters</div>,
}))

vi.mock('./components/TransactionsTable', () => ({
  TransactionsTable: () => <div>TransactionsTable</div>,
}))

vi.mock('../../shared/components/ui/Skeleton', () => ({
  Skeleton: () => <div>Skeleton</div>,
}))

import TransacoesPage from './TransacoesPage'

describe('TransacoesPage realtime updates', () => {
  beforeEach(() => {
    invalidateQueries.mockClear()
    onMock.mockClear()
    offMock.mockClear()
    resetSocketListeners()
  })

  it('invalidates transactions and balance when a new order arrives', async () => {
    render(<TransacoesPage />)

    await waitFor(() => {
      expect(onMock).toHaveBeenCalledWith('order:created', expect.any(Function))
    })

    act(() => {
      emitSocketEvent('order:created', { id: 'order-1' })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: transactionsQueryKeys.transactions })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: transactionsQueryKeys.balance })
  })

  it('invalidates transactions and balance when an order is updated', async () => {
    render(<TransacoesPage />)

    await waitFor(() => {
      expect(onMock).toHaveBeenCalledWith('order:updated', expect.any(Function))
    })

    act(() => {
      emitSocketEvent('order:updated', { id: 'order-1', status: 'cancelled' })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: transactionsQueryKeys.transactions })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: transactionsQueryKeys.balance })
  })
})
