import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatCurrency, formatPercent, getProfitColor, cn } from '../../../shared/utils/formatters'
import { TrendingUp, TrendingDown, Target } from 'lucide-react'
import type { CurrencyBalance } from '../types/dashboard.types'

interface CurrencyBalanceCardProps {
  data?: CurrencyBalance
  isLoading: boolean
}

export function CurrencyBalanceCard({ data, isLoading }: CurrencyBalanceCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-16" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">---</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Dados indisponíveis
          </p>
        </CardContent>
      </Card>
    )
  }

  const isDailyPositive = data.dailyProfitBrl >= 0
  const isTotalPositive = data.totalPnlBrl >= 0

  const getCurrencyIcon = (currency: string) => {
    const icons: Record<string, string> = {
      BTC: '₿',
      ETH: 'Ξ',
      SOL: '◎',
      ADA: '₳',
      USDT: '₮',
    }
    return icons[currency] || currency.charAt(0)
  }

  return (
    <Card variant="hover">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{getCurrencyIcon(data.currency)}</span>
            <span>{data.currency}</span>
          </div>
          <div className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getProfitColor(data.dailyProfitBrl), 'bg-primary-500/10')}>
            {isDailyPositive ? '+' : ''}
            {formatPercent(data.dailyProfitPercent)}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        <div>
          <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(data.balanceBrl, 'BRL')}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            USDT/BRL: {formatCurrency(data.usdtBrlRate, 'BRL')}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Hoje</span>
            <div className={cn('flex items-center gap-1', getProfitColor(data.dailyProfitBrl))}>
              {isDailyPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{formatCurrency(Math.abs(data.dailyProfitBrl), 'BRL')}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Acerto</span>
            <div className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              <Target className="h-3 w-3 text-primary-500" />
              <span>{data.hitRate}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-1" style={{ borderColor: 'var(--border-color)' }}>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              PnL Total
            </span>
            <div className={cn('text-xs font-medium', getProfitColor(data.totalPnlBrl))}>
              {isTotalPositive ? '+' : ''}
              {formatPercent(data.totalPnlPercent)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
