import { prisma } from '../config/database'
import { getTickerPrice } from './binance.service'
import { readTrainingModelArtifactJson } from './training-model.service'
import { logger } from '../utils/logger'

type BotDecisionAction = 'buy' | 'sell' | 'hold'
type BotDecisionExecutionStatus = 'skipped' | 'suggested' | 'submitted' | 'executed'

export interface BotModelContext {
  modelVersion?: string
  modelUrl?: string
  architecture?: string
  validationStrategy?: string
  horizonCandles: number
  buyThresholdPercent: number
  sellThresholdPercent: number
  hasEnginePackage: boolean
}

export interface BotOperationalReadiness {
  hasModel: boolean
  modelReady: boolean
  modelVersion?: string
  modelUrl?: string
  modelArchitecture?: string
  validationStrategy?: string
  forecastHorizonCandles?: number
  buyThresholdPercent?: number
  sellThresholdPercent?: number
  hasEnginePackage: boolean
  operationalBlockReason?: string
}

export interface RecordBotDecisionInput {
  userId: string
  botId: string
  pair: string
  action: BotDecisionAction
  confidence: number
  reason: string
  timeframe: string
  executionMode: string
  executionStatus: BotDecisionExecutionStatus
  decisionPrice: number
  requestedQuantity?: number
  executedQuantity?: number
  transactionId?: string
  slippagePercent?: number
  simulatedLatencyMs?: number
  simulatedFillPercent?: number
  modelVersion?: string
  modelUrl?: string
  modelArchitecture?: string
  horizonCandles: number
  buyThresholdPercent: number
  sellThresholdPercent: number
  createdAt?: Date
}

export interface BotDecisionSummary {
  total: number
  pending: number
  evaluated: number
  correct: number
  accuracyPercent: number
  averageConfidence: number
  averageMarketReturnPercent: number
  averageStrategyReturnPercent: number
  bestEdgePercent: number
  worstEdgePercent: number
}

export interface BotPaperReadiness {
  readyForFullAuto: boolean
  evaluatedSignals: number
  pendingSignals: number
  minimumEvaluatedSignals: number
  accuracyPercent: number
  minimumAccuracyPercent: number
  averageStrategyReturnPercent: number
  minimumAverageStrategyReturnPercent: number
  averageEdgePercent: number
  minimumAverageEdgePercent: number
  maxObservedDrawdownPercent: number
  maximumDrawdownPercent: number
  maxConsecutiveIncorrect: number
  currentConsecutiveIncorrect: number
  maximumConsecutiveIncorrect: number
  lastEvaluatedAt?: string
  blockers: string[]
}

const TIMEFRAME_TO_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
}

function toFixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function readNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveTimeframeMs(timeframe: string): number {
  return TIMEFRAME_TO_MS[timeframe] ?? TIMEFRAME_TO_MS['1h']
}

function resolveDueAt(timeframe: string, horizonCandles: number, createdAt: Date): Date {
  return new Date(createdAt.getTime() + (resolveTimeframeMs(timeframe) * Math.max(1, horizonCandles)))
}

function resolveActualLabel(
  marketReturnPercent: number,
  buyThresholdPercent: number,
  sellThresholdPercent: number,
): BotDecisionAction {
  if (marketReturnPercent >= buyThresholdPercent) {
    return 'buy'
  }

  if (marketReturnPercent <= sellThresholdPercent) {
    return 'sell'
  }

  return 'hold'
}

function resolveStrategyReturnPercent(action: BotDecisionAction, marketReturnPercent: number): number {
  if (action === 'buy') {
    return marketReturnPercent
  }

  if (action === 'sell') {
    return -marketReturnPercent
  }

  return -Math.abs(marketReturnPercent)
}

