import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useWebSocket } from '../../app/providers/WebSocketProvider'
import { CurrencySelector } from './components/CurrencySelector'
import { PairChart } from './components/PairChart'
import { AvailableBalance } from './components/AvailableBalance'
import { ManualOrderForm } from './components/ManualOrderForm'
import { TransactionFilters } from './components/TransactionFilters'
import { TransactionsTable } from './components/TransactionsTable'
import {
  TRANSACTIONS_QUERY_KEYS,
  useBalance,
  useCancelOrder,
  useExchangeRate,
  useReconcileOrder,
  useReconcileOrders,
  useTransactions,
} from './hooks/useTransactions'
import { transactionsService } from './services/transactions.service'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import { formatDate } from '../../shared/utils/formatters'
import type { OrderFilters, Transaction } from './types/transactions.types'

type PendingOrderAction = {
  orderId: string
  type: 'reconcile' | 'cancel'
} | null

export default function TransacoesPage() {
  const queryClient = useQueryClient()
  const { isConnected, on, off } = useWebSocket()
  const [displayCurrency, setDisplayCurrency] = useState('BRL')
  const [selectedPair, setSelectedPair] = useState('BTC/USDT')
  const [isExporting, setIsExporting] = useState(false)
  const [pendingOrderAction, setPendingOrderAction] = useState<PendingOrderAction>(null)
  const [filters, setFilters] = useState<OrderFilters>({
    page: 1,
    limit: 20,
  })
  const reconcileOrderMutation = useReconcileOrder()
  const reconcileOrdersMutation = useReconcileOrders()
  const cancelOrderMutation = useCancelOrder()

  const {
    data: transactionsData,
    isLoading: isLoadingTransactions,
  } = useTransactions(filters)
  const { data: balance, isLoading: isLoadingBalance } = useBalance()
  const { data: exchangeRate } = useExchangeRate('USDT', displayCurrency)

  useEffect(() => {
    setFilters((prev) => ({ ...prev, pair: selectedPair, page: 1 }))
  }, [selectedPair])

  useEffect(() => {
    if (!isConnected) {
      return
    }

    const handleOrderCreated = () => {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.transactions })
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.balance })
    }

    const handleOrderUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.transactions })
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEYS.balance })
    }

    on('order:created', handleOrderCreated)
    on('order:updated', handleOrderUpdated)

    return () => {
      off('order:created', handleOrderCreated)
      off('order:updated', handleOrderUpdated)
    }
  }, [isConnected, off, on, queryClient])

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const items = await transactionsService.exportTransactions(filters)

      if (items.length === 0) {
        toast.error('Nenhuma transação encontrada para exportação')
        return
      }

      const csvHeader = [
        'id',
        'data',
        'pair',
        'origin',
        'botName',
        'type',
        'quantity',
        'price',
        'total',
        'fee',
        'status',
        'profitBrl',
        'profitPercent',
      ]

      const escapeCsvValue = (value: string | number | null | undefined) => {
        if (value === null || value === undefined) {
          return ''
        }

        const stringValue = String(value).replace(/"/g, '""')
        return /[;"\n]/.test(stringValue) ? `"${stringValue}"` : stringValue
      }

      const csvRows = items.map((item) => [
        item.id,
        formatDate(item.date, 'full'),
        item.pair,
        item.origin,
        item.botName ?? '',
        item.type,
        item.quantity,
        item.price,
        item.total,
        item.fee,
        item.status,
        item.profitBrl ?? '',
        item.profitPercent ?? '',
      ].map(escapeCsvValue).join(';'))

      const csvContent = [csvHeader.join(';'), ...csvRows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `transacoes_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)

      toast.success(`CSV exportado com ${items.length} transações`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao exportar transações'
      toast.error(message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleReconcileOrder = async (orderId: string) => {
    setPendingOrderAction({ orderId, type: 'reconcile' })

    try {
      await reconcileOrderMutation.mutateAsync(orderId)
    } finally {
      setPendingOrderAction((current) => (
        current?.orderId === orderId && current.type === 'reconcile' ? null : current
      ))
    }
  }

  const handleCancelOrder = async (transaction: Transaction) => {
    const confirmationMessage = transaction.externalOrderId
      ? `Cancelar a ordem ${transaction.pair} na Binance e reconciliar o status local?`
      : `Cancelar a ordem ${transaction.pair}?`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    setPendingOrderAction({ orderId: transaction.id, type: 'cancel' })

    try {
      await cancelOrderMutation.mutateAsync(transaction.id)
    } finally {
      setPendingOrderAction((current) => (
        current?.orderId === transaction.id && current.type === 'cancel' ? null : current
      ))
    }
  }

  const handleReconcileAll = async () => {
    await reconcileOrdersMutation.mutateAsync()
  }

  if (!balance) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="app-page-title text-2xl font-bold">Transações</h1>
          <p className="app-page-subtitle mt-1">Histórico e execução de ordens</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-[450px]" />
            <Skeleton className="h-[400px]" />
          </div>

          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="app-page-title text-2xl font-bold">Transações</h1>
        <p className="app-page-subtitle mt-1">Histórico e execução de ordens</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CurrencySelector selectedCurrency={displayCurrency} onCurrencyChange={setDisplayCurrency} />

          <PairChart
            selectedPair={selectedPair}
            onPairChange={setSelectedPair}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />

          <div className="space-y-4">
            <TransactionFilters filters={filters} onFiltersChange={setFilters} />
            <TransactionsTable
              data={transactionsData}
              isLoading={isLoadingTransactions}
              filters={filters}
              onFiltersChange={setFilters}
              displayCurrency={displayCurrency}
              onExport={handleExport}
              isExporting={isExporting}
              onReconcileOrder={handleReconcileOrder}
              onCancelOrder={handleCancelOrder}
              onReconcileAll={handleReconcileAll}
              pendingOrderAction={pendingOrderAction}
              isReconcilingAll={reconcileOrdersMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-6">
          <AvailableBalance
            data={balance}
            isLoading={isLoadingBalance}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />

          <ManualOrderForm
            selectedPair={selectedPair}
            onPairChange={setSelectedPair}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />
        </div>
      </div>
    </div>
  )
}
