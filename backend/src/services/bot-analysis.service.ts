import { prisma } from '../config/database'
import { buildStrategyId, getBotInstanceById } from './bot-registry.service'
import { DEFAULT_PAIR_DISCOVERY_CONFIG, parsePairDiscoveryConfig } from './configuration.service'
import { getInternalApiBaseUrl } from './internal-api-base-url.service'
import { runPythonBotAnalysis, type PythonBotRuntimeOpportunity } from './python-bot-runtime.service'
import { emitDashboardUpdate } from './socket.service'
import { signUserAccessToken } from './auth-token.service'
import { resolveTrainingModelArtifactPath } from './training-model.service'
import { logger } from '../utils/logger'
import { trace } from '../utils/tracer'
import type { SocialSignal } from './pair-discovery.service'

type BotAnalysisAction = 'buy' | 'sell' | 'hold'

export interface RuntimeSpecialistInsight {
  specialist: string
  action: BotAnalysisAction
  confidence: number
  reason: string
  indicators: Record<string, number | null>
}

export interface RuntimeOpportunity {
  pair: string
  action: BotAnalysisAction
  confidence: number
  price: number
  reason: string
  specialists: RuntimeSpecialistInsight[]
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
  summary: {
    analyzedPairs: number
    actionablePairs: number
    buySignals: number
    sellSignals: number
    holdSignals: number
  }
  bestOpportunity?: RuntimeOpportunity
  opportunities: RuntimeOpportunity[]
  socialSignals: SocialSignal[]
}

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

function resolveAllowedPairs(
  parameters: Record<string, unknown>,
  configurationAllowedPairs: string[],
): string[] {
  const instanceAllowedPairs = normalizePairs(parameters.allowedPairs)
  if (instanceAllowedPairs.length > 0) {
    return instanceAllowedPairs
  }

  return configurationAllowedPairs
}

function resolveTimeframe(parameters: Record<string, unknown>): '1m' | '5m' | '15m' | '1h' | '4h' | '1d' {
  const timeframe = typeof parameters.timeframe === 'string' ? parameters.timeframe : '1h'
  if (['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe)) {
    return timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  }

  return '1h'
}

function resolveMaxPairsToAnalyze(
  parameters: Record<string, unknown>,
  overrideLimit?: number,
): number | undefined {
  const configuredLimit = typeof parameters.maxPairsToAnalyze === 'number'
    ? parameters.maxPairsToAnalyze
    : undefined
  const candidate = typeof overrideLimit === 'number' && Number.isFinite(overrideLimit)
    ? overrideLimit
    : configuredLimit

  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= 0) {
    return undefined
  }

  return Math.min(Math.round(candidate), 500)
}

function normalizeOpportunity(entry: PythonBotRuntimeOpportunity): RuntimeOpportunity {
  return {
    pair: entry.pair,
    action: entry.action,
    confidence: entry.confidence,
    price: entry.price,
    reason: entry.reason,
    specialists: entry.specialists.map((specialist) => ({
      specialist: specialist.specialist,
      action: specialist.action,
      confidence: specialist.confidence,
      reason: specialist.reason,
      indicators: specialist.indicators,
    })),
  }
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

  const [configuration, user] = await Promise.all([
    prisma.configuration.findUnique({
      where: { userId },
      select: {
        allowedPairs: true,
        pairDiscovery: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
      },
    }),
  ])

  const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
  const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
  const parameters = {
    ...templateParameters,
    ...instanceParameters,
  }
  const timeframe = resolveTimeframe(parameters)
  const pairLimit = resolveMaxPairsToAnalyze(parameters, options?.pairLimit)
  const pairDiscoveryConfig = configuration
    ? parsePairDiscoveryConfig(configuration.pairDiscovery)
    : DEFAULT_PAIR_DISCOVERY_CONFIG
  const configuredAllowedPairs = normalizePairs(
    safeJsonParse(configuration?.allowedPairs, DEFAULT_ALLOWED_PAIRS),
    DEFAULT_ALLOWED_PAIRS,
  )
  const allowedPairs = resolveAllowedPairs(parameters, configuredAllowedPairs)
  const strategyType = bot.template?.strategyType ?? bot.strategyType
  const strategyId = bot.template?.id ?? buildStrategyId(strategyType)
  const modelArtifactPath = bot.modelUrl
    ? resolveTrainingModelArtifactPath(bot.modelUrl)
    : undefined

  const runtimeAnalysis = await runPythonBotAnalysis({
    backend: {
      baseUrl: getInternalApiBaseUrl(),
      accessToken: signUserAccessToken({
        id: userId,
        email: user?.email ?? '',
      }),
      timeoutSeconds: Number(process.env.PYTHON_BOT_RUNTIME_TIMEOUT_SECONDS ?? 15),
    },
    bot: {
      id: bot.id,
      name: bot.name,
      strategyType,
      strategyId,
      indicatorType: bot.template?.indicatorType ?? undefined,
      specialization: bot.template?.specialization ?? undefined,
      parameters,
      allowedPairs,
      focusPair: bot.focusPair ?? undefined,
      currentPair: bot.currentPair ?? undefined,
      minMentions: pairDiscoveryConfig.minMentions,
      minSocialScore: pairDiscoveryConfig.minSocialScore,
      timeframe,
      modelArtifactPath,
    },
    pairLimit,
    includeSocialOverlay: true,
  }).catch((error) => {
    logger.error('[bot] Falha ao executar runtime Python dos bots', {
      module: 'bot',
      event: 'bot_analysis_python_runtime_error',
      userId,
      botId,
      error,
      skipPersistence: true,
    })
    throw error
  })

  const bestOpportunity = runtimeAnalysis.bestOpportunity
    ? normalizeOpportunity(runtimeAnalysis.bestOpportunity)
    : undefined
  const opportunities = runtimeAnalysis.opportunities.map(normalizeOpportunity)
  const generatedAt = new Date().toISOString()
  const actionableOpportunity = opportunities.find((entry) => entry.action !== 'hold')

  await prisma.bot.update({
    where: { id: bot.id },
    data: {
      focusPair: actionableOpportunity?.pair ?? bot.focusPair ?? null,
      currentPair: bestOpportunity?.pair ?? null,
      recommendedAction: bestOpportunity?.action ?? 'hold',
      confidence: bestOpportunity?.confidence ?? 0,
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

  trace('DEBUG', 'bot', 'analyzeBotInstance', `Analise do bot ${bot.name} concluida`, 0, {
    userId,
    botId,
    currentPair: bestOpportunity?.pair ?? null,
    recommendedAction: bestOpportunity?.action ?? 'hold',
    confidence: bestOpportunity?.confidence ?? 0,
  })

  return {
    botId: bot.id,
    botName: bot.name,
    strategyId,
    templateId: bot.template?.id ?? undefined,
    templateName: bot.template?.name ?? undefined,
    primarySpecialist: runtimeAnalysis.primarySpecialist,
    timeframe: runtimeAnalysis.timeframe,
    generatedAt,
    analyzedPairs: runtimeAnalysis.analyzedPairs,
    summary: runtimeAnalysis.summary,
    bestOpportunity,
    opportunities,
    socialSignals: runtimeAnalysis.socialSignals.slice(0, 5),
  }
}
