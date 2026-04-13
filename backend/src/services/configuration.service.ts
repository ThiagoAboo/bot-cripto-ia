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
  sources: PairDiscoverySources
  minSocialScore: number
  minMentions: number
  maxPairs: number
  excludedAssets: string[]
  managedPairs: string[]
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
  }
}

export function parsePairDiscoveryConfig(value: string | null | undefined): PairDiscoveryConfig {
  return normalizePairDiscoveryConfig(safeJsonParse<Partial<PairDiscoveryConfig>>(value, DEFAULT_PAIR_DISCOVERY_CONFIG))
}

export function serializePairDiscoveryConfig(input?: Partial<PairDiscoveryConfig> | null): string {
  return JSON.stringify(normalizePairDiscoveryConfig(input))
}
