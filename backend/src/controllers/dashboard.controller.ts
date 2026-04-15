import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { analyzeBotInstance } from '../services/bot-analysis.service'
import { buildBotDecisionSummary, buildBotPaperReadiness, loadBotPaperReadiness, resolveBotOperationalReadiness } from '../services/bot-decision.service'
import { getBotInstanceById, listBotInstances, listBotTemplates, materializeEditableBotForUser } from '../services/bot-registry.service'
import { isBotWorkerRunning, runBotCycle } from '../services/bot-runner.service'
import { archiveBotModelArtifact, listBotModelArtifacts, promoteBotModelArtifact } from '../services/bot-model-governance.service'
import { getCurrencyRateToBrl } from '../services/market-valuation.service'
import { recordBalanceHistorySnapshotValue } from '../services/portfolio.service'
import { emitDashboardUpdate } from '../services/socket.service'
import { logger } from '../utils/logger'
import { endTrace, startTrace } from '../utils/tracer'

const executionModeSchema = z.enum(['paper', 'semi_auto', 'full_auto'])
const editableStatusSchema = z.enum(['online', 'offline'])
const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '4h', '1d'])

const editableBotParametersSchema = z.object({
  timeframe: timeframeSchema.optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  allowedPairs: z.array(z.string().min(3).max(24)).max(30).optional(),
  stopLossPercent: z.number().min(0).max(50).optional(),
  takeProfitPercent: z.number().min(0).max(100).optional(),
  circuitBreakerDailyLossPercent: z.number().min(0).max(100).optional(),
  circuitBreakerCooldownMinutes: z.number().min(1).max(1440).optional(),
  maxConsecutiveLosses: z.number().int().min(1).max(50).optional(),
  maxPositionSize: z.number().min(0).max(1000000).optional(),
  maxExposurePerCoin: z.number().min(0).max(1).optional(),
  maxTotalExposure: z.number().min(0).max(1).optional(),
  maxConcurrentTrades: z.number().int().min(1).max(50).optional(),
  minCorrelationThreshold: z.number().min(0).max(0.999).optional(),
  atrPeriod: z.number().int().min(5).max(100).optional(),
  targetAtrPercent: z.number().min(0.001).max(1).optional(),
  minAtrPositionFactor: z.number().min(0.05).max(1).optional(),
}).strict()

const createBotSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(280).optional(),
  executionMode: executionModeSchema.default('paper'),
  status: editableStatusSchema.default('offline'),
  parameters: editableBotParametersSchema.default({}),
})

const updateBotSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  executionMode: executionModeSchema.optional(),
  status: editableStatusSchema.optional(),
  isPaused: z.boolean().optional(),
  parameters: editableBotParametersSchema.optional(),
}).strict()

const botHistoryQuerySchema = z.object({
  transactionsLimit: z.coerce.number().int().positive().max(50).default(10),
  tracesLimit: z.coerce.number().int().positive().max(50).default(20),
  sessionsLimit: z.coerce.number().int().positive().max(20).default(5),
  decisionsLimit: z.coerce.number().int().positive().max(100).default(30),
})

const botModelActionSchema = z.object({
  notes: z.string().trim().max(300).optional(),
})

async function getBalancesWithRates(balances: Array<{ currency: string; available: number }>): Promise<{ rateMap: Record<string, number>; usdtBrlRate: number }> {
  const uniqueCurrencies = Array.from(new Set(balances.map((balance) => balance.currency)))
  const rateEntries = await Promise.all(uniqueCurrencies.map(async (currency) => {
    const rate = await getCurrencyRateToBrl(currency).catch(() => 0)
    return [currency, rate] as const
  }))

  const rateMap = Object.fromEntries(rateEntries)
  return {
    rateMap,
    usdtBrlRate: rateMap.USDT ?? 0,
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

function normalizePairs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ))
}

function sanitizeParametersPatch(
  input: Record<string, unknown> | undefined,
  currentParameters: Record<string, unknown>,
): Record<string, unknown> {
  if (!input) {
    return currentParameters
  }

  const nextParameters = {
    ...currentParameters,
    ...input,
  }

  if (Object.prototype.hasOwnProperty.call(input, 'allowedPairs')) {
    nextParameters.allowedPairs = normalizePairs(input.allowedPairs)
  }

  return nextParameters
}

