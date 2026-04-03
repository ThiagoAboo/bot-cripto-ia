import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
  } from 'recharts'
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
        <div className="bg-dark-200 border border-dark-300 rounded-lg p-3 shadow-lg">
          <p className="text-sm text-gray-400 mb-1">Época {label}</p>
          {payload.map((p: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: p.color }}>
              {p.name}: {formatNumber(p.value, 6)}
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
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-gray-400">Aguardando início do treinamento...</p>
            </div>
          </CardContent>
        </Card>
      )
    }
  
    const chartData = metrics.map((m) => ({
      epoch: m.epoch,
      trainLoss: m.trainLoss,
      valLoss: m.valLoss,
      trainAccuracy: m.trainAccuracy,
      valAccuracy: m.valAccuracy,
    }))
  
    const hasAccuracy = metrics.some((m) => m.trainAccuracy !== undefined)
  
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#3d3d3d" />
                    <XAxis dataKey="epoch" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="trainLoss"
                      name="Loss (Treino)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="valLoss"
                      name="Loss (Validação)"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
  
            {hasAccuracy && (
              <TabsContent value="accuracy">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3d3d3d" />
                      <XAxis dataKey="epoch" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                      <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="trainAccuracy"
                        name="Acurácia (Treino)"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="valAccuracy"
                        name="Acurácia (Validação)"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            )}
          </Tabs>
  
          {/* Melhor época */}
          {metrics.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-300">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Melhor Loss (Val)</p>
                  <p className="text-sm font-medium text-success">
                    {formatNumber(Math.min(...metrics.map((m) => m.valLoss)), 6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Melhor Época</p>
                  <p className="text-sm font-medium text-white">
                    {metrics.reduce((best, m) => (m.valLoss < best.valLoss ? m : best), metrics[0]).epoch}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Loss Final (Treino)</p>
                  <p className="text-sm font-medium text-white">
                    {formatNumber(metrics[metrics.length - 1].trainLoss, 6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Loss Final (Val)</p>
                  <p className="text-sm font-medium text-white">
                    {formatNumber(metrics[metrics.length - 1].valLoss, 6)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }