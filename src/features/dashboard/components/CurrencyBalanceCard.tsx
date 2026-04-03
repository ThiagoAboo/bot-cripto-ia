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
          <p className="text-gray-400 text-sm">Dados indisponíveis</p>
        </CardContent>
      </Card>
    )
  }

  const isDailyPositive = data.dailyProfitBrl >= 0
  const isTotalPositive = data.totalPnlBrl >= 0

  // Ícone da moeda
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
    <Card className="hover:border-primary-500/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{getCurrencyIcon(data.currency)}</span>
            <span>{data.currency}</span>
          </div>
          <div className={cn("text-xs px-2 py-1 rounded-full", getProfitColor(data.dailyProfitBrl), "bg-opacity-10")}>
            {isDailyPositive ? '+' : ''}{formatPercent(data.dailyProfitPercent)}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-2">
        {/* Saldo */}
        <div>
          <div className="text-xl font-bold text-white">
            {formatCurrency(data.balanceBrl, 'BRL')}
          </div>
          <div className="text-xs text-gray-500">
            USDT/BRL: {formatCurrency(data.usdtBrlRate, 'BRL')}
          </div>
        </div>

        {/* Indicadores */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Hoje</span>
            <div className={cn("flex items-center gap-1", getProfitColor(data.dailyProfitBrl))}>
              {isDailyPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{formatCurrency(Math.abs(data.dailyProfitBrl), 'BRL')}</span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Acerto</span>
            <div className="flex items-center gap-1 text-white">
              <Target className="w-3 h-3 text-primary-500" />
              <span>{data.hitRate}%</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-1 border-t border-dark-300">
            <span className="text-gray-400 text-xs">PnL Total</span>
            <div className={cn("text-xs font-medium", getProfitColor(data.totalPnlBrl))}>
              {isTotalPositive ? '+' : ''}{formatPercent(data.totalPnlPercent)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}