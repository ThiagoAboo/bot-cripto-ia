import { prisma } from '../config/database'
import { getBotInstanceById, buildStrategyId } from './bot-registry.service'
import { DEFAULT_PAIR_DISCOVERY_CONFIG, parsePairDiscoveryConfig } from './configuration.service'
import { getCandles, getTickerPrice } from './binance.service'
import { getLatestSocialSignals, type SocialSignal } from './pair-discovery.service'
import { emitDashboardUpdate } from './socket.service'
import { logger } from '../utils/logger'
import { trace } from '../utils/tracer'

type BotAnalysisAction = 'buy' | 'sell' | 'hold'

interface RuntimeSpecialistInsight {
  specialist: string
  action: BotAnalysisAction
  confidence: number
  reason: string
  indicators: Record<string, number | null>
}

interface RuntimeOpportunity {
  pair: string
  action: BotAnalysisAction
  confidence: number
  price: number
  reason: string
  specialists: RuntimeSpecialistInsight[]
}

interface RuntimeAnalysisResult {
  primarySpecialist: string
  opportunities: RuntimeOpportunity[]
  bestOpportunity?: RuntimeOpportunity
  summary: {
    analyzedPairs: number
    actionablePairs: number
    buySignals: number
    sellSignals: number
    holdSignals: number
  }
}

interface BotRuntimeModule {
  createBotAnalysisRuntime: () => {
    analyzeBot(input: {
      bot: {
        id: string
        name: string
        strategyType: string
        strategyId: string
        indicatorType?: string
        specialization?: string
        parameters: Record<string, unknown>
        minSocialScore?: number
        minMentions?: number
      }
      marketSnapshots: Array<{
        pair: string
        currentPrice: number
        candles: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>
        socialSignal?: SocialSignal
      }>
      includeSocialOverlay?: boolean
    }): RuntimeAnalysisResult
  }
}

export interface BotAnalysisResponse {
  botId: string
  botName: string
  strategyId: string
  templateId?: string
  templateName?: string
  primarySpecialist: string
  timeframe: string
  generatedAt: string
  analyzedPairs: string[]
  summary: RuntimeAnalysisResult['summary']
  bestOpportunity?: RuntimeOpportunity
  opportunities: RuntimeOpportunity[]
  socialSignals: SocialSignal[]
}

const { createBotAnalysisRuntime } = require('../../../bots/src/index.js') as BotRuntimeModule
const DEFAULT_ALLOWED_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

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

function normalizePairs(pairs: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(pairs)) {
    return fallback
  }

  return Array.from(new Set(
    pairs
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ))
}

