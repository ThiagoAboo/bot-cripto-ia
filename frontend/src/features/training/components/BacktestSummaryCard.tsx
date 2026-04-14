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

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Benchmark Buy and Hold
            </p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p>Lucro benchmark: {formatNumber(result.benchmark.totalProfit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p>Retorno benchmark: {formatNumber(result.benchmark.totalReturnPercent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</p>
              <p>Outperformance: {formatNumber(result.benchmark.outperformanceBrl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p>Outperformance (%): {formatNumber(result.benchmark.outperformancePercent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</p>
              {result.benchmarks.slice(1).map((benchmark) => (
                <p key={benchmark.strategy}>
                  {benchmark.label}: {formatNumber(benchmark.totalProfit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({formatNumber(benchmark.totalReturnPercent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)
                </p>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Validacao Walk-forward
            </p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p>Modo: {result.validation.mode}</p>
              <p>Lookahead safe: {result.validation.lookaheadSafe ? 'Sim' : 'Nao'}</p>
              <p>Lag de sinal: {result.validation.signalLagCandles} candle</p>
              <p>Folds: {result.validation.folds}</p>
              <p>Validation split: {result.validation.trainSplitPercent}%</p>
              <p>Janela de teste: {result.validation.testWindowDays} dias</p>
              <p>Horizonte de labels: {result.validation.labeling.horizonCandles} candles</p>
              <p>Janelas: {result.validation.windows.length}</p>
            </div>
          </div>
        </div>

        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Breakdown por par
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.pairBreakdown.length > 0 ? result.pairBreakdown.slice(0, 3).map((pair) => (
              <div key={pair.pair} className="rounded-xl border p-3" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{pair.pair}</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {pair.totalTrades} trades · {formatNumber(pair.winRate, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% win rate
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Profit {formatNumber(pair.totalProfit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · retorno médio {formatNumber(pair.averageReturnPercent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </p>
              </div>
            )) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nenhum par gerou trades neste backtest.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
