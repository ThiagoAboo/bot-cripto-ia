import { getAvailablePairs } from './binance.service'
import type { FeeSettings, PairDiscoveryConfig } from './configuration.service'
import { ExternalApiError, fetchWithTimeout, requestJson } from './external-http.service'
import { logger } from '../utils/logger'

export type SocialSource = 'reddit' | 'rss' | 'x' | 'telegram'
export type SocialSentiment = 'bullish' | 'neutral' | 'bearish'

export interface SocialSignalReference {
  source: SocialSource
  title: string
  url?: string
  publishedAt?: string
}

export interface SocialSignal {
  symbol: string
  pair: string
  score: number
  mentions: number
  sentiment: SocialSentiment
  sources: SocialSource[]
  references: SocialSignalReference[]
}

export interface PairDiscoveryPreviewItem {
  action: 'add' | 'remove'
  symbol: string
  pair: string
  score: number | null
  mentions: number
  sentiment: SocialSentiment | null
  sources: SocialSource[]
  reason: string
}

export interface PairDiscoveryPreview {
  generatedAt: string
  autoDiscoveryEnabled: boolean
  reviewRequired: boolean
  sourcesUsed: SocialSource[]
  signals: SocialSignal[]
  items: PairDiscoveryPreviewItem[]
  nextAllowedPairs: string[]
  managedPairs: string[]
  summary: {
    currentAllowed: number
    nextAllowed: number
    additions: number
    removals: number
  }
}

interface PairCatalogEntry {
  symbol: string
  pair: string
  quoteAsset: string
}

interface DiscoveryMention {
  source: SocialSource
  title: string
  text: string
  url?: string
  publishedAt?: string
  engagementBoost: number
}

interface SignalAccumulator {
  symbol: string
  pair: string
  mentions: number
  sources: Set<SocialSource>
  bullish: number
  bearish: number
  weightTotal: number
  references: SocialSignalReference[]
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        title?: string
        selftext?: string
        permalink?: string
        url?: string
        created_utc?: number
        ups?: number
        num_comments?: number
      }
    }>
  }
}

const QUOTE_ASSET_PRIORITY = ['USDT', 'FDUSD', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'BRL', 'TRY']
const DEFAULT_REDDIT_SUBREDDITS = ['CryptoCurrency', 'CryptoMarkets', 'binance']
const DEFAULT_RSS_FEEDS = ['https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/']
const DEFAULT_SIGNAL_LIMIT = Number(process.env.PAIR_DISCOVERY_SIGNAL_LIMIT ?? 25)
const DEFAULT_TIMEOUT_MS = Number(process.env.PAIR_DISCOVERY_TIMEOUT_MS ?? 12000)
const CACHE_TTL_MS = Number(process.env.PAIR_DISCOVERY_CACHE_TTL_MS ?? 300000)
const COMMON_STOPWORDS = new Set([
  'THE',
  'AND',
  'WITH',
  'FROM',
  'THIS',
  'THAT',
  'WILL',
  'JUST',
  'INTO',
  'YOUR',
  'NEWS',
  'TOKEN',
  'COIN',
  'AI',
  'USD',
  'USDT',
  'USDC',
  'ETF',
  'CEO',
  'ATH',
])
const BULLISH_TERMS = ['bullish', 'breakout', 'surge', 'soar', 'rally', 'uptrend', 'moon', 'partnership', 'listing', 'adoption']
const BEARISH_TERMS = ['bearish', 'selloff', 'dump', 'hack', 'lawsuit', 'outflow', 'collapse', 'delist', 'downtrend', 'fear']

const latestSignalsCache = new Map<string, CacheEntry<SocialSignal[]>>()

