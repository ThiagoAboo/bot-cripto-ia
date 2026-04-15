export interface FeeSettings {
  useBnbForFees: boolean
  discountUsdtPercent: number
  discountBnbPercent: number
  minBnbBalance: number
  reserveBnbForFeesEnabled: boolean
}

export interface PairDiscoverySources {
  reddit: boolean
  rss: boolean
  x: boolean
  telegram: boolean
}

export interface PairDiscoveryConfig {
  autoDiscoveryEnabled: boolean
  autoAddToAllowedPairs: boolean
  autoRemoveFromAllowedPairs: boolean
  reviewRequired: boolean
  autoSyncIntervalMinutes: number
  sources: PairDiscoverySources
  minSocialScore: number
  minMentions: number
  maxPairs: number
  excludedAssets: string[]
  managedPairs: string[]
  lastSyncAt?: string
  lastAppliedAt?: string
  lastSyncStatus?: 'idle' | 'previewed' | 'applied' | 'skipped' | 'error'
  lastSyncSummary?: string
}

export interface StrategyConfiguration {
  id: string
  name: string
  strategyType: string
  isActive: boolean
  parameters: Record<string, unknown>
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  useBnbForFees: true,
  discountUsdtPercent: 0.075,
  discountBnbPercent: 0.075,
  minBnbBalance: 0.01,
  reserveBnbForFeesEnabled: true,
}

export const DEFAULT_PAIR_DISCOVERY_CONFIG: PairDiscoveryConfig = {
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
  managedPairs: [],
}

export const DEFAULT_ALLOWED_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

export function buildDefaultStrategiesConfig(): StrategyConfiguration[] {
  return [
    {
      id: 'strategy_scalper',
      name: 'Scalper V2',
      strategyType: 'scalper',
      isActive: true,
      parameters: {
        timeframe: '1m',
        maxSpread: 0.1,
        minVolume: 100000,
        takeProfitTicks: 5,
        stopLossTicks: 3,
      },
    },
    {
      id: 'strategy_momentum',
      name: 'Momentum Trader',
      strategyType: 'momentum',
      isActive: true,
      parameters: {
        period: 14,
        threshold: 2.5,
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30,
      },
    },
    {
      id: 'strategy_trend',
      name: 'Trend Follower',
      strategyType: 'trend_follower',
      isActive: true,
      parameters: {
        fastEma: 20,
        slowEma: 50,
        adxPeriod: 14,
        adxThreshold: 25,
      },
    },
    {
      id: 'strategy_reversion',
      name: 'Mean Reversion',
      strategyType: 'mean_reversion',
      isActive: true,
      parameters: {
        bbPeriod: 20,
        bbStdDev: 2,
        rsiPeriod: 14,
        rsiLower: 30,
        rsiUpper: 70,
      },
    },
    {
      id: 'strategy_arbitrage',
      name: 'Arbitrage Hunter',
      strategyType: 'arbitrage',
      isActive: false,
      parameters: {
        minSpreadPercent: 0.5,
        maxLatencyMs: 100,
        minLiquidity: 50000,
      },
    },
  ]
}

export function serializeDefaultStrategies(): string {
  return JSON.stringify(buildDefaultStrategiesConfig())
}

