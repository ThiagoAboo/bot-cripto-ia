import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ColorType,
  CrosshairMode,
  UTCTimestamp,
  createChart,
  type CandlestickData,
  type IChartApi,
} from 'lightweight-charts'
import { LineChart, RefreshCw } from 'lucide-react'

import { useTheme } from '../../../app/providers/ThemeProvider'

interface PairChartProps {
  selectedPair: string
  onPairChange: (pair: string) => void
  displayCurrency: string
  exchangeRate?: number
}

type Timeframe = '15m' | '1h' | '4h' | '1d'

type ChartPalette = {
  background: string
  surface: string
  surfaceAlt: string
  text: string
  muted: string
  border: string
  grid: string
  tooltip: string
}

const DEFAULT_PALETTE: Record<'light' | 'dark', ChartPalette> = {
  dark: {
    background: '#0d1a31',
    surface: '#13213d',
    surfaceAlt: '#1a2a49',
    text: '#f8fafc',
    muted: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.16)',
    grid: 'rgba(148, 163, 184, 0.12)',
    tooltip: '#0f172a',
  },
  light: {
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceAlt: '#eef2f7',
    text: '#0f172a',
    muted: '#64748b',
    border: 'rgba(15, 23, 42, 0.10)',
    grid: 'rgba(15, 23, 42, 0.08)',
    tooltip: '#ffffff',
  },
}

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT']
const TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d']

const BASE_PRICES: Record<string, number> = {
  'BTC/USDT': 62350,
  'ETH/USDT': 3450,
  'BNB/USDT': 592,
  'SOL/USDT': 145,
  'ADA/USDT': 0.58,
  'XRP/USDT': 0.62,
}

function readPalette(theme: 'light' | 'dark'): ChartPalette {
  if (typeof window === 'undefined') {
    return DEFAULT_PALETTE[theme]
  }

  const styles = getComputedStyle(document.documentElement)
  const fallback = DEFAULT_PALETTE[theme]

  const pick = (name: string, fallbackValue: string) => {
    const value = styles.getPropertyValue(name).trim()
    return value || fallbackValue
  }

  return {
    background: pick('--surface-1', fallback.background),
    surface: pick('--surface-2', fallback.surface),
    surfaceAlt: pick('--surface-3', fallback.surfaceAlt),
    text: pick('--text-primary', fallback.text),
    muted: pick('--chart-axis', fallback.muted),
    border: pick('--border-color', fallback.border),
    grid: pick('--chart-grid', fallback.grid),
    tooltip: pick('--tooltip-bg', fallback.tooltip),
  }
}

function getTimeframeStep(timeframe: Timeframe): number {
  switch (timeframe) {
    case '15m':
      return 15 * 60
    case '1h':
      return 60 * 60
    case '4h':
      return 4 * 60 * 60
    case '1d':
      return 24 * 60 * 60
    default:
      return 60 * 60
  }
}

function getBasePrice(pair: string): number {
  return BASE_PRICES[pair] ?? 100
}

function hashSeed(text: string): number {
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash) + 1
}

function createRandom(seed: number) {
  let state = seed % 2147483647

  if (state <= 0) {
    state += 2147483646
  }

  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function buildCandles(params: {
  pair: string
  timeframe: Timeframe
  displayCurrency: string
  exchangeRate?: number
  refreshTick: number
}): CandlestickData[] {
  const { pair, timeframe, displayCurrency, exchangeRate, refreshTick } = params
  const points = timeframe === '1d' ? 90 : 120
  const step = getTimeframeStep(timeframe)
  const multiplier =
    displayCurrency === 'BRL' && pair.endsWith('/USDT')
      ? exchangeRate && exchangeRate > 0
        ? exchangeRate
        : 5.85
      : 1

  const base = getBasePrice(pair) * multiplier
  const random = createRandom(hashSeed(`${pair}-${timeframe}-${displayCurrency}-${refreshTick}`))
  const now = Math.floor(Date.now() / 1000)
  const candles: CandlestickData[] = []
  let previousClose = base

  for (let index = points; index > 0; index -= 1) {
    const time = (now - index * step) as UTCTimestamp
    const drift = (random() - 0.5) * base * 0.0025
    const volatility = base * (timeframe === '1d' ? 0.018 : timeframe === '4h' ? 0.010 : 0.006)
    const open = previousClose
    const close = Math.max(0.0001, open + drift + (random() - 0.5) * volatility)
    const high = Math.max(open, close) + random() * volatility * 0.7
    const low = Math.max(0.0001, Math.min(open, close) - random() * volatility * 0.7)

    candles.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
    })

    previousClose = close
  }

  return candles
}