function parseCsvEnv(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) {
    return fallback
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizePairList(pairs: string[]): string[] {
  return Array.from(new Set(
    pairs
      .filter((pair): pair is string => typeof pair === 'string')
      .map((pair) => pair.trim().toUpperCase())
      .filter(Boolean),
  ))
}

function getSourceCacheKey(config: PairDiscoveryConfig): string {
  return JSON.stringify(config.sources)
}

function getSourcePriority(quoteAsset: string): number {
  const index = QUOTE_ASSET_PRIORITY.indexOf(quoteAsset)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function buildPairCatalog(availablePairs: string[]): Map<string, PairCatalogEntry> {
  const catalog = new Map<string, PairCatalogEntry>()

  for (const pair of availablePairs) {
    const [symbol, quoteAsset] = pair.split('/')
    if (!symbol || !quoteAsset) {
      continue
    }

    const entry: PairCatalogEntry = {
      symbol,
      pair,
      quoteAsset,
    }

    const current = catalog.get(symbol)
    if (!current || getSourcePriority(quoteAsset) < getSourcePriority(current.quoteAsset)) {
      catalog.set(symbol, entry)
    }
  }

  return catalog
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripTags(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractXmlTag(block: string, tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    if (match?.[1]) {
      return stripTags(match[1])
    }
  }

  return undefined
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'bot-cripto-ia/1.0',
    },
  }, DEFAULT_TIMEOUT_MS)

  const body = await response.text()
  if (!response.ok) {
    throw new ExternalApiError(`Falha ao consultar feed externo (${response.status})`, {
      status: response.status,
      payload: body,
    })
  }

  return body
}

function parseRssMentions(xml: string): DiscoveryMention[] {
  const itemBlocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ]

  return itemBlocks
    .map((block) => {
      const title = extractXmlTag(block, ['title']) ?? ''
      const description = extractXmlTag(block, ['description', 'summary', 'content']) ?? ''
      const url = extractXmlTag(block, ['link', 'id'])
      const publishedAt = extractXmlTag(block, ['pubDate', 'published', 'updated'])

      return {
        source: 'rss' as const,
        title,
        text: `${title} ${description}`.trim(),
        url,
        publishedAt,
        engagementBoost: 0.8,
      }
    })
    .filter((entry) => entry.text.length > 0)
}

function getSentiment(text: string): SocialSentiment {
  const normalized = text.toLowerCase()
  const bullishHits = BULLISH_TERMS.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0)
  const bearishHits = BEARISH_TERMS.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0)

  if (bullishHits > bearishHits) {
    return 'bullish'
  }

  if (bearishHits > bullishHits) {
    return 'bearish'
  }

  return 'neutral'
}

