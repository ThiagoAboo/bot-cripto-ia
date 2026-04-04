import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatCurrency, formatDate } from '../../../shared/utils/formatters'
import { PERFORMANCE_PERIODS } from '../../../shared/utils/constants'
import type { PerformanceData } from '../types/dashboard.types'

interface PerformanceChartProps {
  data?: PerformanceData
  isLoading: boolean
  selectedPeriod: string
  onPeriodChange: (period: string) => void
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-2xl border p-3 shadow-lg"
        style={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-color)' }}
      >
        <p className="mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {formatDate(label, 'date')}
        </p>
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {formatCurrency(payload[0].value, 'BRL')}
        </p>
      </div>
    )
  }
  return null
}

export function PerformanceChart({ data, isLoading, selectedPeriod, onPeriodChange }: PerformanceChartProps) {
  const [showGrid, setShowGrid] = useState(true)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance do Portfólio</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data || !data.data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance do Portfólio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p style={{ color: 'var(--text-secondary)' }}>Dados indisponíveis</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.data.map((item) => ({
    ...item,
    date: formatDate(item.timestamp, 'date'),
    balance: item.balance,
  }))

  const minBalance = Math.min(...data.data.map((item) => item.balance))
  const maxBalance = Math.max(...data.data.map((item) => item.balance))
  const yAxisDomain = [minBalance * 0.95, maxBalance * 1.05]

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Performance do Portfólio</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-1 rounded-2xl border p-1"
            style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
          >
            {PERFORMANCE_PERIODS.map((period) => (
              <button
                key={period.value}
                type="button"
                onClick={() => onPeriodChange(period.value)}
                className="rounded-xl px-3 py-1 text-sm font-medium transition-all duration-200"
                style={
                  selectedPeriod === period.value
                    ? { backgroundColor: '#2563eb', color: '#ffffff' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {period.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowGrid((value) => !value)}>
            {showGrid ? 'Ocultar Grid' : 'Mostrar Grid'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              {showGrid && <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />}
              <XAxis dataKey="date" tick={{ fill: 'var(--chart-axis)' }} stroke="var(--chart-grid)" />
              <YAxis
                tickFormatter={(value) => formatCurrency(value, 'BRL')}
                domain={yAxisDomain}
                tick={{ fill: 'var(--chart-axis)' }}
                stroke="var(--chart-grid)"
                tickMargin={10}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="balance" stroke="#2563eb" fill="rgba(37, 99, 235, 0.18)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Início do período
            </p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(chartData[0]?.balance || 0, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Máxima
            </p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(maxBalance, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Mínima
            </p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(minBalance, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Variação
            </p>
            <p
              className={
                (chartData[chartData.length - 1]?.balance || 0) - (chartData[0]?.balance || 0) >= 0
                  ? 'text-sm font-medium text-success'
                  : 'text-sm font-medium text-error'
              }
            >
              {formatCurrency((chartData[chartData.length - 1]?.balance || 0) - (chartData[0]?.balance || 0), 'BRL')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
