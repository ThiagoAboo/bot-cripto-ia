import { prisma } from '../config/database'
import {
  normalizeFeeSettings,
  parsePairDiscoveryConfig,
  serializePairDiscoveryConfig,
  type PairDiscoveryConfig,
} from './configuration.service'
import { generatePairDiscoveryPreview, type PairDiscoveryPreview } from './pair-discovery.service'
import { logger } from '../utils/logger'

interface ConfigurationSnapshot {
  id: string
  userId: string
  allowedPairs: string
  useBnbForFees: boolean
  discountUsdtPercent: number
  discountBnbPercent: number
  minBnbBalance: number
  reserveBnbForFeesEnabled: boolean
  pairDiscovery: string
}

export interface PairDiscoveryRunResult {
  userId: string
  applied: boolean
  previewRequired: boolean
  preview: PairDiscoveryPreview
  status: NonNullable<PairDiscoveryConfig['lastSyncStatus']>
  summary: string
}

let runnerTimer: NodeJS.Timeout | null = null
let runnerActive = false
let cycleInFlight = false
let lastCycleAt: string | null = null

function parseAllowedPairs(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

function buildSummary(preview: PairDiscoveryPreview): string {
  if (preview.summary.additions === 0 && preview.summary.removals === 0) {
    return 'Nenhuma alteração sugerida'
  }

  return `${preview.summary.additions} adições e ${preview.summary.removals} remoções sugeridas`
}

function isSyncDue(pairDiscovery: PairDiscoveryConfig): boolean {
  if (!pairDiscovery.lastSyncAt) {
    return true
  }

  const lastSyncTimestamp = new Date(pairDiscovery.lastSyncAt).getTime()
  if (Number.isNaN(lastSyncTimestamp)) {
    return true
  }

  return (Date.now() - lastSyncTimestamp) >= (pairDiscovery.autoSyncIntervalMinutes * 60 * 1000)
}

async function updateConfigurationSyncState(
  configuration: ConfigurationSnapshot,
  pairDiscovery: PairDiscoveryConfig,
  data: {
    allowedPairs?: string[]
    managedPairs?: string[]
    status: NonNullable<PairDiscoveryConfig['lastSyncStatus']>
    summary: string
    applied: boolean
  },
) {
  const timestamp = new Date().toISOString()
  const nextPairDiscovery = {
    ...pairDiscovery,
    managedPairs: data.managedPairs ?? pairDiscovery.managedPairs,
    lastSyncAt: timestamp,
    lastAppliedAt: data.applied ? timestamp : pairDiscovery.lastAppliedAt,
    lastSyncStatus: data.status,
    lastSyncSummary: data.summary,
  }

  await prisma.configuration.update({
    where: { id: configuration.id },
    data: {
      allowedPairs: data.allowedPairs ? JSON.stringify(data.allowedPairs) : configuration.allowedPairs,
      pairDiscovery: serializePairDiscoveryConfig(nextPairDiscovery),
      updatedAt: new Date(),
    },
  })
}

async function executePairDiscovery(configuration: ConfigurationSnapshot): Promise<PairDiscoveryRunResult> {
  const pairDiscovery = parsePairDiscoveryConfig(configuration.pairDiscovery)
  const fees = normalizeFeeSettings({
    useBnbForFees: configuration.useBnbForFees,
    discountUsdtPercent: configuration.discountUsdtPercent,
    discountBnbPercent: configuration.discountBnbPercent,
    minBnbBalance: configuration.minBnbBalance,
    reserveBnbForFeesEnabled: configuration.reserveBnbForFeesEnabled,
  })
  const preview = await generatePairDiscoveryPreview({
    userId: configuration.userId,
    allowedPairs: parseAllowedPairs(configuration.allowedPairs),
    fees,
    pairDiscovery,
  })
  const summary = buildSummary(preview)

  if (preview.reviewRequired) {
    await updateConfigurationSyncState(configuration, pairDiscovery, {
      status: preview.items.length > 0 ? 'previewed' : 'skipped',
      summary: preview.items.length > 0 ? `${summary}. Revisão manual necessária` : summary,
      applied: false,
    })

    return {
      userId: configuration.userId,
      applied: false,
      previewRequired: true,
      preview,
      status: preview.items.length > 0 ? 'previewed' : 'skipped',
      summary: preview.items.length > 0 ? `${summary}. Revisão manual necessária` : summary,
    }
  }

  if (preview.items.length === 0) {
    await updateConfigurationSyncState(configuration, pairDiscovery, {
      status: 'skipped',
      summary,
      applied: false,
    })

    return {
      userId: configuration.userId,
      applied: false,
      previewRequired: false,
      preview,
      status: 'skipped',
      summary,
    }
  }

  await updateConfigurationSyncState(configuration, pairDiscovery, {
    allowedPairs: preview.nextAllowedPairs,
    managedPairs: preview.managedPairs,
    status: 'applied',
    summary,
    applied: true,
  })

  return {
    userId: configuration.userId,
    applied: true,
    previewRequired: false,
    preview,
    status: 'applied',
    summary,
  }
}

export async function runPairDiscoveryForUser(userId: string): Promise<PairDiscoveryRunResult> {
  const configuration = await prisma.configuration.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      allowedPairs: true,
      useBnbForFees: true,
      discountUsdtPercent: true,
      discountBnbPercent: true,
      minBnbBalance: true,
      reserveBnbForFeesEnabled: true,
      pairDiscovery: true,
    },
  })

  if (!configuration) {
    throw new Error('Configuração não encontrada para o usuário')
  }

  return executePairDiscovery(configuration)
}