export function buildDefaultConfigurationData(input?: {
  userId?: string
  exchange?: string
  apiKey?: string
  secretKey?: string
}) {
  return {
    ...(input?.userId ? { userId: input.userId } : {}),
    exchange: input?.exchange ?? 'binance',
    apiKey: input?.apiKey ?? '',
    secretKey: input?.secretKey ?? '',
    stopLossPercent: 5.0,
    takeProfitPercent: 10.0,
    leverage: 1,
    maxTradeAmount: 1000,
    maxTradeAmountUnit: 'USDT',
    allowedPairs: JSON.stringify(DEFAULT_ALLOWED_PAIRS),
    useBnbForFees: DEFAULT_FEE_SETTINGS.useBnbForFees,
    discountUsdtPercent: DEFAULT_FEE_SETTINGS.discountUsdtPercent,
    discountBnbPercent: DEFAULT_FEE_SETTINGS.discountBnbPercent,
    minBnbBalance: DEFAULT_FEE_SETTINGS.minBnbBalance,
    reserveBnbForFeesEnabled: DEFAULT_FEE_SETTINGS.reserveBnbForFeesEnabled,
    pairDiscovery: serializePairDiscoveryConfig(),
    mode: 'spot',
    orderType: 'market',
    slippagePercent: 0.5,
    strategies: serializeDefaultStrategies(),
  }
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeNumber(value: unknown, fallback: number, minimum?: number, maximum?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  if (typeof minimum === 'number' && value < minimum) {
    return minimum
  }

  if (typeof maximum === 'number' && value > maximum) {
    return maximum
  }

  return value
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

export function normalizeFeeSettings(input?: Partial<FeeSettings> | null): FeeSettings {
  return {
    useBnbForFees: normalizeBoolean(input?.useBnbForFees, DEFAULT_FEE_SETTINGS.useBnbForFees),
    discountUsdtPercent: normalizeNumber(input?.discountUsdtPercent, DEFAULT_FEE_SETTINGS.discountUsdtPercent, 0, 1),
    discountBnbPercent: normalizeNumber(input?.discountBnbPercent, DEFAULT_FEE_SETTINGS.discountBnbPercent, 0, 1),
    minBnbBalance: normalizeNumber(input?.minBnbBalance, DEFAULT_FEE_SETTINGS.minBnbBalance, 0),
    reserveBnbForFeesEnabled: normalizeBoolean(input?.reserveBnbForFeesEnabled, DEFAULT_FEE_SETTINGS.reserveBnbForFeesEnabled),
  }
}

export function normalizePairDiscoveryConfig(input?: Partial<PairDiscoveryConfig> | null): PairDiscoveryConfig {
  return {
    autoDiscoveryEnabled: normalizeBoolean(input?.autoDiscoveryEnabled, DEFAULT_PAIR_DISCOVERY_CONFIG.autoDiscoveryEnabled),
    autoAddToAllowedPairs: normalizeBoolean(input?.autoAddToAllowedPairs, DEFAULT_PAIR_DISCOVERY_CONFIG.autoAddToAllowedPairs),
    autoRemoveFromAllowedPairs: normalizeBoolean(input?.autoRemoveFromAllowedPairs, DEFAULT_PAIR_DISCOVERY_CONFIG.autoRemoveFromAllowedPairs),
    reviewRequired: normalizeBoolean(input?.reviewRequired, DEFAULT_PAIR_DISCOVERY_CONFIG.reviewRequired),
    autoSyncIntervalMinutes: normalizeNumber(input?.autoSyncIntervalMinutes, DEFAULT_PAIR_DISCOVERY_CONFIG.autoSyncIntervalMinutes, 5),
    sources: {
      reddit: normalizeBoolean(input?.sources?.reddit, DEFAULT_PAIR_DISCOVERY_CONFIG.sources.reddit),
      rss: normalizeBoolean(input?.sources?.rss, DEFAULT_PAIR_DISCOVERY_CONFIG.sources.rss),
      x: normalizeBoolean(input?.sources?.x, DEFAULT_PAIR_DISCOVERY_CONFIG.sources.x),
      telegram: normalizeBoolean(input?.sources?.telegram, DEFAULT_PAIR_DISCOVERY_CONFIG.sources.telegram),
    },
    minSocialScore: normalizeNumber(input?.minSocialScore, DEFAULT_PAIR_DISCOVERY_CONFIG.minSocialScore, 0, 100),
    minMentions: normalizeNumber(input?.minMentions, DEFAULT_PAIR_DISCOVERY_CONFIG.minMentions, 0),
    maxPairs: normalizeNumber(input?.maxPairs, DEFAULT_PAIR_DISCOVERY_CONFIG.maxPairs, 1),
    excludedAssets: normalizeStringArray(input?.excludedAssets ?? DEFAULT_PAIR_DISCOVERY_CONFIG.excludedAssets),
    managedPairs: normalizeStringArray(input?.managedPairs ?? DEFAULT_PAIR_DISCOVERY_CONFIG.managedPairs),
    lastSyncAt: typeof input?.lastSyncAt === 'string' ? input.lastSyncAt : undefined,
    lastAppliedAt: typeof input?.lastAppliedAt === 'string' ? input.lastAppliedAt : undefined,
    lastSyncStatus: (
      input?.lastSyncStatus === 'idle'
      || input?.lastSyncStatus === 'previewed'
      || input?.lastSyncStatus === 'applied'
      || input?.lastSyncStatus === 'skipped'
      || input?.lastSyncStatus === 'error'
    )
      ? input.lastSyncStatus
      : undefined,
    lastSyncSummary: typeof input?.lastSyncSummary === 'string' ? input.lastSyncSummary : undefined,
  }
}

export function parsePairDiscoveryConfig(value: string | null | undefined): PairDiscoveryConfig {
  return normalizePairDiscoveryConfig(safeJsonParse<Partial<PairDiscoveryConfig>>(value, DEFAULT_PAIR_DISCOVERY_CONFIG))
}

export function serializePairDiscoveryConfig(input?: Partial<PairDiscoveryConfig> | null): string {
  return JSON.stringify(normalizePairDiscoveryConfig(input))
}
