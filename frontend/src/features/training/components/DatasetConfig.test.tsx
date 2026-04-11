import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatasetConfig } from './DatasetConfig'

vi.mock('../hooks/useTraining', () => ({
  useAvailablePairs: () => ({
    data: ['BTC/USDT'],
    isLoading: false,
  }),
}))

describe('DatasetConfig', () => {
  it('forwards the selected CSV file when upload is active', () => {
    const onUploadFile = vi.fn()

    render(
      <DatasetConfig
        dataSource="upload"
        startDate="2026-01-01"
        endDate="2026-03-01"
        includedPairs={['BTC/USDT']}
        indicators={['RSI']}
        timeframe="1h"
        uploadedFileUrl="/uploads/dataset_20260411_150000_market.csv"
        onDataSourceChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        onPairsChange={vi.fn()}
        onIndicatorsChange={vi.fn()}
        onTimeframeChange={vi.fn()}
        onUploadFile={onUploadFile}
      />,
    )

    const file = new File(
      ['timestamp,open,high,low,close,volume\n2026-01-01T00:00:00Z,1,2,0.5,1.5,1000'],
      'dataset.csv',
      { type: 'text/csv' },
    )

    fireEvent.change(screen.getByLabelText('Upload do dataset CSV'), {
      target: {
        files: [file],
      },
    })

    expect(onUploadFile).toHaveBeenCalledWith(file)
    expect(screen.getByText('Arquivo atual: dataset_20260411_150000_market.csv')).toBeInTheDocument()
  })
})