function resolveTimeframe(parameters: Record<string, unknown>): '1m' | '5m' | '15m' | '1h' | '4h' | '1d' {
  const timeframe = typeof parameters.timeframe === 'string' ? parameters.timeframe : '1h'
  if (['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe)) {
    return timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  }

  return '1h'
}

function buildCandidatePairs(params: {
  allowedPairs: string[]
  currentPair?: string | null
  socialSignals: SocialSignal[]
  limit: number
}): string[] {
  const orderedPairs = new Set<string>()

  if (params.currentPair) {
    orderedPairs.add(params.currentPair.toUpperCase())
  }

  params.socialSignals.forEach((signal) => {
    if (params.allowedPairs.includes(signal.pair)) {
      orderedPairs.add(signal.pair)
    }
  })

  params.allowedPairs.forEach((pair) => {
    orderedPairs.add(pair)
  })

  return Array.from(orderedPairs).slice(0, params.limit)
}

export async function analyzeBotInstance(
  userId: string,
  botId: string,
  options?: { pairLimit?: number },
): Promise<BotAnalysisResponse | null> {
  const bot = await getBotInstanceById(userId, botId)
  if (!bot) {
    return null
  }

  const runtime = createBotAnalysisRuntime()
  const configuration = await prisma.configuration.findUnique({
    where: { userId },
    select: {
      allowedPairs: true,
      pairDiscovery: true,
    },
  })

  const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
  const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
  const parameters = {
    ...templateParameters,
    ...instanceParameters,
  }
  const timeframe = resolveTimeframe(parameters)
  const pairDiscoveryConfig = configuration
    ? parsePairDiscoveryConfig(configuration.pairDiscovery)
    : DEFAULT_PAIR_DISCOVERY_CONFIG
  const socialSignals = await getLatestSocialSignals(pairDiscoveryConfig).catch((error) => {
    logger.warn('[bot] Falha ao carregar sinais sociais para análise do bot', {
      module: 'bot',
      event: 'bot_analysis_social_signal_error',
      userId,
      botId,
      error,
      skipPersistence: true,
    })

    return [] as SocialSignal[]
  })
  const allowedPairs = normalizePairs(
    safeJsonParse(configuration?.allowedPairs, DEFAULT_ALLOWED_PAIRS),
    DEFAULT_ALLOWED_PAIRS,
  )
  const candidatePairs = buildCandidatePairs({
    allowedPairs,
    currentPair: bot.currentPair,
    socialSignals,
    limit: options?.pairLimit ?? 6,
  })
  const socialSignalMap = new Map<string, SocialSignal>(socialSignals.map((signal) => [signal.pair, signal]))

  const marketSnapshots = (await Promise.all(candidatePairs.map(async (pair) => {
    try {
      const [candles, tickerPrice] = await Promise.all([
        getCandles(pair, timeframe, 120),
        getTickerPrice(pair).catch(() => null),
      ])

      if (candles.length < 20) {
        return null
      }

      return {
        pair,
        candles,
        currentPrice: tickerPrice ?? candles[candles.length - 1].close,
        socialSignal: socialSignalMap.get(pair),
      }
    } catch (error) {
      logger.warn('[bot] Falha ao montar snapshot de mercado para análise', {
        module: 'bot',
        event: 'bot_analysis_market_snapshot_error',
        userId,
        botId,
        pair,
        error,
        skipPersistence: true,
      })
      return null
    }
  }))).filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const strategyType = bot.template?.strategyType ?? bot.strategyType
  const strategyId = bot.template?.id ?? buildStrategyId(strategyType)
  const runtimeAnalysis = runtime.analyzeBot({
    bot: {
      id: bot.id,
      name: bot.name,
      strategyType,
      strategyId,
      indicatorType: bot.template?.indicatorType ?? undefined,
      specialization: bot.template?.specialization ?? undefined,
      parameters,
      minMentions: pairDiscoveryConfig.minMentions,
      minSocialScore: pairDiscoveryConfig.minSocialScore,
    },
    marketSnapshots,
    includeSocialOverlay: socialSignals.length > 0,
  })
  const generatedAt = new Date().toISOString()

  await prisma.bot.update({
    where: { id: bot.id },
    data: {
      currentPair: runtimeAnalysis.bestOpportunity?.pair ?? null,
      recommendedAction: runtimeAnalysis.bestOpportunity?.action ?? 'hold',
      confidence: runtimeAnalysis.bestOpportunity?.confidence ?? 0,
      lastAnalysis: new Date(generatedAt),
      updatedAt: new Date(generatedAt),
    },
  })

  emitDashboardUpdate(userId, {
    scope: 'bots',
    reason: 'bot_analysis_refreshed',
    botId,
    updatedAt: generatedAt,
  })

  trace('DEBUG', 'bot', 'analyzeBotInstance', `Análise do bot ${bot.name} concluída`, 0, {
    userId,
    botId,
    currentPair: runtimeAnalysis.bestOpportunity?.pair ?? null,
    recommendedAction: runtimeAnalysis.bestOpportunity?.action ?? 'hold',
    confidence: runtimeAnalysis.bestOpportunity?.confidence ?? 0,
  })

  return {
    botId: bot.id,
    botName: bot.name,
    strategyId,
    templateId: bot.template?.id ?? undefined,
    templateName: bot.template?.name ?? undefined,
    primarySpecialist: runtimeAnalysis.primarySpecialist,
    timeframe,
    generatedAt,
    analyzedPairs: candidatePairs,
    summary: runtimeAnalysis.summary,
    bestOpportunity: runtimeAnalysis.bestOpportunity,
    opportunities: runtimeAnalysis.opportunities,
    socialSignals: socialSignals.slice(0, 5),
  }
}
