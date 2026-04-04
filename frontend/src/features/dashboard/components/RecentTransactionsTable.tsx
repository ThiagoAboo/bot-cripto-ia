import { useNavigate } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/components/ui/Table'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatCurrency, formatDate, getProfitColor, cn } from '../../../shared/utils/formatters'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { RecentTransaction } from '../types/dashboard.types'

interface RecentTransactionsTableProps {
  data?: RecentTransaction[]
  isLoading: boolean
}

export function RecentTransactionsTable({ data, isLoading }: RecentTransactionsTableProps) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Últimas Transações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Últimas Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ color: 'var(--text-secondary)' }}>Nenhuma transação recente</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <CardTitle>Últimas Transações</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/transacoes')}>
          Ver todas
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Par</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor Compra</TableHead>
              <TableHead className="text-right">Valor Venda</TableHead>
              <TableHead className="text-right">Taxa</TableHead>
              <TableHead className="text-right">Ganho</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((transaction) => {
              const isProfit = transaction.profitBrl >= 0
              return (
                <TableRow key={transaction.id}>
                  <TableCell className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(transaction.date, 'full')}
                  </TableCell>
                  <TableCell className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {transaction.pair}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium',
                        transaction.type === 'buy' ? 'bg-success/10 text-success' : 'bg-error/10 text-error',
                      )}
                    >
                      {transaction.type === 'buy' ? 'COMPRA' : 'VENDA'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(transaction.entryPrice, 'BRL')}
                  </TableCell>
                  <TableCell className="text-right" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(transaction.exitPrice, 'BRL')}
                  </TableCell>
                  <TableCell className="text-right" style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(transaction.fee, 'BRL')}
                  </TableCell>
                  <TableCell className={cn('text-right font-medium', getProfitColor(transaction.profitBrl))}>
                    <div className="flex items-center justify-end gap-1">
                      {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {formatCurrency(Math.abs(transaction.profitBrl), 'BRL')}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
