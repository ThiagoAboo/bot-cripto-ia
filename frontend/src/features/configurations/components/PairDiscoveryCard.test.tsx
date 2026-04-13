import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PairDiscoveryApplyResponse, PairDiscoveryPreview } from '../types/configurations.types'

const {
  applyMutationState,
  latestSignalsState,
  previewMutateMock,
  previewMutationState,
  refetchSignalsMock,
} = vi.hoisted(() => ({
  applyMutationState: {
    data: undefined as PairDiscoveryApplyResponse | undefined,
    isPending: false,
  },
  latestSignalsState: {
    data: [
      {
        symbol: 'BTC',
        pair: 'BTC/USDT',
        score: 84,
        mentions: 12,
        sentiment: 'bullish' as const,
        sources: ['reddit', 'rss'] as const,
        references: [],
      },
    ],
    isLoading: false,
  },
  previewMutateMock: vi.fn(),
  previewMutationState: {
    isPending: false,
  },
  refetchSignalsMock: vi.fn(async () => ({ data: [] })),
}))

const previewResult: PairDiscoveryPreview = {
  generatedAt: '2026-04-11T14:00:00.000Z',
  autoDiscoveryEnabled: true,
  reviewRequired: true,
  sourcesUsed: ['reddit'],
  signals: [],
  items: [
    {
      action: 'add',
      symbol: 'LINK',
      pair: 'LINK/USDT',
      score: 81,
      mentions: 14,
      sentiment: 'bullish',
      sources: ['reddit'],
      reason: 'Score 81 com 14 menções e suporte em reddit',
    },
  ],
  nextAllowedPairs: ['BTC/USDT', 'ETH/USDT', 'LINK/USDT'],
  managedPairs: ['LINK/USDT'],
  summary: {
    currentAllowed: 2,
    nextAllowed: 3,
    additions: 1,
    removals: 0,
  },
}

const applyMutateMock = vi.fn((payload: { force?: boolean }, options?: { onSuccess?: (result: PairDiscoveryApplyResponse) => void }) => {
  const previewClone = {
    ...previewResult,
    items: [...previewResult.items],
    managedPairs: [...previewResult.managedPairs],
    nextAllowedPairs: [...previewResult.nextAllowedPairs],
  }
  const result: PairDiscoveryApplyResponse = payload.force
    ? {
        applied: true,
        requiresConfirmation: false,
        preview: previewClone,
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
            allowedPairs: ['BTC/USDT', 'ETH/USDT', 'LINK/USDT'],
            fees: {
              useBnbForFees: true,
              discountUsdtPercent: 0.075,
              discountBnbPercent: 0.075,
              minBnbBalance: 0.01,
              reserveBnbForFeesEnabled: true,
            },
            pairDiscovery: {
              autoDiscoveryEnabled: true,
              autoAddToAllowedPairs: true,
              autoRemoveFromAllowedPairs: false,
              reviewRequired: true,
              sources: {
                reddit: true,
                rss: false,
                x: false,
                telegram: false,
              },
              minSocialScore: 70,
              minMentions: 30,
              maxPairs: 20,
              excludedAssets: ['BNB'],
              managedPairs: ['LINK/USDT'],
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
    : {
        applied: false,
        requiresConfirmation: true,
        preview: previewClone,
      }

  applyMutationState.data = result
  options?.onSuccess?.(result)
})

vi.mock('../hooks/useConfigurations', () => ({
  useLatestSocialSignals: () => ({
    data: latestSignalsState.data,
    isLoading: latestSignalsState.isLoading,
    refetch: refetchSignalsMock,
  }),
  usePairDiscoveryPreview: () => ({
    mutate: previewMutateMock,
    isPending: previewMutationState.isPending,
  }),
  usePairDiscoveryApply: () => ({
    mutate: applyMutateMock,
    isPending: applyMutationState.isPending,
    data: applyMutationState.data,
  }),
}))

import { PairDiscoveryCard } from './PairDiscoveryCard'

describe('PairDiscoveryCard', () => {
  beforeEach(() => {
    applyMutationState.data = undefined
    applyMutationState.isPending = false
    latestSignalsState.isLoading = false
    previewMutationState.isPending = false
    previewMutateMock.mockReset()
    refetchSignalsMock.mockClear()

    previewMutateMock.mockImplementation((_payload, options) => {
      options?.onSuccess?.(previewResult)
    })

    applyMutateMock.mockClear()
  })

  it('renders live social signals and applies pair discovery suggestions with confirmation', async () => {
    const onApplyResult = vi.fn()

    render(
      <PairDiscoveryCard
        data={{
          autoDiscoveryEnabled: true,
          autoAddToAllowedPairs: true,
          autoRemoveFromAllowedPairs: false,
          reviewRequired: true,
          sources: {
            reddit: true,
            rss: false,
            x: false,
            telegram: false,
          },
          minSocialScore: 70,
          minMentions: 30,
          maxPairs: 20,
          excludedAssets: ['BNB'],
          managedPairs: [],
        }}
        allowedPairs={['BTC/USDT', 'ETH/USDT']}
        fees={{
          useBnbForFees: true,
          discountUsdtPercent: 0.075,
          discountBnbPercent: 0.075,
          minBnbBalance: 0.01,
          reserveBnbForFeesEnabled: true,
        }}
        onChange={vi.fn()}
        onApplyResult={onApplyResult}
      />,
    )

    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('12 menções')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /gerar preview/i }))

    expect(previewMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedPairs: ['BTC/USDT', 'ETH/USDT'],
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )

    expect(await screen.findByText('Score 81 com 14 menções e suporte em reddit')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /aplicar sugestões/i }))
    expect(applyMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /confirmar aplicação/i }))

    expect(applyMutateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )
    expect(onApplyResult).toHaveBeenCalledWith({
      allowedPairs: ['BTC/USDT', 'ETH/USDT', 'LINK/USDT'],
      pairDiscovery: expect.objectContaining({
        managedPairs: ['LINK/USDT'],
      }),
    })
  })
})
