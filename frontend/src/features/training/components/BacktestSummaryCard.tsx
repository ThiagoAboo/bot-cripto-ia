import { Activity, BarChart3, DollarSign, ShieldAlert, Target, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import type { BacktestResult } from '../types/training.types'

interface BacktestSummaryCardProps {
  result: BacktestResult
}

function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    ...options,
  }).format(value)
}

const metrics = [
  {
    key: 'totalTrades',
    label: 'Trades simulados',
    icon: Activity,
    format: (result: BacktestResult) => formatNumber(result.totalTrades),
  },
  {
    key: 'winRate',
    label: 'Taxa de acerto',
    icon: Target,
    format: (result: BacktestResult) => `${formatNumber(result.winRate, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
  },
  {
    key: 'totalProfit',
    label: 'Lucro total',
    icon: DollarSign,
    format: (result: BacktestResult) => formatNumber(result.totalProfit, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    key: 'sharpeRatio',
    label: 'Sharpe Ratio',
    icon: TrendingUp,
    format: (result: BacktestResult) => formatNumber(result.sharpeRatio, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    key: 'maxDrawdown',
    label: 'Drawdown máximo',
    icon: ShieldAlert,
    format: (result: BacktestResult) => `${formatNumber(result.maxDrawdown, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
  },
  {
    key: 'profitFactor',
    label: 'Profit Factor',
    icon: BarChart3,
    format: (result: BacktestResult) => formatNumber(result.profitFactor, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
]

export function BacktestSummaryCard({ result }: BacktestSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary-500" />
          Resultado do Backtesting
        </CardTitle>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Periodo analisado: {new Date(result.testPeriod.startDate).toLocaleDateString('pt-BR')} ate {new Date(result.testPeriod.endDate).toLocaleDateString('pt-BR')}
        </p>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon

            return (
              <div
                key={metric.key}
                className="rounded-2xl border p-4"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Icon className="h-4 w-4 text-primary-500" />
                  {metric.label}
                </div>
                <p className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {metric.format(result)}
                </p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