function extractMentionedSymbols(text: string, pairCatalog: Map<string, PairCatalogEntry>): string[] {
  const matches = new Set<string>()
  const candidates = [
    ...(text.match(/[$#][A-Za-z0-9]{2,10}\b/g) ?? []),
    ...(text.match(/\b[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}\b/g) ?? []),
    ...(text.match(/\b[A-Z]{2,10}\b/g) ?? []),
  ]

  for (const candidate of candidates) {
    const cleaned = candidate.replace(/^[#$]/, '')
    const symbol = cleaned.includes('/') ? cleaned.split('/')[0] : cleaned
    if (!symbol || COMMON_STOPWORDS.has(symbol)) {
      continue
    }

    if (pairCatalog.has(symbol)) {
      matches.add(symbol)
    }
  }

  return Array.from(matches)
}

function getSignalScore(state: SignalAccumulator): number {
  const sentimentBias = state.bullish - state.bearish
  return clamp(
    Math.round(18 + (state.mentions * 8) + (state.sources.size * 10) + (state.weightTotal * 6) + (sentimentBias * 4)),
    0,
    100,
  )
}

function finalizeSignal(state: SignalAccumulator): SocialSignal {
  let sentiment: SocialSentiment = 'neutral'
  if (state.bullish > state.bearish) {
    sentiment = 'bullish'
  } else if (state.bearish > state.bullish) {
    sentiment = 'bearish'
  }

  return {
    symbol: state.symbol,
    pair: state.pair,
    score: getSignalScore(state),
    mentions: state.mentions,
    sentiment,
    sources: Array.from(state.sources),
    references: state.references.slice(0, 5),
  }
}

async function fetchRedditMentions(): Promise<DiscoveryMention[]> {
  const subreddits = parseCsvEnv(process.env.PAIR_DISCOVERY_REDDIT_SUBREDDITS, DEFAULT_REDDIT_SUBREDDITS)
  const limit = Math.max(1, Math.min(100, Number(process.env.PAIR_DISCOVERY_REDDIT_LIMIT ?? DEFAULT_SIGNAL_LIMIT)))
  const mentions: DiscoveryMention[] = []

  for (const subreddit of subreddits) {
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}`
    const payload = await requestJson<RedditListingResponse>(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'bot-cripto-ia/1.0',
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: 2,
      retryDelayMs: 500,
      module: 'pair-discovery',
      requestName: `reddit:${subreddit}`,
    })

    for (const child of payload.data?.children ?? []) {
      const data = child.data
      if (!data?.title) {
        continue
      }

      const engagementBase = Number(data.ups ?? 0) + Number(data.num_comments ?? 0)
      const engagementBoost = clamp(Math.log10(Math.max(1, engagementBase + 1)), 0, 2.5)

      mentions.push({
        source: 'reddit',
        title: data.title,
        text: `${data.title} ${data.selftext ?? ''}`.trim(),
        url: data.permalink ? `https://www.reddit.com${data.permalink}` : data.url,
        publishedAt: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : undefined,
        engagementBoost,
      })
    }
  }

  return mentions
}

async function fetchRssFeedMentions(): Promise<DiscoveryMention[]> {
  const feeds = parseCsvEnv(process.env.PAIR_DISCOVERY_RSS_FEEDS, DEFAULT_RSS_FEEDS)
  const results = await Promise.all(feeds.map(async (feedUrl) => parseRssMentions(await fetchText(feedUrl))))
  return results.flat()
}

async function fetchGenericJsonMentions(source: 'x' | 'telegram', url: string): Promise<DiscoveryMention[]> {
  const payload = await requestJson<unknown>(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'bot-cripto-ia/1.0',
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: 2,
    retryDelayMs: 500,
    module: 'pair-discovery',
    requestName: `${source}:feed`,
  })

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { items?: unknown[] })?.items)
      ? (payload as { items: unknown[] }).items
      : Array.isArray((payload as { data?: unknown[] })?.data)
        ? (payload as { data: unknown[] }).data
        : []

  return items
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      const title = typeof entry.title === 'string' ? entry.title : ''
      const textBody = typeof entry.text === 'string'
        ? entry.text
        : typeof entry.body === 'string'
          ? entry.body
          : typeof entry.message === 'string'
            ? entry.message
            : title

      const engagementRaw = Number(entry.engagement ?? entry.score ?? entry.views ?? 0)

      return {
        source,
        title: title || textBody.slice(0, 120),
        text: `${title} ${textBody}`.trim(),
        url: typeof entry.url === 'string' ? entry.url : undefined,
        publishedAt: typeof entry.publishedAt === 'string'
          ? entry.publishedAt
          : typeof entry.timestamp === 'string'
            ? entry.timestamp
            : undefined,
        engagementBoost: clamp(Math.log10(Math.max(1, engagementRaw + 1)), 0, 2.5),
      }
    })
    .filter((entry) => entry.text.length > 0)
}

async function fetchMentionsForSource(source: SocialSource): Promise<DiscoveryMention[]> {
  switch (source) {
    case 'reddit':
      return fetchRedditMentions()
    case 'rss':
      return fetchRssFeedMentions()
    case 'x': {
      const url = process.env.PAIR_DISCOVERY_X_FEED_URL
      if (!url) {
        logger.warn('[pair-discovery] Fonte X ignorada por falta de configuração', {
          module: 'pair-discovery',
          event: 'pair_discovery_source_skipped',
          source,
          skipPersistence: true,
        })
        return []
      }

      return fetchGenericJsonMentions('x', url)
    }
    case 'telegram': {
      const url = process.env.PAIR_DISCOVERY_TELEGRAM_FEED_URL
      if (!url) {
        logger.warn('[pair-discovery] Fonte Telegram ignorada por falta de configuração', {
          module: 'pair-discovery',
          event: 'pair_discovery_source_skipped',
          source,
          skipPersistence: true,
        })
        return []
      }

      return fetchGenericJsonMentions('telegram', url)
    }
    default:
      return []
  }
}

