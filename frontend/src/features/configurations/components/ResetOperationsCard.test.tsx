import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigurationResetResult } from '../types/configurations.types'

const { mutateMock, mutationState } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  mutationState: {
    isPending: false,
  },
}))

vi.mock('../hooks/useConfigurations', () => ({
  useRunConfigurationReset: () => ({
    mutate: mutateMock,
    isPending: mutationState.isPending,
  }),
}))

import { ResetOperationsCard } from './ResetOperationsCard'

const resetResult: ConfigurationResetResult = {
  scope: 'paper',
  label: 'Limpar paper',
  summary: 'Paper restaurado com 10000 USDT.',
  executedAt: '2026-04-14T12:00:00.000Z',
  deletedRecords: {
    logs: 0,
    traces: 0,
    balances: 2,
    balanceHistory: 5,
    transactions: 12,
    trainingSessions: 0,
    botDecisions: 7,
    botsRuntimeResets: 3,
    userBots: 0,
    configurations: 0,
  },
  deletedFiles: {
    modelFiles: 0,
    uploadFiles: 0,
    checkpointFiles: 0,
  },
  preservedApiKeys: false,
  paperBalance: {
    currency: 'USDT',
    amount: 10000,
  },
  configuration: {
    exchangeApiKeys: {
      exchange: 'binance',
      apiKey: 'api-key',
      secretKey: 'secret-key',
    },
    botParameters: {
      riskManagement: {
        stopLossPercent: 5,
        takeProfitPercent: 10,
        leverage: 1,
        maxTradeAmount: 1000,
        maxTradeAmountUnit: 'USDT',
      },
      allowedPairs: ['BTC/USDT', 'ETH/USDT'],
      fees: {
        useBnbForFees: true,
        discountUsdtPercent: 0.075,
        discountBnbPercent: 0.075,
        minBnbBalance: 0.01,
        reserveBnbForFeesEnabled: true,
      },
      pairDiscovery: {
        autoDiscoveryEnabled: false,
        autoAddToAllowedPairs: false,
        autoRemoveFromAllowedPairs: false,
        reviewRequired: true,
        autoSyncIntervalMinutes: 60,
        sources: {
          reddit: true,
          rss: false,
          x: false,
          telegram: false,
        },
        minSocialScore: 65,
        minMentions: 25,
        maxPairs: 20,
        excludedAssets: ['BNB', 'USDC'],
      },
      advanced: {
        mode: 'spot',
        orderType: 'market',
        slippagePercent: 0.5,
      },
      strategies: [],
    },
  },
}

describe('ResetOperationsCard', () => {
  beforeEach(() => {
    mutationState.isPending = false
    mutateMock.mockReset()
    mutateMock.mockImplementation((_scope, options) => {
      options?.onSuccess?.(resetResult)
    })
  })

  it('confirms and executes a reset action, then renders the result summary', async () => {
    const onResetCompleted = vi.fn()

    render(<ResetOperationsCard onResetCompleted={onResetCompleted} />)

    fireEvent.click(screen.getAllByRole('button', { name: /executar/i })[0])
    expect(await screen.findByText('Esta ação não pode ser desfeita. Revise antes de continuar.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirmar limpeza/i }))

    expect(mutateMock).toHaveBeenCalledWith(
      'logs_traces',
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )

    expect(await screen.findByText('Última operação executada')).toBeInTheDocument()
    expect(screen.getByText('Paper restaurado com 10000 USDT.')).toBeInTheDocument()
    expect(screen.getByText('Histórico de saldo')).toBeInTheDocument()
    expect(onResetCompleted).toHaveBeenCalledWith(resetResult)
  })
})
