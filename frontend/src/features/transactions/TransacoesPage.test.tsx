import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueries,
  onMock,
  offMock,
  resetSocketListeners,
  emitSocketEvent,
  reconcileOrderMutateAsync,
  reconcileOrdersMutateAsync,
  cancelOrderMutateAsync,
  confirmMock,
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
    reconcileOrderMutateAsync: vi.fn().mockResolvedValue(undefined),
    reconcileOrdersMutateAsync: vi.fn().mockResolvedValue(undefined),
    cancelOrderMutateAsync: vi.fn().mockResolvedValue(undefined),
    confirmMock: vi.fn().mockReturnValue(true),
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
  useReconcileOrder: () => ({
    mutateAsync: reconcileOrderMutateAsync,
    isPending: false,
  }),
  useReconcileOrders: () => ({
    mutateAsync: reconcileOrdersMutateAsync,
    isPending: false,
  }),
  useCancelOrder: () => ({
    mutateAsync: cancelOrderMutateAsync,
    isPending: false,
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
  TransactionsTable: (props: any) => (
    <div>
      <button type="button" onClick={() => void props.onReconcileAll()}>
        Reconcile All
      </button>
      <button type="button" onClick={() => void props.onReconcileOrder('order-1')}>
        Reconcile One
      </button>
      <button
        type="button"
        onClick={() => void props.onCancelOrder({
          id: 'order-2',
          pair: 'BTC/USDT',
          externalOrderId: 'ext-123',
        })}
      >
        Cancel One
      </button>
      <div>TransactionsTable</div>
    </div>
  ),
}))

vi.mock('../../shared/components/ui/Skeleton', () => ({
  Skeleton: () => <div>Skeleton</div>,
}))

import TransacoesPage from './TransacoesPage'

vi.stubGlobal('confirm', confirmMock)

describe('TransacoesPage realtime updates', () => {
  beforeEach(() => {
    invalidateQueries.mockClear()
    onMock.mockClear()
    offMock.mockClear()
    resetSocketListeners()
    reconcileOrderMutateAsync.mockClear()
    reconcileOrdersMutateAsync.mockClear()
    cancelOrderMutateAsync.mockClear()
    confirmMock.mockReturnValue(true)
    confirmMock.mockClear()
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

  it('delegates reconcile and cancel actions from the table', async () => {
    render(<TransacoesPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile One' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel One' }))

    await waitFor(() => {
      expect(reconcileOrdersMutateAsync).toHaveBeenCalledTimes(1)
    })

    expect(reconcileOrderMutateAsync).toHaveBeenCalledWith('order-1')
    expect(cancelOrderMutateAsync).toHaveBeenCalledWith('order-2')
    expect(confirmMock).toHaveBeenCalled()
  })
})