function getEnabledSources(config: PairDiscoveryConfig): SocialSource[] {
  return (Object.entries(config.sources) as Array<[SocialSource, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([source]) => source)
}

export async function getLatestSocialSignals(config: PairDiscoveryConfig): Promise<SocialSignal[]> {
  const enabledSources = getEnabledSources(config)
  if (enabledSources.length === 0) {
    return []
  }

  const cacheKey = getSourceCacheKey(config)
  const cached = latestSignalsCache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value
  }

  const [availablePairs, mentionResults] = await Promise.all([
    getAvailablePairs(),
    Promise.all(enabledSources.map(async (source) => {
      try {
        return await fetchMentionsForSource(source)
      } catch (error) {
        logger.warn('[pair-discovery] Falha ao consultar fonte externa', {
          module: 'pair-discovery',
          event: 'pair_discovery_source_error',
          source,
          error,
          skipPersistence: true,
        })
        return []
      }
    })),
  ])

  const pairCatalog = buildPairCatalog(availablePairs)
  const accumulator = new Map<string, SignalAccumulator>()

  for (const mention of mentionResults.flat()) {
    const symbols = extractMentionedSymbols(`${mention.title} ${mention.text}`, pairCatalog)
    const sentiment = getSentiment(`${mention.title} ${mention.text}`)

    for (const symbol of symbols) {
      const pair = pairCatalog.get(symbol)?.pair
      if (!pair) {
        continue
      }

      const state = accumulator.get(symbol) ?? {
        symbol,
        pair,
        mentions: 0,
        sources: new Set<SocialSource>(),
        bullish: 0,
        bearish: 0,
        weightTotal: 0,
        references: [],
      }

      state.mentions += 1
      state.sources.add(mention.source)
      state.weightTotal += mention.engagementBoost + 1
      if (sentiment === 'bullish') {
        state.bullish += 1
      } else if (sentiment === 'bearish') {
        state.bearish += 1
      }

      state.references.push({
        source: mention.source,
        title: mention.title,
        url: mention.url,
        publishedAt: mention.publishedAt,
      })

      accumulator.set(symbol, state)
    }
  }

  const signals = Array.from(accumulator.values())
    .map(finalizeSignal)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.mentions !== left.mentions) {
        return right.mentions - left.mentions
      }

      return left.symbol.localeCompare(right.symbol, 'en')
    })
    .slice(0, DEFAULT_SIGNAL_LIMIT)

  latestSignalsCache.set(cacheKey, {
    value: signals,
    timestamp: Date.now(),
  })

  return signals
}

function buildAdditionReason(signal: SocialSignal): string {
  return `Score ${signal.score} com ${signal.mentions} menções e suporte em ${signal.sources.join(', ')}`
}

function buildRemovalReason(signal?: SocialSignal): string {
  if (!signal) {
    return 'Par gerenciado automaticamente saiu do ranking elegível ou ficou sem sinais recentes suficientes'
  }

  return `Par gerenciado automaticamente caiu abaixo do critério atual (${signal.score} pontos e ${signal.mentions} menções)`
}