export async function getBotModelContext(modelUrl?: string | null): Promise<BotModelContext | null> {
  if (!modelUrl) {
    return null
  }

  try {
    const artifact = await readTrainingModelArtifactJson(modelUrl)
    return {
      modelVersion: artifact.modelVersion,
      modelUrl,
      architecture: artifact.summary.architecture ?? artifact.enginePackage?.architecture,
      validationStrategy: artifact.summary.validationStrategy,
      horizonCandles: artifact.evaluation?.labelConfiguration?.horizonCandles ?? artifact.reproducibility.forecastHorizonCandles ?? 5,
      buyThresholdPercent: artifact.evaluation?.labelConfiguration?.buyThresholdPercent ?? artifact.reproducibility.buyThresholdPercent ?? 0.3,
      sellThresholdPercent: artifact.evaluation?.labelConfiguration?.sellThresholdPercent ?? artifact.reproducibility.sellThresholdPercent ?? -0.3,
      hasEnginePackage: Boolean(artifact.enginePackage?.payloadBase64),
    }
  } catch (error) {
    logger.warn('[bot] Falha ao ler metadados do artefato do modelo', {
      module: 'bot',
      event: 'bot_model_context_read_failed',
      modelUrl,
      error,
      skipPersistence: true,
    })
    return null
  }
}

export async function resolveBotOperationalReadiness(modelUrl?: string | null): Promise<BotOperationalReadiness> {
  if (!modelUrl) {
    return {
      hasModel: false,
      modelReady: false,
      hasEnginePackage: false,
      operationalBlockReason: 'Associe um modelo treinado e salvo antes de colocar este bot em operação contínua.',
    }
  }

  const modelContext = await getBotModelContext(modelUrl)
  if (!modelContext) {
    return {
      hasModel: true,
      modelReady: false,
      modelUrl,
      hasEnginePackage: false,
      operationalBlockReason: 'Não foi possível ler o artefato do modelo salvo para uso operacional.',
    }
  }

  if (!modelContext.hasEnginePackage) {
    return {
      hasModel: true,
      modelReady: false,
      modelVersion: modelContext.modelVersion,
      modelUrl,
      modelArchitecture: modelContext.architecture,
      validationStrategy: modelContext.validationStrategy,
      forecastHorizonCandles: modelContext.horizonCandles,
      buyThresholdPercent: modelContext.buyThresholdPercent,
      sellThresholdPercent: modelContext.sellThresholdPercent,
      hasEnginePackage: false,
      operationalBlockReason: 'O modelo salvo ainda não possui engine executável para operar em paper, semi_auto ou full_auto.',
    }
  }

  return {
    hasModel: true,
    modelReady: true,
    modelVersion: modelContext.modelVersion,
    modelUrl,
    modelArchitecture: modelContext.architecture,
    validationStrategy: modelContext.validationStrategy,
    forecastHorizonCandles: modelContext.horizonCandles,
    buyThresholdPercent: modelContext.buyThresholdPercent,
    sellThresholdPercent: modelContext.sellThresholdPercent,
    hasEnginePackage: true,
  }
}

export async function recordBotDecision(input: RecordBotDecisionInput) {
  const createdAt = input.createdAt ?? new Date()
  return prisma.botDecision.create({
    data: {
      userId: input.userId,
      botId: input.botId,
      pair: input.pair,
      action: input.action,
      confidence: input.confidence,
      reason: input.reason,
      timeframe: input.timeframe,
      executionMode: input.executionMode,
      executionStatus: input.executionStatus,
      modelVersion: input.modelVersion ?? null,
      modelUrl: input.modelUrl ?? null,
      modelArchitecture: input.modelArchitecture ?? null,
      horizonCandles: input.horizonCandles,
      buyThresholdPercent: input.buyThresholdPercent,
      sellThresholdPercent: input.sellThresholdPercent,
      decisionPrice: input.decisionPrice,
      requestedQuantity: input.requestedQuantity ?? null,
      executedQuantity: input.executedQuantity ?? null,
      transactionId: input.transactionId ?? null,
      slippagePercent: input.slippagePercent ?? null,
      simulatedLatencyMs: input.simulatedLatencyMs ?? null,
      simulatedFillPercent: input.simulatedFillPercent ?? null,
      createdAt,
      dueAt: resolveDueAt(input.timeframe, input.horizonCandles, createdAt),
      expectedLabel: input.action,
    },
  })
}

