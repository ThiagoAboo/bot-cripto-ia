import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Button } from '../../../shared/components/ui/Button'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { CHART_PERIODS } from '../types/transactions.types'
import { useCandles, useAvailablePairs } from '../hooks/useTransactions'
import { cn } from '../../../shared/utils/formatters'

// @ts-ignore - lightweight-charts
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'

interface PairChartProps {
  selectedPair: string
  onPairChange: (pair: string) => void
  displayCurrency: string
  exchangeRate?: number
}

export function PairChart({ selectedPair, onPairChange }: PairChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('1h')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  
  const { data: availablePairs, isLoading: isLoadingPairs } = useAvailablePairs()
  const { data: candles, isLoading: isLoadingCandles, refetch } = useCandles(selectedPair, selectedPeriod)

  useEffect(() => {
    if (!chartContainerRef.current || !candles || candles.length === 0) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1e1e1e' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#2d2d2d' },
        horzLines: { color: '#2d2d2d' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#3d3d3d',
      },
      timeScale: {
        borderColor: '#3d3d3d',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    const chartData = candles.map((candle) => ({
      time: new Date(candle.timestamp).getTime() / 1000 as any,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))

    candlestickSeries.setData(chartData)
    chart.timeScale().fitContent()

    chartRef.current = { chart, candlestickSeries }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.chart.remove()
      }
    }
  }, [candles, selectedPair])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch, selectedPair, selectedPeriod])

  if (isLoadingPairs) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gráfico do Par</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[450px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Gráfico do Par
        </CardTitle>
        
        <div className="flex gap-2">
          <Select value={selectedPair} onValueChange={onPairChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {availablePairs?.map((pair) => (
                <SelectItem key={pair} value={pair}>
                  {pair}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_PERIODS.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={autoRefresh ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={cn('w-4 h-4', autoRefresh && 'animate-spin-slow')} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoadingCandles ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <div ref={chartContainerRef} className="w-full" style={{ height: '400px' }} />
        )}
      </CardContent>
    </Card>
  )
}