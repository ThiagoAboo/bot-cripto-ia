import { useNavigate } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/Table'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatCurrency, formatDate, getProfitColor, cn } from '../../../shared/utils/formatters'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
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
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
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
          <div className="text-center py-8">
            <p className="text-gray-400">Nenhuma transação recente</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Últimas Transações</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/transacoes')}
          className="text-primary-400 hover:text-primary-300"
        >
          Ver todas
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-dark-300">
                <TableHead className="text-gray-400">Data/Hora</TableHead>
                <TableHead className="text-gray-400">Par</TableHead>
                <TableHead className="text-gray-400">Tipo</TableHead>
                <TableHead className="text-right text-gray-400">Valor Compra</TableHead>
                <TableHead className="text-right text-gray-400">Valor Venda</TableHead>
                <TableHead className="text-right text-gray-400">Taxa</TableHead>
                <TableHead className="text-right text-gray-400">Ganho</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((transaction) => {
                const isProfit = transaction.profitBrl >= 0
                
                return (
                  <TableRow key={transaction.id} className="hover:bg-dark-300/50 border-dark-300">
                    <TableCell className="font-mono text-sm text-gray-300">
                      {formatDate(transaction.date, 'full')}
                    </TableCell>
                    <TableCell className="font-medium text-white">{transaction.pair}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          transaction.type === 'buy'
                            ? 'bg-success/10 text-success'
                            : 'bg-error/10 text-error'
                        )}
                      >
                        {transaction.type === 'buy' ? 'COMPRA' : 'VENDA'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-gray-300">
                      {formatCurrency(transaction.entryPrice, 'BRL')}
                    </TableCell>
                    <TableCell className="text-right text-gray-300">
                      {formatCurrency(transaction.exitPrice, 'BRL')}
                    </TableCell>
                    <TableCell className="text-right text-gray-400">
                      {formatCurrency(transaction.fee, 'BRL')}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", getProfitColor(transaction.profitBrl))}>
                      <div className="flex items-center justify-end gap-1">
                        {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {formatCurrency(Math.abs(transaction.profitBrl), 'BRL')}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}