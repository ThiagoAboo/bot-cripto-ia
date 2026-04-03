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

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-200 border border-dark-300 rounded-lg p-3 shadow-lg">
        <p className="text-sm text-gray-400 mb-1">{formatDate(label, 'date')}</p>
        <p className="text-lg font-bold text-white">
          {formatCurrency(payload[0].value, 'BRL')}
        </p>
      </div>
    )
  }
  return null
}

export function PerformanceChart({
  data,
  isLoading,
  selectedPeriod,
  onPeriodChange,
}: PerformanceChartProps) {
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
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-gray-400">Dados indisponíveis</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Formatar dados para o gráfico
  const chartData = data.data.map((item) => ({
    ...item,
    date: formatDate(item.timestamp, 'date'),
    balance: item.balance,
  }))

  // Valores mínimo e máximo para o eixo Y
  const minBalance = Math.min(...data.data.map((d) => d.balance))
  const maxBalance = Math.max(...data.data.map((d) => d.balance))
  const yAxisDomain = [minBalance * 0.95, maxBalance * 1.05]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle>Performance do Portfólio</CardTitle>
        
        <div className="flex gap-2">
          {/* Botões de período */}
          <div className="flex gap-1 bg-dark-300 rounded-lg p-1">
            {PERFORMANCE_PERIODS.map((period) => (
              <button
                key={period.value}
                onClick={() => onPeriodChange(period.value)}
                className={`
                  px-3 py-1 text-sm rounded-md transition-all duration-200
                  ${selectedPeriod === period.value
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-dark-400'
                  }
                `}
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* Botão toggle grid */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGrid(!showGrid)}
            className="text-gray-400"
          >
            {showGrid ? 'Ocultar Grid' : 'Mostrar Grid'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              {showGrid && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#3d3d3d"
                  horizontal={true}
                  vertical={false}
                />
              )}
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCurrency(value, 'BRL')}
                domain={yAxisDomain}
                tickMargin={10}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Gradiente de cor */}
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorBalance)"
                dot={false}
                activeDot={{ r: 6, fill: '#3b82f6' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Resumo rápido */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-dark-300">
          <div>
            <p className="text-xs text-gray-500">Início do período</p>
            <p className="text-sm font-medium text-white">
              {formatCurrency(chartData[0]?.balance || 0, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Máxima</p>
            <p className="text-sm font-medium text-success">
              {formatCurrency(maxBalance, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Mínima</p>
            <p className="text-sm font-medium text-error">
              {formatCurrency(minBalance, 'BRL')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Variação</p>
            <p className={`text-sm font-medium ${chartData[chartData.length - 1]?.balance >= chartData[0]?.balance ? 'text-success' : 'text-error'}`}>
              {formatCurrency(
                (chartData[chartData.length - 1]?.balance || 0) - (chartData[0]?.balance || 0),
                'BRL'
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}