import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/components/ui/Tabs'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { formatNumber } from '../../../shared/utils/formatters'
import type { TrainingMetrics } from '../types/training.types'

interface MetricsChartProps {
  metrics: TrainingMetrics[]
  isLoading: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-2xl border p-3 shadow-lg"
        style={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--border-color)' }}
      >
        <p className="mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Época {label}
        </p>
        {payload.map((item: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: item.color }}>
            {item.name}: {formatNumber(item.value, 6)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function MetricsChart({ metrics, isLoading }: MetricsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Métricas de Treinamento</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Métricas de Treinamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p style={{ color: 'var(--text-secondary)' }}>Aguardando início do treinamento...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = metrics.map((item) => ({
    epoch: item.epoch,
    trainLoss: item.trainLoss,
    valLoss: item.valLoss,
    trainAccuracy: item.trainAccuracy,
    valAccuracy: item.valAccuracy,
  }))

  const hasAccuracy = metrics.some((item) => item.trainAccuracy !== undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métricas de Treinamento</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="loss" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="loss">Loss (Perda)</TabsTrigger>
            {hasAccuracy && <TabsTrigger value="accuracy">Acurácia</TabsTrigger>}
          </TabsList>

          <TabsContent value="loss">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="epoch" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                  <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="trainLoss" name="Loss (Treino)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="valLoss" name="Loss (Validação)" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {hasAccuracy && (
            <TabsContent value="accuracy">
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="epoch" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="trainAccuracy" name="Acurácia (Treino)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="valAccuracy" name="Acurácia (Validação)" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {metrics.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-center md:grid-cols-4" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Melhor Loss (Val)
              </p>
              <p className="text-sm font-medium text-success">{formatNumber(Math.min(...metrics.map((item) => item.valLoss)), 6)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Melhor Época
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {metrics.reduce((best, item) => (item.valLoss < best.valLoss ? item : best), metrics[0]).epoch}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Loss Final (Treino)
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {formatNumber(metrics[metrics.length - 1].trainLoss, 6)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Loss Final (Val)
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {formatNumber(metrics[metrics.length - 1].valLoss, 6)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
