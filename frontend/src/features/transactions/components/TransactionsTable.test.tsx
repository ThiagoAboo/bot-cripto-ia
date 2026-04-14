import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TransactionsTable } from './TransactionsTable'

describe('TransactionsTable', () => {
  it('renders partial-fill metadata with requested quantity and external status', () => {
    render(
      <TransactionsTable
        data={{
          items: [
            {
              id: 'tx-partial-1',
              date: '2026-04-12T20:00:02.000Z',
              pair: 'BTC/USDT',
              origin: 'bot',
              botId: 'bot-1',
              botName: 'MACD Bot',
              type: 'buy',
              quantity: 0.4,
              requestedQuantity: 1,
              price: 127,
              total: 50.8,
              fee: 0.01,
              feeCurrency: 'USDT',
              feeRateApplied: 0.0002,
              feeDiscountSource: 'usdt',
              status: 'partially_filled',
              externalOrderId: '321',
              externalStatus: 'PARTIALLY_FILLED',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }}
        isLoading={false}
        filters={{ page: 1, limit: 20 }}
        onFiltersChange={vi.fn()}
        displayCurrency="USDT"
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByText('Parcial')).toBeInTheDocument()
    expect(screen.getByText('de 1.00000000 solicitado')).toBeInTheDocument()
    expect(screen.getByText('Binance: PARTIALLY_FILLED')).toBeInTheDocument()
  })
})