interface BotDetailSource {
  id: string
  userId: string | null
  templateId: string | null
  name: string
  strategyType: string
  description: string | null
  executionMode: string
  isSystemManaged: boolean
  status: string
  isPaused: boolean
  currentPair: string | null
  lastAnalysis: Date | null
  recommendedAction: string | null
  confidence: number | null
  modelVersion: string
  modelUrl: string | null
  parameters: string
  createdAt: Date
  updatedAt: Date
  template?: {
    id: string
    slug: string
    name: string
    strategyType: string
    indicatorType: string | null
    specialization: string | null
    description: string | null
    defaultParameters: string
  } | null
}

async function mapBotDetail(bot: BotDetailSource, configurationAllowedPairs: string[], userId: string) {
  const templateParameters = safeJsonParse<Record<string, unknown>>(bot.template?.defaultParameters, {})
  const instanceParameters = safeJsonParse<Record<string, unknown>>(bot.parameters, {})
  const instanceAllowedPairs = normalizePairs(instanceParameters.allowedPairs)
  const effectiveAllowedPairs = instanceAllowedPairs.length > 0 ? instanceAllowedPairs : configurationAllowedPairs
  const effectiveParameters = {
    ...templateParameters,
    ...instanceParameters,
    allowedPairs: effectiveAllowedPairs,
  }
  const readiness = await resolveBotOperationalReadiness(bot.modelUrl)
  const paperReadiness = await loadBotPaperReadiness(userId, bot.id)

  return {
    id: bot.id,
    userId: bot.userId ?? undefined,
    name: bot.name,
    strategyType: bot.template?.strategyType ?? bot.strategyType,
    strategyId: bot.template?.id ?? `strategy_${bot.strategyType}`,
    templateId: bot.template?.id ?? bot.templateId ?? undefined,
    executionMode: bot.executionMode,
    isSystemManaged: bot.isSystemManaged,
    isCustom: bot.userId !== null,
    status: bot.status,
    isPaused: bot.isPaused,
    currentPair: bot.currentPair ?? undefined,
    lastAnalysis: bot.lastAnalysis?.toISOString(),
    recommendedAction: ['buy', 'sell', 'hold'].includes(bot.recommendedAction ?? '')
      ? bot.recommendedAction
      : undefined,
    confidence: bot.confidence ?? undefined,
    description: bot.description ?? bot.template?.description ?? undefined,
    modelVersion: bot.modelVersion,
    modelUrl: bot.modelUrl ?? undefined,
    hasModel: readiness.hasModel,
    modelReady: readiness.modelReady,
    modelArchitecture: readiness.modelArchitecture,
    validationStrategy: readiness.validationStrategy,
    forecastHorizonCandles: readiness.forecastHorizonCandles,
    operationalBlockReason: readiness.operationalBlockReason,
    paperReadiness,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
    template: bot.template
      ? {
          id: bot.template.id,
          slug: bot.template.slug,
          name: bot.template.name,
          strategyType: bot.template.strategyType,
          indicatorType: bot.template.indicatorType ?? undefined,
          specialization: bot.template.specialization ?? undefined,
          description: bot.template.description ?? undefined,
        }
      : undefined,
    templateParameters,
    instanceParameters,
    effectiveParameters,
    effectiveAllowedPairs,
    allowedPairsSource: instanceAllowedPairs.length > 0 ? 'instance' : 'global',
  }
}

async function ensureBotCanGoOnline(bot: {
  modelUrl: string | null
  name: string
}, status: 'online' | 'offline') {
  if (status !== 'online') {
    return null
  }

  const readiness = await resolveBotOperationalReadiness(bot.modelUrl)
  if (!readiness.modelReady) {
    return readiness.operationalBlockReason ?? `O bot ${bot.name} ainda não possui um modelo pronto para operação.`
  }

  return null
}

