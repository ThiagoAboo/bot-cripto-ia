import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/Table'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { Button } from '../../../shared/components/ui/Button'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  TrendingUp,
  TrendingDown,
  Bot,
  User,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { formatCurrency, formatDate, formatPercent, getProfitColor, cn } from '../../../shared/utils/formatters'
import type { OrderFilters, OrderStatus, Transaction, TransactionsResponse } from '../types/transactions.types'

interface TransactionsTableProps {
  data?: TransactionsResponse
  isLoading: boolean
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
  displayCurrency: string
  onExport: () => void
  isExporting?: boolean
  onReconcileOrder: (orderId: string) => Promise<void>
  onCancelOrder: (transaction: Transaction) => Promise<void>
  onReconcileAll: () => Promise<void>
  pendingOrderAction?: {
    orderId: string
    type: 'reconcile' | 'cancel'
  } | null
  isReconcilingAll?: boolean
}

const STATUS_STYLES: Record<OrderStatus, { label: string; className: string }> = {
  executed: { label: 'Executada', className: 'bg-success/10 text-success' },
  pending: { label: 'Pendente', className: 'bg-warning/10 text-warning' },
  partially_filled: { label: 'Parcial', className: 'bg-primary-600/10 text-primary-400' },
  cancelled: { label: 'Cancelada', className: 'bg-error/10 text-error' },
  rejected: { label: 'Rejeitada', className: 'bg-error/10 text-error' },
}

function getQuantityPrecision(pair: string): number {
  return pair.includes('BTC') ? 8 : 4
}

function hasRequestedQuantity(transaction: Transaction): boolean {
  return typeof transaction.requestedQuantity === 'number'
    && transaction.requestedQuantity > transaction.quantity + 1e-8
}

function isOpenOrder(transaction: Transaction): boolean {
  return transaction.status === 'pending' || transaction.status === 'partially_filled'
}

function canReconcileOrder(transaction: Transaction): boolean {
  return isOpenOrder(transaction) && Boolean(transaction.externalOrderId)
}

function canCancelOrder(transaction: Transaction): boolean {
  return isOpenOrder(transaction)
}

export function TransactionsTable({
  data,
  isLoading,
  filters,
  onFiltersChange,
  displayCurrency,
  onExport,
  isExporting = false,
  onReconcileOrder,
  onCancelOrder,
  onReconcileAll,
  pendingOrderAction = null,
  isReconcilingAll = false,
}: TransactionsTableProps) {
  const totalPages = data ? Math.ceil(data.total / filters.limit) : 0

  const handlePageChange = (newPage: number) => {
    onFiltersChange({ ...filters, page: newPage })
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dark-300 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {[...Array(11)].map((_, i) => (
                  <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(11)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-lg border border-dark-300 p-8 text-center">
        <p className="text-gray-400">Nenhuma transação encontrada</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-dark-300 bg-dark-300/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">Ordens pendentes e reconciliação</p>
          <p className="text-xs text-gray-500">
            Atualize os status da Binance antes de analisar fills parciais, cancelamentos e saldo reservado.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => void onReconcileAll()} isLoading={isReconcilingAll}>
            <RefreshCw className="h-4 w-4" />
            Reconciliar pendentes
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} isLoading={isExporting}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-dark-300 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-dark-300">
                <TableHead>Data/Hora</TableHead>
                <TableHead>Par</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Ganho</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tx) => {
                const isProfit = (tx.profitBrl || 0) >= 0
                const convertedPrice = tx.price
                const convertedTotal = tx.total
                const convertedFee = tx.fee
                const convertedProfit = tx.profitBrl || 0
                const quantityPrecision = getQuantityPrecision(tx.pair)
                const statusStyle = STATUS_STYLES[tx.status]
                const isReconcilingOrder = pendingOrderAction?.orderId === tx.id
                  && pendingOrderAction.type === 'reconcile'
                const isCancellingOrder = pendingOrderAction?.orderId === tx.id
                  && pendingOrderAction.type === 'cancel'
                
                return (
                  <TableRow key={tx.id} className="hover:bg-dark-300/50">
                    <TableCell className="font-mono text-sm">
                      {formatDate(tx.date, 'full')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{tx.pair}</span>
                        {tx.externalOrderId && (
                          <span className="text-[11px] text-gray-500">
                            Ordem externa #{tx.externalOrderId}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {tx.origin === 'bot' ? (
                          <>
                            <Bot className="w-3 h-3 text-primary-500" />
                            <span className="text-xs">{tx.botName || 'Bot'}</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-gray-500" />
                            <span className="text-xs">Manual</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        tx.type === 'buy' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      )}>
                        {tx.type === 'buy' ? 'COMPRA' : 'VENDA'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex flex-col items-end">
                        <span>{tx.quantity.toFixed(quantityPrecision)}</span>
                        {hasRequestedQuantity(tx) && (
                          <span className="text-xs text-gray-500">
                            de {tx.requestedQuantity?.toFixed(quantityPrecision)} solicitado
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(convertedPrice, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(convertedTotal, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right text-gray-400">
                      {formatCurrency(convertedFee, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusStyle.className)}>
                          {statusStyle.label}
                        </span>
                        {tx.externalStatus && (
                          <span className="text-[11px] uppercase tracking-wide text-gray-500">
                            Binance: {tx.externalStatus}
                          </span>
                        )}
                        {tx.syncedAt && (
                          <span className="text-[11px] text-gray-500">
                            Sync: {formatDate(tx.syncedAt, 'full')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", getProfitColor(convertedProfit))}>
                      {tx.status === 'executed' && (
                        <div className="flex items-center justify-end gap-1">
                          {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {formatCurrency(Math.abs(convertedProfit), displayCurrency)}
                          {tx.profitPercent && (
                            <span className="text-xs">
                              ({isProfit ? '+' : ''}{formatPercent(tx.profitPercent)})
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canReconcileOrder(tx) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onReconcileOrder(tx.id)}
                            isLoading={isReconcilingOrder}
                            disabled={Boolean(pendingOrderAction) && !isReconcilingOrder}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Reconciliar
                          </Button>
                        )}
                        {canCancelOrder(tx) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-error hover:bg-error/10 hover:text-error"
                            onClick={() => void onCancelOrder(tx)}
                            isLoading={isCancellingOrder}
                            disabled={Boolean(pendingOrderAction) && !isCancellingOrder}
                          >
                            <XCircle className="h-4 w-4" />
                            Cancelar
                          </Button>
                        )}
                        {!canReconcileOrder(tx) && !canCancelOrder(tx) && (
                          <span className="text-xs text-gray-500">Sem ações</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            Mostrando {((filters.page - 1) * filters.limit) + 1} - {Math.min(filters.page * filters.limit, data.total)} de {data.total} resultados
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={filters.page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1 text-sm bg-dark-300 rounded-lg">
              {filters.page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={filters.page === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