async function evaluateBotDecision(decision: {
  id: string
  pair: string
  action: string
  decisionPrice: number
  buyThresholdPercent: number
  sellThresholdPercent: number
}): Promise<void> {
  const evaluationPrice = await getTickerPrice(decision.pair)
  if (!Number.isFinite(evaluationPrice) || evaluationPrice <= 0 || decision.decisionPrice <= 0) {
    return
  }

  const marketReturnPercent = ((evaluationPrice - decision.decisionPrice) / decision.decisionPrice) * 100
  const actualLabel = resolveActualLabel(
    marketReturnPercent,
    decision.buyThresholdPercent,
    decision.sellThresholdPercent,
  )
  const expectedLabel = ['buy', 'sell', 'hold'].includes(decision.action)
    ? decision.action as BotDecisionAction
    : 'hold'
  const strategyReturnPercent = resolveStrategyReturnPercent(expectedLabel, marketReturnPercent)
  const isCorrect = expectedLabel === actualLabel

  await prisma.botDecision.update({
    where: { id: decision.id },
    data: {
      evaluatedAt: new Date(),
      evaluationStatus: 'evaluated',
      evaluationPrice,
      marketReturnPercent: toFixedNumber(marketReturnPercent, 4),
      strategyReturnPercent: toFixedNumber(strategyReturnPercent, 4),
      realizedEdgePercent: toFixedNumber(strategyReturnPercent - marketReturnPercent, 4),
      actualLabel,
      expectedLabel,
      isCorrect,
    },
  })
}

export async function evaluatePendingBotDecisions(limit: number = 25): Promise<number> {
  const dueDecisions = await prisma.botDecision.findMany({
    where: {
      evaluationStatus: 'pending',
      dueAt: { lte: new Date() },
    },
    orderBy: { dueAt: 'asc' },
    take: limit,
    select: {
      id: true,
      pair: true,
      action: true,
      decisionPrice: true,
      buyThresholdPercent: true,
      sellThresholdPercent: true,
    },
  })

  let evaluated = 0

  for (const decision of dueDecisions) {
    try {
      await evaluateBotDecision(decision)
      evaluated += 1
    } catch (error) {
      logger.warn('[bot] Falha ao avaliar decisão pendente do bot', {
        module: 'bot',
        event: 'bot_decision_evaluation_failed',
        decisionId: decision.id,
        pair: decision.pair,
        error,
        skipPersistence: true,
      })
    }
  }

  return evaluated
}

