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
          benchmark: {
            strategy: 'buy_and_hold',
            baselineCapital: 10000,
            totalProfit: 1200.25,
            totalReturnPercent: 12,
            outperformanceBrl: 625.3,
            outperformancePercent: 6.25,
          },
          benchmarks: [
            {
              strategy: 'buy_and_hold',
              label: 'Buy and Hold',
              baselineCapital: 10000,
              totalProfit: 1200.25,
              totalReturnPercent: 12,
              outperformanceBrl: 625.3,
              outperformancePercent: 6.25,
            },
            {
              strategy: 'dca',
              label: 'DCA em 4 entradas',
              baselineCapital: 10000,
              totalProfit: 980.1,
              totalReturnPercent: 9.8,
              outperformanceBrl: 845.45,
              outperformancePercent: 8.45,
            },
          ],
          pairBreakdown: [
            {
              pair: 'BTC/USDT',
              totalTrades: 8,
              winRate: 62.5,
              totalProfit: 1100.4,
              averageReturnPercent: 3.25,
            },
            {
              pair: 'ETH/USDT',
              totalTrades: 6,
              winRate: 66.67,
              totalProfit: 725.15,
              averageReturnPercent: 2.9,
            },
          ],
          validation: {
            mode: 'walk_forward',
            lookaheadSafe: true,
            signalLagCandles: 1,
            folds: 3,
            trainSplitPercent: 20,
            testWindowDays: 30,
            labeling: {
              horizonCandles: 5,
              buyThresholdPercent: 0.3,
              sellThresholdPercent: -0.3,
            },
            windows: [
              {
                index: 1,
                startDate: '2026-02-01',
                endDate: '2026-02-10',
                totalTrades: 4,
                winRate: 50,
                totalProfit: 320.15,
              },
              {
                index: 2,
                startDate: '2026-02-11',
                endDate: '2026-02-20',
                totalTrades: 5,
                winRate: 60,
                totalProfit: 540.2,
              },
            ],
          },
        }}
      />,
    )

    expect(screen.getByText('Resultado do Backtesting')).toBeInTheDocument()
    expect(screen.getByText('Trades simulados')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('64,32%')).toBeInTheDocument()
    expect(screen.getByText('1.825,55')).toBeInTheDocument()
    expect(screen.getByText('-8,40%')).toBeInTheDocument()
    expect(screen.getByText('Benchmark Buy and Hold')).toBeInTheDocument()
    expect(screen.getByText('Lucro benchmark: 1.200,25')).toBeInTheDocument()
    expect(screen.getByText('Outperformance (%): 6,25%')).toBeInTheDocument()
    expect(screen.getByText('DCA em 4 entradas: 980,10 (9,80%)')).toBeInTheDocument()
    expect(screen.getByText('Validacao Walk-forward')).toBeInTheDocument()
    expect(screen.getByText('Modo: walk_forward')).toBeInTheDocument()
    expect(screen.getByText('Lookahead safe: Sim')).toBeInTheDocument()
    expect(screen.getByText('Folds: 3')).toBeInTheDocument()
    expect(screen.getByText('Janela de teste: 30 dias')).toBeInTheDocument()
    expect(screen.getByText('Janelas: 2')).toBeInTheDocument()
    expect(screen.getByText('Breakdown por par')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