export async function generatePairDiscoveryPreview(params: {
  allowedPairs: string[]
  fees: FeeSettings
  pairDiscovery: PairDiscoveryConfig
}): Promise<PairDiscoveryPreview> {
  const allowedPairs = normalizePairList(params.allowedPairs)
  const pairDiscovery = {
    ...params.pairDiscovery,
    managedPairs: normalizePairList(params.pairDiscovery.managedPairs),
    excludedAssets: normalizePairList(params.pairDiscovery.excludedAssets),
  }

  const signals = await getLatestSocialSignals(pairDiscovery)
  const sourcesUsed = Array.from(new Set(signals.flatMap((signal) => signal.sources)))
  const currentManagedPairs = pairDiscovery.managedPairs.filter((pair) => allowedPairs.includes(pair))
  const currentManagedSet = new Set(currentManagedPairs)
  const manualPairs = allowedPairs.filter((pair) => !currentManagedSet.has(pair))
  const protectedPairs = new Set<string>()

  if (params.fees.useBnbForFees && params.fees.reserveBnbForFeesEnabled) {
    for (const pair of allowedPairs) {
      if (pair.split('/')[0] === 'BNB') {
        protectedPairs.add(pair)
      }
    }
  }

  if (!pairDiscovery.autoDiscoveryEnabled) {
    return {
      generatedAt: new Date().toISOString(),
      autoDiscoveryEnabled: false,
      reviewRequired: pairDiscovery.reviewRequired,
      sourcesUsed,
      signals,
      items: [],
      nextAllowedPairs: allowedPairs,
      managedPairs: currentManagedPairs,
      summary: {
        currentAllowed: allowedPairs.length,
        nextAllowed: allowedPairs.length,
        additions: 0,
        removals: 0,
      },
    }
  }

  const eligibleSignals = signals.filter((signal) => (
    signal.score >= pairDiscovery.minSocialScore
      && signal.mentions >= pairDiscovery.minMentions
      && !pairDiscovery.excludedAssets.includes(signal.symbol)
      && !manualPairs.includes(signal.pair)
  ))

  const desiredManagedPairs = [...currentManagedPairs]
  const eligiblePairSet = new Set(eligibleSignals.map((signal) => signal.pair))

  if (pairDiscovery.autoRemoveFromAllowedPairs) {
    for (let index = desiredManagedPairs.length - 1; index >= 0; index -= 1) {
      const pair = desiredManagedPairs[index]
      if (protectedPairs.has(pair)) {
        continue
      }

      if (!eligiblePairSet.has(pair)) {
        desiredManagedPairs.splice(index, 1)
      }
    }
  }

  if (pairDiscovery.autoAddToAllowedPairs) {
    for (const signal of eligibleSignals) {
      if (manualPairs.includes(signal.pair) || desiredManagedPairs.includes(signal.pair)) {
        continue
      }

      if ((manualPairs.length + desiredManagedPairs.length) >= pairDiscovery.maxPairs) {
        break
      }

      desiredManagedPairs.push(signal.pair)
    }
  }

  if (pairDiscovery.autoRemoveFromAllowedPairs && (manualPairs.length + desiredManagedPairs.length) > pairDiscovery.maxPairs) {
    for (let index = desiredManagedPairs.length - 1; index >= 0 && (manualPairs.length + desiredManagedPairs.length) > pairDiscovery.maxPairs; index -= 1) {
      const pair = desiredManagedPairs[index]
      if (protectedPairs.has(pair)) {
        continue
      }

      desiredManagedPairs.splice(index, 1)
    }
  }

  const managedPairs = normalizePairList(desiredManagedPairs)
  const additions = managedPairs.filter((pair) => !currentManagedSet.has(pair))
  const removals = currentManagedPairs.filter((pair) => !managedPairs.includes(pair))
  const nextAllowedPairs = normalizePairList([...manualPairs, ...managedPairs])

  const items: PairDiscoveryPreviewItem[] = [
    ...additions.map((pair) => {
      const signal = eligibleSignals.find((entry) => entry.pair === pair) ?? signals.find((entry) => entry.pair === pair)
      return {
        action: 'add' as const,
        symbol: signal?.symbol ?? pair.split('/')[0],
        pair,
        score: signal?.score ?? null,
        mentions: signal?.mentions ?? 0,
        sentiment: signal?.sentiment ?? null,
        sources: signal?.sources ?? [],
        reason: signal ? buildAdditionReason(signal) : 'Par elegível por curadoria automática',
      }
    }),
    ...removals.map((pair) => {
      const signal = signals.find((entry) => entry.pair === pair)
      return {
        action: 'remove' as const,
        symbol: signal?.symbol ?? pair.split('/')[0],
        pair,
        score: signal?.score ?? null,
        mentions: signal?.mentions ?? 0,
        sentiment: signal?.sentiment ?? null,
        sources: signal?.sources ?? [],
        reason: buildRemovalReason(signal),
      }
    }),
  ]

  return {
    generatedAt: new Date().toISOString(),
    autoDiscoveryEnabled: true,
    reviewRequired: pairDiscovery.reviewRequired,
    sourcesUsed,
    signals,
    items,
    nextAllowedPairs,
    managedPairs,
    summary: {
      currentAllowed: allowedPairs.length,
      nextAllowed: nextAllowedPairs.length,
      additions: additions.length,
      removals: removals.length,
    },
  }
}