export async function getTotalBalance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getTotalBalance', 'dashboard')

  try {
    const userId = req.userId!
    const balances = await prisma.balance.findMany({ where: { userId } })
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const recentTransactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed', date: { gte: oneDayAgo }, profitBrl: { not: null } },
    })

    const allTransactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed', profitBrl: { not: null } },
    })

    const last100Transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed', profitBrl: { not: null } },
      orderBy: { date: 'desc' },
      take: 100,
    })

    const { rateMap, usdtBrlRate } = await getBalancesWithRates(balances)
    const totalBrl = balances.reduce((sum: number, balance: any) => {
      const rate = rateMap[balance.currency] ?? 0
      return sum + (balance.available * rate)
    }, 0)

    const dailyProfitBrl = recentTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
    const totalPnlBrl = allTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
    const winningTrades = last100Transactions.filter((transaction: any) => (transaction.profitBrl || 0) > 0).length
    const hitRate = last100Transactions.length > 0 ? (winningTrades / last100Transactions.length) * 100 : 0
    const previousTotalBrl = totalBrl - dailyProfitBrl
    const dailyProfitPercent = previousTotalBrl > 0 ? (dailyProfitBrl / previousTotalBrl) * 100 : 0
    const initialTotalBrl = totalBrl - totalPnlBrl
    const totalPnlPercent = initialTotalBrl > 0 ? (totalPnlBrl / initialTotalBrl) * 100 : 0

    await recordBalanceHistorySnapshotValue(userId, totalBrl).catch((snapshotError) => {
      logger.warn('[dashboard] Falha ao registrar snapshot ao consultar saldo total', {
        module: 'dashboard',
        event: 'balance_snapshot_dashboard_failed',
        userId,
        error: snapshotError,
        skipPersistence: true,
      })
    })

    endTrace('getTotalBalance', { userId })
    return res.json({
      success: true,
      data: {
        totalBrl,
        dailyProfitBrl,
        dailyProfitPercent,
        totalPnlBrl,
        totalPnlPercent,
        hitRate,
        usdtBrlRate,
        lastUpdate: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar saldo total', {
      module: 'dashboard',
      event: 'dashboard_total_balance_error',
      userId: req.userId,
      error,
    })

    endTrace('getTotalBalance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getCurrenciesBalance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getCurrenciesBalance', 'dashboard')

  try {
    const userId = req.userId!
    const balances = await prisma.balance.findMany({ where: { userId } })
    const currencies = ['BTC', 'ETH', 'SOL', 'USDT']
    const { rateMap, usdtBrlRate } = await getBalancesWithRates(balances)
    const result = []

    for (const currency of currencies) {
      const balance = balances.find((entry: any) => entry.currency === currency)
      if (!balance || balance.available === 0) {
        continue
      }

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const dailyTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          profitBrl: { not: null },
          date: { gte: oneDayAgo },
          pair: { contains: currency },
        },
      })

      const allTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          profitBrl: { not: null },
          pair: { contains: currency },
        },
      })

      const last100Transactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          profitBrl: { not: null },
          pair: { contains: currency },
        },
        orderBy: { date: 'desc' },
        take: 100,
      })

      const dailyProfitBrl = dailyTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
      const totalPnlBrl = allTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
      const winningTrades = last100Transactions.filter((transaction: any) => (transaction.profitBrl || 0) > 0).length
      const hitRate = last100Transactions.length > 0 ? (winningTrades / last100Transactions.length) * 100 : 0

      const balanceBrl = balance.available * (rateMap[currency] ?? 0)
      const previousBalanceBrl = balanceBrl - dailyProfitBrl
      const dailyProfitPercent = previousBalanceBrl > 0 ? (dailyProfitBrl / previousBalanceBrl) * 100 : 0
      const initialBalanceBrl = balanceBrl - totalPnlBrl
      const totalPnlPercent = initialBalanceBrl > 0 ? (totalPnlBrl / initialBalanceBrl) * 100 : 0

      result.push({
        currency,
        balanceBrl,
        dailyProfitBrl,
        dailyProfitPercent,
        totalPnlBrl,
        totalPnlPercent,
        hitRate,
        usdtBrlRate,
      })
    }

    endTrace('getCurrenciesBalance', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar saldo por moeda', {
      module: 'dashboard',
      event: 'dashboard_currencies_balance_error',
      userId: req.userId,
      error,
    })

    endTrace('getCurrenciesBalance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getRecentTransactions(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getRecentTransactions', 'dashboard')

  try {
    const userId = req.userId!
    const limit = parseInt(req.query.limit as string, 10) || 5

    const transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        bot: {
          select: { name: true },
        },
      },
    })

    const result = transactions.map((transaction: any) => ({
      id: transaction.id,
      date: transaction.date,
      pair: transaction.pair,
      type: transaction.type,
      entryPrice: Number(transaction.price ?? 0),
      exitPrice: Number(transaction.price ?? 0),
      amount: transaction.quantity,
      fee: transaction.fee,
      profitBrl: transaction.profitBrl ?? 0,
      profitPercent: transaction.profitPercent ?? 0,
      botId: transaction.botId ?? undefined,
      botName: transaction.bot?.name ?? undefined,
    }))

    endTrace('getRecentTransactions', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar transações recentes', {
      module: 'dashboard',
      event: 'dashboard_recent_transactions_error',
      userId: req.userId,
      error,
    })

    endTrace('getRecentTransactions', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotsStatus(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotsStatus', 'dashboard')

  try {
    const userId = req.userId!
    const bots = await listBotInstances(userId)
    const result = await Promise.all(bots.map(async (bot) => {
      const [readiness, paperReadiness] = await Promise.all([
        resolveBotOperationalReadiness(bot.modelUrl),
        loadBotPaperReadiness(userId, bot.id),
      ])

      return {
        id: bot.id,
        userId: bot.userId,
        name: bot.name,
        strategy: bot.strategyType,
        strategyId: bot.strategyId,
        templateId: bot.templateId,
        templateSlug: bot.templateSlug,
        templateName: bot.templateName,
        indicatorType: bot.indicatorType,
        specialization: bot.specialization,
        executionMode: bot.executionMode,
        isSystemManaged: bot.isSystemManaged,
        description: bot.description,
        currentPair: bot.currentPair,
        status: bot.status,
        isPaused: bot.isPaused,
        recommendedAction: bot.recommendedAction,
        confidence: bot.confidence,
        lastAnalysis: bot.lastAnalysis,
        modelVersion: bot.modelVersion,
        modelUrl: bot.modelUrl,
        hasModel: readiness.hasModel,
        modelReady: readiness.modelReady,
        modelArchitecture: readiness.modelArchitecture,
        validationStrategy: readiness.validationStrategy,
        forecastHorizonCandles: readiness.forecastHorizonCandles,
        operationalBlockReason: readiness.operationalBlockReason,
        paperReadiness,
      }
    }))

    endTrace('getBotsStatus', { userId: req.userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar status dos bots', {
      module: 'dashboard',
      event: 'dashboard_bots_status_error',
      userId: req.userId,
      error,
    })

    endTrace('getBotsStatus', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotTemplates(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotTemplates', 'dashboard')

  try {
    const templates = await listBotTemplates()

    endTrace('getBotTemplates', { userId: req.userId })
    return res.json({ success: true, data: templates })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar templates de bots', {
      module: 'dashboard',
      event: 'dashboard_bot_templates_error',
      userId: req.userId,
      error,
    })

    endTrace('getBotTemplates', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotDetail(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotDetail', 'dashboard')

  try {
    const { id } = req.params
    const userId = req.userId!
    const bot = await getBotInstanceById(userId, id)

    if (!bot) {
      endTrace('getBotDetail', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    const configuration = await prisma.configuration.findUnique({
      where: { userId },
      select: { allowedPairs: true },
    })
    const configurationAllowedPairs = normalizePairs(
      safeJsonParse(configuration?.allowedPairs, []),
    )

    endTrace('getBotDetail', { userId, botId: id })
    return res.json({
      success: true,
      data: await mapBotDetail(bot, configurationAllowedPairs, userId),
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar detalhe do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_detail_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('getBotDetail', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotHistory(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotHistory', 'dashboard')

  try {
    const userId = req.userId!
    const { id } = req.params
    const validation = botHistoryQuerySchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('getBotHistory', { userId, botId: id, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const bot = await getBotInstanceById(userId, id)
    if (!bot) {
      endTrace('getBotHistory', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    const { transactionsLimit, tracesLimit, sessionsLimit, decisionsLimit } = validation.data
    const [transactions, traces, trainingSessions, decisions] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, botId: bot.id },
        orderBy: { date: 'desc' },
        take: transactionsLimit,
      }),
      prisma.trace.findMany({
        where: { userId, botId: bot.id },
        orderBy: { timestamp: 'desc' },
        take: tracesLimit,
      }),
      prisma.trainingSession.findMany({
        where: { userId, botId: bot.id },
        orderBy: { updatedAt: 'desc' },
        take: sessionsLimit,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          bestEpoch: true,
          bestValLoss: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.botDecision.findMany({
        where: { userId, botId: bot.id },
        orderBy: { createdAt: 'desc' },
        take: decisionsLimit,
        select: {
          id: true,
          pair: true,
          action: true,
          confidence: true,
          reason: true,
          timeframe: true,
          executionMode: true,
          executionStatus: true,
          modelVersion: true,
          modelUrl: true,
          modelArchitecture: true,
          horizonCandles: true,
          decisionPrice: true,
          requestedQuantity: true,
          executedQuantity: true,
          transactionId: true,
          slippagePercent: true,
          simulatedLatencyMs: true,
          simulatedFillPercent: true,
          createdAt: true,
          dueAt: true,
          evaluatedAt: true,
          evaluationStatus: true,
          evaluationPrice: true,
          marketReturnPercent: true,
          strategyReturnPercent: true,
          realizedEdgePercent: true,
          actualLabel: true,
          expectedLabel: true,
          isCorrect: true,
        },
      }),
    ])

    endTrace('getBotHistory', { userId, botId: bot.id })
    return res.json({
      success: true,
      data: {
        botId: bot.id,
        transactions: transactions.map((transaction) => ({
          id: transaction.id,
          date: transaction.date.toISOString(),
          pair: transaction.pair,
          type: transaction.type,
          quantity: transaction.quantity,
          requestedQuantity: transaction.requestedQuantity,
          price: transaction.price,
          total: transaction.total,
          fee: transaction.fee,
          feeCurrency: transaction.feeCurrency,
          status: transaction.status,
          orderType: transaction.orderType,
          origin: transaction.origin,
          profitBrl: transaction.profitBrl,
          profitPercent: transaction.profitPercent,
          externalStatus: transaction.externalStatus ?? undefined,
          syncedAt: transaction.syncedAt?.toISOString(),
        })),
        traces: traces.map((trace) => ({
          id: trace.id,
          timestamp: trace.timestamp.toISOString(),
          level: trace.level,
          module: trace.module,
          traceId: trace.traceId,
          functionName: trace.functionName,
          message: trace.message,
          durationMs: trace.durationMs,
          currentPair: trace.currentPair ?? undefined,
          recommendedAction: trace.recommendedAction ?? undefined,
          confidence: trace.confidence ?? undefined,
          errorFlag: trace.errorFlag,
        })),
        trainingSessions: trainingSessions.map((session) => ({
          id: session.id,
          status: session.status,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString(),
          bestEpoch: session.bestEpoch ?? undefined,
          bestValLoss: session.bestValLoss ?? undefined,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
        })),
        decisions: decisions.map((decision) => ({
          id: decision.id,
          pair: decision.pair,
          action: decision.action,
          confidence: decision.confidence,
          reason: decision.reason,
          timeframe: decision.timeframe,
          executionMode: decision.executionMode,
          executionStatus: decision.executionStatus,
          modelVersion: decision.modelVersion ?? undefined,
          modelUrl: decision.modelUrl ?? undefined,
          modelArchitecture: decision.modelArchitecture ?? undefined,
          horizonCandles: decision.horizonCandles,
          decisionPrice: decision.decisionPrice,
          requestedQuantity: decision.requestedQuantity ?? undefined,
          executedQuantity: decision.executedQuantity ?? undefined,
          transactionId: decision.transactionId ?? undefined,
          slippagePercent: decision.slippagePercent ?? undefined,
          simulatedLatencyMs: decision.simulatedLatencyMs ?? undefined,
          simulatedFillPercent: decision.simulatedFillPercent ?? undefined,
          createdAt: decision.createdAt.toISOString(),
          dueAt: decision.dueAt.toISOString(),
          evaluatedAt: decision.evaluatedAt?.toISOString(),
          evaluationStatus: decision.evaluationStatus,
          evaluationPrice: decision.evaluationPrice ?? undefined,
          marketReturnPercent: decision.marketReturnPercent ?? undefined,
          strategyReturnPercent: decision.strategyReturnPercent ?? undefined,
          realizedEdgePercent: decision.realizedEdgePercent ?? undefined,
          actualLabel: decision.actualLabel ?? undefined,
          expectedLabel: decision.expectedLabel ?? undefined,
          isCorrect: decision.isCorrect ?? undefined,
        })),
        decisionSummary: buildBotDecisionSummary(decisions),
        paperReadiness: buildBotPaperReadiness(decisions),
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar histórico do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_history_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('getBotHistory', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotModels(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotModels', 'dashboard')

  try {
    const userId = req.userId!
    const { id } = req.params
    const bot = await getBotInstanceById(userId, id)

    if (!bot) {
      endTrace('getBotModels', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    const items = await listBotModelArtifacts(userId, bot.id)

    endTrace('getBotModels', { userId, botId: bot.id })
    return res.json({
      success: true,
      data: {
        botId: bot.id,
        items,
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar catálogo de modelos do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_models_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('getBotModels', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function promoteBotModel(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'promoteBotModel', 'dashboard')

  try {
    const validation = botModelActionSchema.safeParse(req.body ?? {})
    if (!validation.success) {
      endTrace('promoteBotModel', { userId: req.userId, botId: req.params.id, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const promoted = await promoteBotModelArtifact({
      userId,
      botId: req.params.id,
      artifactId: req.params.modelId,
      notes: validation.data.notes,
    })

    if (!promoted) {
      endTrace('promoteBotModel', { userId, botId: req.params.id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Modelo não encontrado para este bot' })
    }

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_model_promoted',
      botId: req.params.id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('promoteBotModel', { userId, botId: req.params.id })
    return res.json({ success: true, data: promoted })
  } catch (error) {
    logger.error('[dashboard] Erro ao promover modelo do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_model_promote_error',
      userId: req.userId,
      botId: req.params.id,
      modelId: req.params.modelId,
      error,
    })

    endTrace('promoteBotModel', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function archiveBotModel(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'archiveBotModel', 'dashboard')

  try {
    const validation = botModelActionSchema.safeParse(req.body ?? {})
    if (!validation.success) {
      endTrace('archiveBotModel', { userId: req.userId, botId: req.params.id, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const archived = await archiveBotModelArtifact({
      userId,
      botId: req.params.id,
      artifactId: req.params.modelId,
      notes: validation.data.notes,
    })

    if (!archived) {
      endTrace('archiveBotModel', { userId, botId: req.params.id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Modelo não encontrado para este bot' })
    }

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_model_archived',
      botId: req.params.id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('archiveBotModel', { userId, botId: req.params.id })
    return res.json({ success: true, data: archived })
  } catch (error) {
    logger.error('[dashboard] Erro ao arquivar modelo do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_model_archive_error',
      userId: req.userId,
      botId: req.params.id,
      modelId: req.params.modelId,
      error,
    })

    if (error instanceof Error) {
      endTrace('archiveBotModel', { userId: req.userId, botId: req.params.id, errorFlag: true })
      return res.status(400).json({ success: false, error: error.message })
    }

    endTrace('archiveBotModel', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function createBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'createBot', 'dashboard')

  try {
    const validation = createBotSchema.safeParse(req.body)
    if (!validation.success) {
      endTrace('createBot', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const payload = validation.data
    const template = await prisma.botTemplate.findFirst({
      where: {
        id: payload.templateId,
        isActive: true,
      },
    })

    if (!template) {
      endTrace('createBot', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Template de bot não encontrado' })
    }

    const onlineGuardError = await ensureBotCanGoOnline({ modelUrl: null, name: payload.name }, payload.status)
    if (onlineGuardError) {
      endTrace('createBot', { userId, errorFlag: true })
      return res.status(400).json({ success: false, error: onlineGuardError })
    }

    const createdBot = await prisma.bot.create({
      data: {
        userId,
        templateId: template.id,
        name: payload.name,
        strategyType: template.strategyType,
        description: payload.description ?? template.description,
        executionMode: payload.executionMode,
        isSystemManaged: false,
        status: payload.status,
        isPaused: false,
        parameters: JSON.stringify({
          ...payload.parameters,
          allowedPairs: normalizePairs(payload.parameters.allowedPairs),
        }),
      },
      include: {
        template: true,
      },
    })

    const configuration = await prisma.configuration.findUnique({
      where: { userId },
      select: { allowedPairs: true },
    })
    const configurationAllowedPairs = normalizePairs(safeJsonParse(configuration?.allowedPairs, []))

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_created',
      botId: createdBot.id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('createBot', { userId, botId: createdBot.id })
    return res.status(201).json({
      success: true,
      data: await mapBotDetail(createdBot, configurationAllowedPairs, userId),
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao criar bot customizado', {
      module: 'dashboard',
      event: 'dashboard_bot_create_error',
      userId: req.userId,
      error,
    })

    endTrace('createBot', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function updateBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'updateBot', 'dashboard')

  try {
    const validation = updateBotSchema.safeParse(req.body)
    if (!validation.success) {
      endTrace('updateBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const { id } = req.params
    const materializedBot = await materializeEditableBotForUser(userId, id)

    if (!materializedBot) {
      endTrace('updateBot', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    const currentParameters = safeJsonParse<Record<string, unknown>>(materializedBot.bot.parameters, {})
    const nextParameters = sanitizeParametersPatch(validation.data.parameters, currentParameters)
    const nextStatus = validation.data.status ?? materializedBot.bot.status as 'online' | 'offline'
    const onlineGuardError = await ensureBotCanGoOnline(materializedBot.bot, nextStatus)
    if (validation.data.status === 'online' && onlineGuardError) {
      endTrace('updateBot', { userId, botId: id, errorFlag: true })
      return res.status(400).json({ success: false, error: onlineGuardError })
    }

    const updatedBot = await prisma.bot.update({
      where: { id: materializedBot.bot.id },
      data: {
        name: validation.data.name ?? materializedBot.bot.name,
        description: Object.prototype.hasOwnProperty.call(validation.data, 'description')
          ? validation.data.description
          : materializedBot.bot.description,
        executionMode: validation.data.executionMode ?? materializedBot.bot.executionMode,
        status: validation.data.status ?? materializedBot.bot.status,
        isPaused: validation.data.isPaused ?? materializedBot.bot.isPaused,
        parameters: JSON.stringify(nextParameters),
        updatedAt: new Date(),
      },
      include: {
        template: true,
      },
    })

    const configuration = await prisma.configuration.findUnique({
      where: { userId },
      select: { allowedPairs: true },
    })
    const configurationAllowedPairs = normalizePairs(safeJsonParse(configuration?.allowedPairs, []))

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: materializedBot.materialized ? 'bot_materialized' : 'bot_updated',
      botId: updatedBot.id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('updateBot', { userId, botId: updatedBot.id })
    return res.json({
      success: true,
      data: {
        ...(await mapBotDetail(updatedBot, configurationAllowedPairs, userId)),
        materializedFromTemplate: materializedBot.materialized,
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao atualizar bot', {
      module: 'dashboard',
      event: 'dashboard_bot_update_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('updateBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function deleteBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'deleteBot', 'dashboard')

  try {
    const userId = req.userId!
    const { id } = req.params
    const ownedBot = await prisma.bot.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!ownedBot) {
      const sharedBot = await prisma.bot.findFirst({
        where: {
          id,
          userId: null,
        },
      })

      endTrace('deleteBot', { userId, botId: id, errorFlag: true })
      return res.status(sharedBot ? 400 : 404).json({
        success: false,
        error: sharedBot
          ? 'Bots do sistema não podem ser excluídos; crie uma instância customizada para editar'
          : 'Bot não encontrado',
      })
    }

    await prisma.bot.delete({
      where: { id: ownedBot.id },
    })

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_deleted',
      botId: ownedBot.id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('deleteBot', { userId, botId: ownedBot.id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[dashboard] Erro ao excluir bot', {
      module: 'dashboard',
      event: 'dashboard_bot_delete_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('deleteBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotAnalysis(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotAnalysis', 'dashboard')

  try {
    const { id } = req.params
    const limit = Number.parseInt(req.query.limit as string, 10)
    const analysis = await analyzeBotInstance(req.userId!, id, {
      pairLimit: Number.isFinite(limit) && limit > 0 ? limit : 6,
    })

    if (!analysis) {
      endTrace('getBotAnalysis', { userId: req.userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    endTrace('getBotAnalysis', { userId: req.userId, botId: id })
    return res.json({ success: true, data: analysis })
  } catch (error) {
    logger.error('[dashboard] Erro ao analisar bot', {
      module: 'dashboard',
      event: 'dashboard_bot_analysis_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('getBotAnalysis', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function runBotCycleNow(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'runBotCycleNow', 'dashboard')

  try {
    const { id } = req.params
    const result = await runBotCycle(id, req.userId!)

    if (!result) {
      endTrace('runBotCycleNow', { userId: req.userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado ou já em processamento' })
    }

    endTrace('runBotCycleNow', { userId: req.userId, botId: id })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao executar ciclo manual do bot', {
      module: 'dashboard',
      event: 'dashboard_bot_run_cycle_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('runBotCycleNow', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotWorkerStatus(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotWorkerStatus', 'dashboard')

  try {
    endTrace('getBotWorkerStatus', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        running: isBotWorkerRunning(),
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao consultar status do worker de bots', {
      module: 'dashboard',
      event: 'dashboard_bot_worker_status_error',
      userId: req.userId,
      error,
    })

    endTrace('getBotWorkerStatus', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function pauseBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'pauseBot', 'dashboard')

  try {
    const { id } = req.params
    const userId = req.userId!
    const bot = await getBotInstanceById(userId, id)

    if (!bot) {
      endTrace('pauseBot', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    await prisma.bot.update({
      where: { id: bot.id },
      data: { isPaused: true, updatedAt: new Date() },
    })

    logger.info('[dashboard] Bot pausado', {
      module: 'dashboard',
      event: 'bot_paused',
      userId,
      botId: id,
    })

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_paused',
      botId: id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('pauseBot', { userId, botId: id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[dashboard] Erro ao pausar bot', {
      module: 'dashboard',
      event: 'pause_bot_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('pauseBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function resumeBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'resumeBot', 'dashboard')

  try {
    const { id } = req.params
    const userId = req.userId!
    const bot = await getBotInstanceById(userId, id)

    if (!bot) {
      endTrace('resumeBot', { userId, botId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot não encontrado' })
    }

    await prisma.bot.update({
      where: { id: bot.id },
      data: { isPaused: false, updatedAt: new Date() },
    })

    logger.info('[dashboard] Bot retomado', {
      module: 'dashboard',
      event: 'bot_resumed',
      userId,
      botId: id,
    })

    emitDashboardUpdate(userId, {
      scope: 'bots',
      reason: 'bot_resumed',
      botId: id,
      updatedAt: new Date().toISOString(),
    })

    endTrace('resumeBot', { userId, botId: id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[dashboard] Erro ao retomar bot', {
      module: 'dashboard',
      event: 'resume_bot_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('resumeBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getPerformance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getPerformance', 'dashboard')

  try {
    const userId = req.userId!
    const period = (req.query.period as string) || '7d'

    let startDate: Date
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(0)
        break
    }

    const history = await prisma.balanceHistory.findMany({
      where: { userId, timestamp: { gte: startDate } },
      orderBy: { timestamp: 'asc' },
    })

    const data = history.map((entry: any) => ({
      timestamp: entry.timestamp,
      balance: entry.totalBrl,
    }))

    endTrace('getPerformance', { userId })
    return res.json({ success: true, data: { period, data } })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar dados de performance', {
      module: 'dashboard',
      event: 'dashboard_performance_error',
      userId: req.userId,
      error,
    })

    endTrace('getPerformance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
