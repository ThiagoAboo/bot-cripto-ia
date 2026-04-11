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
import { ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Bot, User } from 'lucide-react'
import { formatCurrency, formatDate, formatPercent, getProfitColor, cn } from '../../../shared/utils/formatters'
import type { TransactionsResponse, OrderFilters } from '../types/transactions.types'

interface TransactionsTableProps {
  data?: TransactionsResponse
  isLoading: boolean
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
  displayCurrency: string
  onExport: () => void
  isExporting?: boolean
}

export function TransactionsTable({
  data,
  isLoading,
  filters,
  onFiltersChange,
  displayCurrency,
  onExport,
  isExporting = false,
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
                {[...Array(8)].map((_, i) => (
                  <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onExport} isLoading={isExporting}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tx) => {
                const isProfit = (tx.profitBrl || 0) >= 0
                const convertedPrice = tx.price
                const convertedTotal = tx.total
                const convertedFee = tx.fee
                const convertedProfit = tx.profitBrl || 0
                
                return (
                  <TableRow key={tx.id} className="hover:bg-dark-300/50">
                    <TableCell className="font-mono text-sm">
                      {formatDate(tx.date, 'full')}
                    </TableCell>
                    <TableCell className="font-medium">{tx.pair}</TableCell>
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
                      {tx.quantity.toFixed(tx.pair.includes('BTC') ? 8 : 4)}
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
                      <span className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        tx.status === 'executed' ? 'bg-success/10 text-success' :
                        tx.status === 'pending' ? 'bg-warning/10 text-warning' :
                        'bg-error/10 text-error'
                      )}>
                        {tx.status === 'executed' ? 'Executada' :
                         tx.status === 'pending' ? 'Pendente' : 'Cancelada'}
                      </span>
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