export async function processPairDiscoveryQueueCycle(): Promise<void> {
  if (cycleInFlight) {
    return
  }

  cycleInFlight = true

  try {
    const configurations = await prisma.configuration.findMany({
      select: {
        id: true,
        userId: true,
        allowedPairs: true,
        useBnbForFees: true,
        discountUsdtPercent: true,
        discountBnbPercent: true,
        minBnbBalance: true,
        reserveBnbForFeesEnabled: true,
        pairDiscovery: true,
      },
    })

    for (const configuration of configurations) {
      const pairDiscovery = parsePairDiscoveryConfig(configuration.pairDiscovery)
      if (!pairDiscovery.autoDiscoveryEnabled) {
        continue
      }

      if (!isSyncDue(pairDiscovery)) {
        continue
      }

      try {
        const result = await executePairDiscovery(configuration)
        logger.info('[pair-discovery-runner] Curadoria automática executada', {
          module: 'pair-discovery-runner',
          event: 'pair_discovery_cycle_completed',
          userId: configuration.userId,
          applied: result.applied,
          previewRequired: result.previewRequired,
          additions: result.preview.summary.additions,
          removals: result.preview.summary.removals,
          status: result.status,
        })
      } catch (error) {
        const currentPairDiscovery = parsePairDiscoveryConfig(configuration.pairDiscovery)
        await updateConfigurationSyncState(configuration, currentPairDiscovery, {
          status: 'error',
          summary: error instanceof Error ? error.message : 'Falha ao executar descoberta automática',
          applied: false,
        })

        logger.error('[pair-discovery-runner] Falha ao executar curadoria automática', {
          module: 'pair-discovery-runner',
          event: 'pair_discovery_cycle_error',
          userId: configuration.userId,
          error,
        })
      }
    }

    lastCycleAt = new Date().toISOString()
  } finally {
    cycleInFlight = false
  }
}

export function startPairDiscoveryRunner(): void {
  if (runnerTimer) {
    return
  }

  const pollMs = Math.max(10000, Number(process.env.PAIR_DISCOVERY_AUTOSYNC_POLL_MS ?? 60000))
  runnerActive = true
  runnerTimer = setInterval(() => {
    void processPairDiscoveryQueueCycle()
  }, pollMs)

  void processPairDiscoveryQueueCycle()
}

export function stopPairDiscoveryRunner(): void {
  if (runnerTimer) {
    clearInterval(runnerTimer)
    runnerTimer = null
  }

  runnerActive = false
}

export function getPairDiscoveryRunnerStatus() {
  return {
    running: runnerActive,
    lastCycleAt,
  }
}