function formatPrice(value: number, currency: string) {
  if (currency === 'BRL') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: value >= 100 ? 2 : 4,
    }).format(value)
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value)
}

export function PairChart({
  selectedPair,
  onPairChange,
  displayCurrency,
  exchangeRate,
}: PairChartProps) {
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ReturnType<IChartApi['addCandlestickSeries']> | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [refreshTick, setRefreshTick] = useState(0)

  const palette = useMemo(() => readPalette(theme), [theme])

  const pairOptions = useMemo(() => Array.from(new Set([selectedPair, ...PAIRS])), [selectedPair])

  const candles = useMemo(
    () => buildCandles({ pair: selectedPair, timeframe, displayCurrency, exchangeRate, refreshTick }),
    [selectedPair, timeframe, displayCurrency, exchangeRate, refreshTick],
  )

  const syncChartTheme = useCallback(() => {
    const chart = chartRef.current

    if (!chart) {
      return
    }

    const nextPalette = readPalette(theme)

    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: nextPalette.surface },
        textColor: nextPalette.text,
      },
      grid: {
        vertLines: { color: nextPalette.grid },
        horzLines: { color: nextPalette.grid },
      },
      rightPriceScale: {
        borderColor: nextPalette.border,
      },
      timeScale: {
        borderColor: nextPalette.border,
        timeVisible: timeframe !== '1d',
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: nextPalette.muted,
          labelBackgroundColor: nextPalette.tooltip,
        },
        horzLine: {
          color: nextPalette.muted,
          labelBackgroundColor: nextPalette.tooltip,
        },
      },
      localization: {
        locale: displayCurrency === 'BRL' ? 'pt-BR' : 'en-US',
        priceFormatter: (price: number) => formatPrice(price, displayCurrency),
      },
    })
  }, [displayCurrency, theme, timeframe])

  useEffect(() => {
    if (!containerRef.current || chartRef.current) {
      return
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: palette.surface },
        textColor: palette.text,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: timeframe !== '1d',
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.muted,
          labelBackgroundColor: palette.tooltip,
        },
        horzLine: {
          color: palette.muted,
          labelBackgroundColor: palette.tooltip,
        },
      },
      localization: {
        locale: displayCurrency === 'BRL' ? 'pt-BR' : 'en-US',
        priceFormatter: (price: number) => formatPrice(price, displayCurrency),
      },
    })

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      priceLineVisible: false,
      lastValueVisible: true,
    })

    series.setData(candles)
    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = series

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) {
        return
      }

      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
      })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [candles, displayCurrency, palette, timeframe])

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) {
      return
    }

    seriesRef.current.setData(candles)
    chartRef.current.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    syncChartTheme()
  }, [syncChartTheme])

  return (
    <section
      className="rounded-[28px] border p-6 shadow-sm"
      style={{
        backgroundColor: 'var(--surface-1)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' }}
          >
            <LineChart size={20} />
          </span>
          <div>
            <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Gráfico do Par
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {selectedPair} • intervalo {timeframe} • exibição em {displayCurrency}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={selectedPair}
            onChange={(event) => onPairChange(event.target.value)}
            className="h-12 min-w-[160px] rounded-2xl border px-4 text-sm font-medium outline-none transition"
            style={{
              backgroundColor: 'var(--surface-2)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-color)',
            }}
          >
            {pairOptions.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>

          <select
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value as Timeframe)}
            className="h-12 min-w-[110px] rounded-2xl border px-4 text-sm font-medium outline-none transition"
            style={{
              backgroundColor: 'var(--surface-2)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-color)',
            }}
          >
            {TIMEFRAMES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setRefreshTick((current) => current + 1)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition hover:scale-[1.02]"
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderColor: '#2563eb',
            }}
            aria-label="Atualizar gráfico"
            title="Atualizar gráfico"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[24px] border p-3"
        style={{
          backgroundColor: 'var(--surface-2)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div
          ref={containerRef}
          className="h-[380px] w-full"
          style={{
            backgroundColor: palette.surface,
            borderRadius: 18,
          }}
        />
      </div>
    </section>
  )
}