export function buildBotDecisionSummary(decisions: Array<{
  evaluationStatus: string
  isCorrect: boolean | null
  confidence: number
  marketReturnPercent: number | null
  strategyReturnPercent: number | null
  realizedEdgePercent: number | null
}>): BotDecisionSummary {
  const pending = decisions.filter((decision) => decision.evaluationStatus === 'pending').length
  const evaluatedDecisions = decisions.filter((decision) => decision.evaluationStatus === 'evaluated')
  const correct = evaluatedDecisions.filter((decision) => decision.isCorrect).length
  const averageConfidence = decisions.length > 0
    ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
    : 0
  const averageMarketReturnPercent = evaluatedDecisions.length > 0
    ? evaluatedDecisions.reduce((sum, decision) => sum + (decision.marketReturnPercent ?? 0), 0) / evaluatedDecisions.length
    : 0
  const averageStrategyReturnPercent = evaluatedDecisions.length > 0
    ? evaluatedDecisions.reduce((sum, decision) => sum + (decision.strategyReturnPercent ?? 0), 0) / evaluatedDecisions.length
    : 0
  const edgeValues = evaluatedDecisions
    .map((decision) => decision.realizedEdgePercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  return {
    total: decisions.length,
    pending,
    evaluated: evaluatedDecisions.length,
    correct,
    accuracyPercent: evaluatedDecisions.length > 0 ? toFixedNumber((correct / evaluatedDecisions.length) * 100, 2) : 0,
    averageConfidence: toFixedNumber(averageConfidence, 2),
    averageMarketReturnPercent: toFixedNumber(averageMarketReturnPercent, 4),
    averageStrategyReturnPercent: toFixedNumber(averageStrategyReturnPercent, 4),
    bestEdgePercent: edgeValues.length > 0 ? toFixedNumber(Math.max(...edgeValues), 4) : 0,
    worstEdgePercent: edgeValues.length > 0 ? toFixedNumber(Math.min(...edgeValues), 4) : 0,
  }
}

function resolvePaperCriteria() {
  return {
    minimumEvaluatedSignals: Math.max(5, Math.round(readNumberEnv('BOT_PAPER_MIN_EVALUATED_SIGNALS', 30))),
    minimumAccuracyPercent: readNumberEnv('BOT_PAPER_MIN_ACCURACY_PERCENT', 55),
    minimumAverageStrategyReturnPercent: readNumberEnv('BOT_PAPER_MIN_AVG_STRATEGY_RETURN_PERCENT', 0.15),
    minimumAverageEdgePercent: readNumberEnv('BOT_PAPER_MIN_AVG_EDGE_PERCENT', 0),
    maximumConsecutiveIncorrect: Math.max(1, Math.round(readNumberEnv('BOT_PAPER_MAX_CONSECUTIVE_INCORRECT', 5))),
    maximumDrawdownPercent: Math.max(0.5, readNumberEnv('BOT_PAPER_MAX_DRAWDOWN_PERCENT', 12)),
  }
}

export function buildBotPaperReadiness(decisions: Array<{
  evaluationStatus: string
  createdAt: Date | string
  evaluatedAt?: Date | string | null
  isCorrect: boolean | null
  strategyReturnPercent: number | null
  realizedEdgePercent: number | null
}>): BotPaperReadiness {
  const criteria = resolvePaperCriteria()
  const evaluatedDecisions = decisions
    .filter((decision) => decision.evaluationStatus === 'evaluated')
    .map((decision) => ({
      ...decision,
      createdAt: new Date(decision.createdAt),
      evaluatedAt: decision.evaluatedAt ? new Date(decision.evaluatedAt) : null,
    }))
    .sort((left, right) => {
      const leftTime = left.evaluatedAt?.getTime() ?? left.createdAt.getTime()
      const rightTime = right.evaluatedAt?.getTime() ?? right.createdAt.getTime()
      return leftTime - rightTime
    })

  const pendingSignals = decisions.length - evaluatedDecisions.length
  const correctSignals = evaluatedDecisions.filter((decision) => decision.isCorrect === true).length
  const accuracyPercent = evaluatedDecisions.length > 0
    ? toFixedNumber((correctSignals / evaluatedDecisions.length) * 100, 2)
    : 0

  const averageStrategyReturnPercent = evaluatedDecisions.length > 0
    ? toFixedNumber(
        evaluatedDecisions.reduce((sum, decision) => sum + (decision.strategyReturnPercent ?? 0), 0) / evaluatedDecisions.length,
        4,
      )
    : 0
  const averageEdgePercent = evaluatedDecisions.length > 0
    ? toFixedNumber(
        evaluatedDecisions.reduce((sum, decision) => sum + (decision.realizedEdgePercent ?? 0), 0) / evaluatedDecisions.length,
        4,
      )
    : 0

  let equity = 100
  let peak = 100
  let maxObservedDrawdownPercent = 0
  let maxConsecutiveIncorrect = 0
  let currentConsecutiveIncorrect = 0

  for (const decision of evaluatedDecisions) {
    equity += decision.strategyReturnPercent ?? 0
    peak = Math.max(peak, equity)
    maxObservedDrawdownPercent = Math.max(
      maxObservedDrawdownPercent,
      peak > 0 ? ((peak - equity) / peak) * 100 : 0,
    )

    if (decision.isCorrect === true) {
      currentConsecutiveIncorrect = 0
      continue
    }

    currentConsecutiveIncorrect += 1
    maxConsecutiveIncorrect = Math.max(maxConsecutiveIncorrect, currentConsecutiveIncorrect)
  }

  const blockers: string[] = []

  if (evaluatedDecisions.length < criteria.minimumEvaluatedSignals) {
    blockers.push(`Avalie pelo menos ${criteria.minimumEvaluatedSignals} sinais em paper antes de liberar o bot.`)
  }

  if (accuracyPercent < criteria.minimumAccuracyPercent) {
    blockers.push(`A acurácia online está em ${toFixedNumber(accuracyPercent, 2)}% e precisa atingir ${criteria.minimumAccuracyPercent}%.`)
  }

  if (averageStrategyReturnPercent < criteria.minimumAverageStrategyReturnPercent) {
    blockers.push(`O retorno médio da estratégia (${toFixedNumber(averageStrategyReturnPercent, 4)}%) ainda está abaixo do mínimo de ${criteria.minimumAverageStrategyReturnPercent}%.`)
  }

  if (averageEdgePercent < criteria.minimumAverageEdgePercent) {
    blockers.push(`O edge médio (${toFixedNumber(averageEdgePercent, 4)}%) ainda não supera o mínimo exigido de ${criteria.minimumAverageEdgePercent}%.`)
  }

  if (maxConsecutiveIncorrect > criteria.maximumConsecutiveIncorrect) {
    blockers.push(`A sequência máxima de erros (${maxConsecutiveIncorrect}) ultrapassou o limite de ${criteria.maximumConsecutiveIncorrect}.`)
  }

  if (maxObservedDrawdownPercent > criteria.maximumDrawdownPercent) {
    blockers.push(`O drawdown observado em paper (${toFixedNumber(maxObservedDrawdownPercent, 2)}%) ultrapassou o limite de ${criteria.maximumDrawdownPercent}%.`)
  }

  return {
    readyForFullAuto: blockers.length === 0,
    evaluatedSignals: evaluatedDecisions.length,
    pendingSignals,
    minimumEvaluatedSignals: criteria.minimumEvaluatedSignals,
    accuracyPercent,
    minimumAccuracyPercent: criteria.minimumAccuracyPercent,
    averageStrategyReturnPercent,
    minimumAverageStrategyReturnPercent: criteria.minimumAverageStrategyReturnPercent,
    averageEdgePercent,
    minimumAverageEdgePercent: criteria.minimumAverageEdgePercent,
    maxObservedDrawdownPercent: toFixedNumber(maxObservedDrawdownPercent, 2),
    maximumDrawdownPercent: criteria.maximumDrawdownPercent,
    maxConsecutiveIncorrect,
    currentConsecutiveIncorrect,
    maximumConsecutiveIncorrect: criteria.maximumConsecutiveIncorrect,
    lastEvaluatedAt: evaluatedDecisions.length > 0
      ? (evaluatedDecisions[evaluatedDecisions.length - 1].evaluatedAt ?? evaluatedDecisions[evaluatedDecisions.length - 1].createdAt).toISOString()
      : undefined,
    blockers,
  }
}

export async function loadBotPaperReadiness(userId: string, botId: string, limit: number = 60): Promise<BotPaperReadiness> {
  const decisions = await prisma.botDecision.findMany({
    where: { userId, botId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      evaluationStatus: true,
      createdAt: true,
      evaluatedAt: true,
      isCorrect: true,
      strategyReturnPercent: true,
      realizedEdgePercent: true,
    },
  })

  return buildBotPaperReadiness(decisions)
}
