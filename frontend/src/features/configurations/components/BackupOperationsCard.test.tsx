import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ConfigurationBackupRestoreResult,
  ConfigurationBackupSnapshot,
} from '../types/configurations.types'

const {
  exportMutateMock,
  exportMutationState,
  restoreMutateMock,
  restoreMutationState,
} = vi.hoisted(() => ({
  exportMutateMock: vi.fn(),
  exportMutationState: {
    isPending: false,
  },
  restoreMutateMock: vi.fn(),
  restoreMutationState: {
    isPending: false,
  },
}))

vi.mock('../hooks/useConfigurations', () => ({
  useExportConfigurationBackup: () => ({
    mutate: exportMutateMock,
    isPending: exportMutationState.isPending,
  }),
  useRestoreConfigurationBackup: () => ({
    mutate: restoreMutateMock,
    isPending: restoreMutationState.isPending,
  }),
}))

import { BackupOperationsCard } from './BackupOperationsCard'

const snapshot: ConfigurationBackupSnapshot = {
  snapshotType: 'bot-crypto-ia-user-backup',
  formatVersion: 1,
  exportedAt: '2026-04-15T10:20:00.000Z',
  userProfile: {
    sourceUserId: 'user-old-1',
    name: 'Administrador',
    preferences: '{}',
    lastLogin: null,
  },
  summary: {
    recordCounts: {
      balances: 2,
      transactions: 5,
    },
    fileCounts: {
      modelFiles: 1,
      uploadFiles: 1,
      checkpointFiles: 1,
    },
  },
}

const restoreResult: ConfigurationBackupRestoreResult = {
  restoredAt: '2026-04-15T11:00:00.000Z',
  summary: 'Backup restaurado com sucesso.',
  restoredRecords: {
    balances: 2,
    transactions: 5,
  },
  restoredFiles: {
    modelFiles: 1,
    uploadFiles: 1,
    checkpointFiles: 1,
  },
  preservedApiKeys: true,
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
      allowedPairs: ['BTC/USDT'],
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
        autoSyncIntervalMinutes: 30,
        sources: {
          reddit: true,
          rss: true,
          x: false,
          telegram: false,
        },
        minSocialScore: 70,
        minMentions: 30,
        maxPairs: 20,
        excludedAssets: [],
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

describe('BackupOperationsCard', () => {
  beforeEach(() => {
    exportMutateMock.mockReset()
    restoreMutateMock.mockReset()
    exportMutationState.isPending = false
    restoreMutationState.isPending = false

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    exportMutateMock.mockImplementation((_payload, options) => {
      options?.onSuccess?.(snapshot)
    })

    restoreMutateMock.mockImplementation((_payload, options) => {
      options?.onSuccess?.(restoreResult)
    })
  })

  it('exports the snapshot and restores it from a selected file', async () => {
    const onRestoreCompleted = vi.fn()

    render(<BackupOperationsCard onRestoreCompleted={onRestoreCompleted} />)

    fireEvent.click(screen.getByRole('button', { name: /exportar backup/i }))

    expect(exportMutateMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )
    expect(screen.getByText('Último snapshot')).toBeInTheDocument()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([JSON.stringify(snapshot)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(snapshot)),
    })
    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /restaurar backup/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar restauração/i }))

    await waitFor(() => {
      expect(restoreMutateMock).toHaveBeenCalledWith(
        {
          snapshot,
          preserveCurrentApiKeys: true,
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
        }),
      )
    })
    expect(onRestoreCompleted).toHaveBeenCalledWith(restoreResult)
    expect(await screen.findByText('Última restauração')).toBeInTheDocument()
  })
})
