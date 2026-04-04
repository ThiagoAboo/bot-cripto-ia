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
          <p style={{ color: 'var(--text-secondary)' }}>Dados indisponíveis</p>
        </CardContent>
      </Card>
    )
  }

  const isPositive = data.dailyProfitBrl >= 0
  const isTotalPositive = data.totalPnlBrl >= 0

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rounded-full bg-gradient-to-br from-primary-500/12 to-transparent" />

      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Saldo Total</span>
          <DollarSign className="h-5 w-5 text-primary-500" />
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(data.totalBrl, 'BRL')}
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            USDT/BRL: {formatCurrency(data.usdtBrlRate, 'BRL')}
          </div>
        </div>

        <div className="space-y-2 border-t pt-2" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Hoje
            </span>
            <div className={cn('flex items-center gap-1 font-medium', getProfitColor(data.dailyProfitBrl))}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{formatCurrency(Math.abs(data.dailyProfitBrl), 'BRL')}</span>
              <span>({formatPercent(data.dailyProfitPercent)})</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Acerto
            </span>
            <div className="flex items-center gap-1">
              <Target className="h-4 w-4 text-primary-500" />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {data.hitRate}%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border-color)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              PnL Total
            </span>
            <div className={cn('flex items-center gap-1 font-semibold', getProfitColor(data.totalPnlBrl))}>
              {isTotalPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{formatCurrency(Math.abs(data.totalPnlBrl), 'BRL')}</span>
              <span>({formatPercent(data.totalPnlPercent)})</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
