import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createChartMock,
  addCandlestickSeriesMock,
  setDataMock,
  fitContentMock,
  applyOptionsMock,
  removeMock,
  useCandlesMock,
  useAvailablePairsMock,
} = vi.hoisted(() => {
  const setDataMock = vi.fn()
  const fitContentMock = vi.fn()
  const applyOptionsMock = vi.fn()
  const removeMock = vi.fn()
  const addCandlestickSeriesMock = vi.fn(() => ({
    setData: setDataMock,
  }))
  const createChartMock = vi.fn(() => ({
    addCandlestickSeries: addCandlestickSeriesMock,
    timeScale: () => ({
      fitContent: fitContentMock,
    }),
    applyOptions: applyOptionsMock,
    remove: removeMock,
  }))

  return {
    createChartMock,
    addCandlestickSeriesMock,
    setDataMock,
    fitContentMock,
    applyOptionsMock,
    removeMock,
    useCandlesMock: vi.fn(),
    useAvailablePairsMock: vi.fn(),
  }
})

vi.mock('lightweight-charts', () => ({
  ColorType: {
    Solid: 'solid',
  },
  CrosshairMode: {
    Normal: 0,
  },
  createChart: createChartMock,
}))

vi.mock('../../../app/providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
  }),
}))

vi.mock('../hooks/useTransactions', () => ({
  useCandles: useCandlesMock,
  useAvailablePairs: useAvailablePairsMock,
}))

import { PairChart } from './PairChart'

describe('PairChart', () => {
  beforeEach(() => {
    createChartMock.mockClear()
    addCandlestickSeriesMock.mockClear()
    setDataMock.mockClear()
    fitContentMock.mockClear()
    applyOptionsMock.mockClear()
    removeMock.mockClear()

    useAvailablePairsMock.mockReturnValue({
      data: ['BTC/USDT', 'ETH/USDT'],
    })

    useCandlesMock.mockReturnValue({
      data: [
        {
          timestamp: '2026-04-11T12:00:00.000Z',
          open: 10,
          high: 12,
          low: 9,
          close: 11,
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('uses exchange candles and pushes transformed API data into the chart', async () => {
    const candleTimestamp = '2026-04-11T12:00:00.000Z'

    render(
      <PairChart
        selectedPair="BTC/USDT"
        onPairChange={vi.fn()}
        displayCurrency="BRL"
        exchangeRate={5}
      />,
    )

    expect(useCandlesMock).toHaveBeenCalledWith('BTC/USDT', '1h', 120)

    await waitFor(() => {
      expect(setDataMock).toHaveBeenCalled()
    })

    expect(setDataMock).toHaveBeenCalledWith([
      {
        time: Math.floor(new Date(candleTimestamp).getTime() / 1000),
        open: 50,
        high: 60,
        low: 45,
        close: 55,
      },
    ])
  })
})
