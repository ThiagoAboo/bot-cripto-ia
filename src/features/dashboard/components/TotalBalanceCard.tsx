import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatCurrency, formatPercent, getProfitColor, cn } from '../../../shared/utils/formatters'
import { TrendingUp, TrendingDown, Target, DollarSign } from 'lucide-react'
import type { TotalBalance } from '../types/dashboard.types'

interface TotalBalanceCardProps {
  data?: TotalBalance
  isLoading: boolean
}

export function TotalBalanceCard({ data, isLoading }: TotalBalanceCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saldo Total</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saldo Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400">Dados indisponíveis</p>
        </CardContent>
      </Card>
    )
  }

  const isPositive = data.dailyProfitBrl >= 0
  const isTotalPositive = data.totalPnlBrl >= 0

  return (
    <Card className="overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-500/10 to-transparent rounded-full -mr-16 -mt-16" />
      
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Saldo Total</span>
          <DollarSign className="w-5 h-5 text-primary-500" />
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Saldo Principal */}
        <div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(data.totalBrl, 'BRL')}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            USDT/BRL: {formatCurrency(data.usdtBrlRate, 'BRL')}
          </div>
        </div>

        {/* Indicadores */}
        <div className="space-y-2 pt-2 border-t border-dark-300">
          {/* Lucro/Prejuízo do dia */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Hoje</span>
            <div className={cn("flex items-center gap-1 font-medium", getProfitColor(data.dailyProfitBrl))}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatCurrency(Math.abs(data.dailyProfitBrl), 'BRL')}</span>
              <span>({formatPercent(data.dailyProfitPercent)})</span>
            </div>
          </div>

          {/* % de Acerto */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Acerto</span>
            <div className="flex items-center gap-1">
              <Target className="w-4 h-4 text-primary-500" />
              <span className="font-medium text-white">{data.hitRate}%</span>
            </div>
          </div>

          {/* PnL Total */}
          <div className="flex justify-between items-center pt-2 border-t border-dark-300">
            <span className="text-sm text-gray-400">PnL Total</span>
            <div className={cn("flex items-center gap-1 font-semibold", getProfitColor(data.totalPnlBrl))}>
              {isTotalPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatCurrency(Math.abs(data.totalPnlBrl), 'BRL')}</span>
              <span>({formatPercent(data.totalPnlPercent)})</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}