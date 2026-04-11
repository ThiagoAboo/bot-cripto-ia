import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BacktestSummaryCard } from './BacktestSummaryCard'

describe('BacktestSummaryCard', () => {
  it('renders the main backtest metrics', () => {
    render(
      <BacktestSummaryCard
        result={{
          sessionId: 'session-1',
          testPeriod: {
            startDate: '2026-02-01T00:00:00.000Z',
            endDate: '2026-03-03T00:00:00.000Z',
          },
          totalTrades: 14,
          winRate: 64.32,
          totalProfit: 1825.55,
          sharpeRatio: 1.76,
          maxDrawdown: -8.4,
          profitFactor: 2.11,
        }}
      />,
    )

    expect(screen.getByText('Resultado do Backtesting')).toBeInTheDocument()
    expect(screen.getByText('Trades simulados')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('64,32%')).toBeInTheDocument()
    expect(screen.getByText('1.825,55')).toBeInTheDocument()
    expect(screen.getByText('-8,40%')).toBeInTheDocument()
  })
})
