import { prisma } from '../config/database'
import {
  buildBotDecisionSummary,
  buildBotPaperReadiness,
  resolveBotOperationalReadiness,
  type BotDecisionSummary,
  type BotOperationalReadiness,
  type BotPaperReadiness,
} from './bot-decision.service'
import {
  listBotModelArtifacts,
  promoteBotModelArtifact,
  type BotModelArtifactSummary,
} from './bot-model-governance.service'

export interface GovernedBotModelArtifactSummary extends BotModelArtifactSummary {
  decisionSummary: BotDecisionSummary
  paperReadiness: BotPaperReadiness
  operationalReadiness: BotOperationalReadiness
}

export interface BotFullAutoEligibility {
  eligible: boolean
  blockers: string[]
  championArtifactId?: string
  championModelVersion?: string
  championModelUrl?: string
  botModelSynchronized: boolean
}

export interface BotModelPromotionRecommendation {
  artifactId: string
  modelVersion: string
  modelUrl: string
  reason: string
  accuracyGainPercent: number
  averageStrategyReturnGainPercent: number
  averageEdgeGainPercent: number
  challengerAccuracyPercent: number
  championAccuracyPercent: number
  challengerAverageStrategyReturnPercent: number
  championAverageStrategyReturnPercent: number
  challengerAverageEdgePercent: number
  championAverageEdgePercent: number
}

export interface BotModelGovernanceSummary {
  evaluatedAt: string
  championArtifactId?: string
  championModelVersion?: string
  championModelUrl?: string
  recommendedPromotion?: BotModelPromotionRecommendation
  fullAutoEligibility: BotFullAutoEligibility
  policy: {
    modelDecisionWindow: number
    minimumAccuracyGainPercent: number
    minimumAverageStrategyReturnGainPercent: number
    minimumAverageEdgeGainPercent: number
    maximumDrawdownDeltaPercent: number
    autoPromotionEnabled: boolean
  }
}

export interface BotModelGovernanceCatalog {
  botId: string
  items: GovernedBotModelArtifactSummary[]
  governance: BotModelGovernanceSummary
}

export interface BotAutoPromotionResult {
  applied: boolean
  artifact?: BotModelArtifactSummary
  recommendation?: BotModelPromotionRecommendation
}

interface GovernanceCriteria {
  modelDecisionWindow: number
  minimumAccuracyGainPercent: number
  minimumAverageStrategyReturnGainPercent: number
  minimumAverageEdgeGainPercent: number
  maximumDrawdownDeltaPercent: number
  autoPromotionEnabled: boolean
}

function readNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function resolveGovernanceCriteria(): GovernanceCriteria {
  return {
    modelDecisionWindow: Math.max(10, Math.round(readNumberEnv('BOT_GOVERNANCE_MODEL_DECISIONS_LIMIT', 60))),
    minimumAccuracyGainPercent: readNumberEnv('BOT_GOVERNANCE_MIN_ACCURACY_GAIN_PERCENT', 1),
    minimumAverageStrategyReturnGainPercent: readNumberEnv('BOT_GOVERNANCE_MIN_AVG_STRATEGY_RETURN_GAIN_PERCENT', 0.05),
    minimumAverageEdgeGainPercent: readNumberEnv('BOT_GOVERNANCE_MIN_AVG_EDGE_GAIN_PERCENT', 0),
    maximumDrawdownDeltaPercent: Math.max(0, readNumberEnv('BOT_GOVERNANCE_MAX_DRAWDOWN_DELTA_PERCENT', 2)),
    autoPromotionEnabled: process.env.BOT_GOVERNANCE_AUTO_PROMOTE === 'true',
  }
}

async function loadModelDecisions(params: {
  userId: string
  botId: string
  modelUrl: string
  limit: number
}) {
  return prisma.botDecision.findMany({
    where: {
      userId: params.userId,
      botId: params.botId,
      modelUrl: params.modelUrl,
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
    select: {
      evaluationStatus: true,
      createdAt: true,
      evaluatedAt: true,
      isCorrect: true,
      confidence: true,
      marketReturnPercent: true,
      strategyReturnPercent: true,
      realizedEdgePercent: true,
    },
  })
}

function buildPromotionRecommendation(params: {
  champion?: GovernedBotModelArtifactSummary
  challengers: GovernedBotModelArtifactSummary[]
  criteria: GovernanceCriteria
}): BotModelPromotionRecommendation | undefined {
  const { champion, challengers, criteria } = params
  if (!champion) {
    return undefined
  }

  const candidates = challengers
    .filter((challenger) => challenger.governanceRole === 'challenger')
    .filter((challenger) => challenger.operationalReadiness.modelReady)
    .filter((challenger) => challenger.paperReadiness.readyForFullAuto)
    .map((challenger) => {
      const accuracyGainPercent = roundNumber(
        challenger.paperReadiness.accuracyPercent - champion.paperReadiness.accuracyPercent,
        2,
      )
      const averageStrategyReturnGainPercent = roundNumber(
        challenger.paperReadiness.averageStrategyReturnPercent - champion.paperReadiness.averageStrategyReturnPercent,
        4,
      )
      const averageEdgeGainPercent = roundNumber(
        challenger.paperReadiness.averageEdgePercent - champion.paperReadiness.averageEdgePercent,
        4,
      )
      const drawdownDeltaPercent = roundNumber(
        challenger.paperReadiness.maxObservedDrawdownPercent - champion.paperReadiness.maxObservedDrawdownPercent,
        2,
      )

      const passesThresholds =
        accuracyGainPercent >= criteria.minimumAccuracyGainPercent
        && averageStrategyReturnGainPercent >= criteria.minimumAverageStrategyReturnGainPercent
        && averageEdgeGainPercent >= criteria.minimumAverageEdgeGainPercent
        && drawdownDeltaPercent <= criteria.maximumDrawdownDeltaPercent

      return {
        artifactId: challenger.id,
        modelVersion: challenger.modelVersion,
        modelUrl: challenger.modelUrl,
        reason: [
          `accuracy +${roundNumber(accuracyGainPercent, 2)} pp`,
          `retorno medio +${roundNumber(averageStrategyReturnGainPercent, 4)}%`,
          `edge medio +${roundNumber(averageEdgeGainPercent, 4)}%`,
          `drawdown delta ${roundNumber(drawdownDeltaPercent, 2)} pp`,
        ].join(' · '),
        accuracyGainPercent,
        averageStrategyReturnGainPercent,
        averageEdgeGainPercent,
        challengerAccuracyPercent: challenger.paperReadiness.accuracyPercent,
        championAccuracyPercent: champion.paperReadiness.accuracyPercent,
        challengerAverageStrategyReturnPercent: challenger.paperReadiness.averageStrategyReturnPercent,
        championAverageStrategyReturnPercent: champion.paperReadiness.averageStrategyReturnPercent,
        challengerAverageEdgePercent: challenger.paperReadiness.averageEdgePercent,
        championAverageEdgePercent: champion.paperReadiness.averageEdgePercent,
        passesThresholds,
      }
    })
    .filter((candidate) => candidate.passesThresholds)
    .sort((left, right) => {
      if (right.averageStrategyReturnGainPercent !== left.averageStrategyReturnGainPercent) {
        return right.averageStrategyReturnGainPercent - left.averageStrategyReturnGainPercent
      }

      if (right.accuracyGainPercent !== left.accuracyGainPercent) {
        return right.accuracyGainPercent - left.accuracyGainPercent
      }

      return right.averageEdgeGainPercent - left.averageEdgeGainPercent
    })

  const bestCandidate = candidates[0]
  if (!bestCandidate) {
    return undefined
  }

  return {
    artifactId: bestCandidate.artifactId,
    modelVersion: bestCandidate.modelVersion,
    modelUrl: bestCandidate.modelUrl,
    reason: bestCandidate.reason,
    accuracyGainPercent: bestCandidate.accuracyGainPercent,
    averageStrategyReturnGainPercent: bestCandidate.averageStrategyReturnGainPercent,
    averageEdgeGainPercent: bestCandidate.averageEdgeGainPercent,
    challengerAccuracyPercent: bestCandidate.challengerAccuracyPercent,
    championAccuracyPercent: bestCandidate.championAccuracyPercent,
    challengerAverageStrategyReturnPercent: bestCandidate.challengerAverageStrategyReturnPercent,
    championAverageStrategyReturnPercent: bestCandidate.championAverageStrategyReturnPercent,
    challengerAverageEdgePercent: bestCandidate.challengerAverageEdgePercent,
    championAverageEdgePercent: bestCandidate.championAverageEdgePercent,
  }
}

function buildFullAutoEligibility(params: {
  champion?: GovernedBotModelArtifactSummary
  currentBotModelUrl?: string | null
}): BotFullAutoEligibility {
  const { champion, currentBotModelUrl } = params
  const blockers: string[] = []

  if (!champion) {
    blockers.push('Promova um champion válido antes de habilitar o modo full_auto.')
  }

  if (champion && !champion.operationalReadiness.modelReady) {
    blockers.push(
      champion.operationalReadiness.operationalBlockReason
      ?? 'O champion atual ainda não possui artefato operacional pronto para execução contínua.',
    )
  }

  if (champion && !champion.paperReadiness.readyForFullAuto) {
    blockers.push(
      champion.paperReadiness.blockers[0]
      ?? 'O champion atual ainda não atingiu o placar mínimo de validação em paper.',
    )
  }

  if (champion && currentBotModelUrl && currentBotModelUrl !== champion.modelUrl) {
    blockers.push('O bot ainda não está sincronizado com o champion atual. Promova o modelo correto antes de liberar full_auto.')
  }

  const botModelSynchronized = Boolean(champion && currentBotModelUrl && currentBotModelUrl === champion.modelUrl)

  return {
    eligible: blockers.length === 0,
    blockers,
    championArtifactId: champion?.id,
    championModelVersion: champion?.modelVersion,
    championModelUrl: champion?.modelUrl,
    botModelSynchronized,
  }
}

export async function evaluateBotModelGovernance(params: {
  userId: string
  botId: string
  currentBotModelUrl?: string | null
}): Promise<BotModelGovernanceCatalog> {
  const criteria = resolveGovernanceCriteria()
  const artifacts = await listBotModelArtifacts(params.userId, params.botId)

  const items = await Promise.all(artifacts.map(async (artifact) => {
    const decisions = await loadModelDecisions({
      userId: params.userId,
      botId: params.botId,
      modelUrl: artifact.modelUrl,
      limit: criteria.modelDecisionWindow,
    })
    const [decisionSummary, paperReadiness, operationalReadiness] = await Promise.all([
      Promise.resolve(buildBotDecisionSummary(decisions)),
      Promise.resolve(buildBotPaperReadiness(decisions)),
      resolveBotOperationalReadiness(artifact.modelUrl),
    ])

    return {
      ...artifact,
      decisionSummary,
      paperReadiness,
      operationalReadiness,
    }
  }))

  const champion = items.find((item) => item.isActive) ?? items.find((item) => item.governanceRole === 'champion')
  const challengers = items.filter((item) => item.governanceRole === 'challenger')
  const recommendedPromotion = buildPromotionRecommendation({
    champion,
    challengers,
    criteria,
  })
  const fullAutoEligibility = buildFullAutoEligibility({
    champion,
    currentBotModelUrl: params.currentBotModelUrl,
  })

  return {
    botId: params.botId,
    items,
    governance: {
      evaluatedAt: new Date().toISOString(),
      championArtifactId: champion?.id,
      championModelVersion: champion?.modelVersion,
      championModelUrl: champion?.modelUrl,
      recommendedPromotion,
      fullAutoEligibility,
      policy: {
        modelDecisionWindow: criteria.modelDecisionWindow,
        minimumAccuracyGainPercent: criteria.minimumAccuracyGainPercent,
        minimumAverageStrategyReturnGainPercent: criteria.minimumAverageStrategyReturnGainPercent,
        minimumAverageEdgeGainPercent: criteria.minimumAverageEdgeGainPercent,
        maximumDrawdownDeltaPercent: criteria.maximumDrawdownDeltaPercent,
        autoPromotionEnabled: criteria.autoPromotionEnabled,
      },
    },
  }
}

export async function resolveBotFullAutoEligibility(params: {
  userId: string
  botId: string
  currentBotModelUrl?: string | null
}): Promise<BotFullAutoEligibility> {
  const catalog = await evaluateBotModelGovernance(params)
  return catalog.governance.fullAutoEligibility
}

export async function autoPromoteRecommendedBotModel(params: {
  userId: string
  botId: string
  currentBotModelUrl?: string | null
}): Promise<BotAutoPromotionResult> {
  const catalog = await evaluateBotModelGovernance(params)
  const recommendation = catalog.governance.recommendedPromotion

  if (!catalog.governance.policy.autoPromotionEnabled || !recommendation) {
    return {
      applied: false,
      recommendation,
    }
  }

  const promotedArtifact = await promoteBotModelArtifact({
    userId: params.userId,
    botId: params.botId,
    artifactId: recommendation.artifactId,
    notes: `Promoção automática aplicada pela política de governança: ${recommendation.reason}`,
  })

  if (!promotedArtifact) {
    return {
      applied: false,
      recommendation,
    }
  }

  return {
    applied: true,
    artifact: promotedArtifact,
    recommendation,
  }
}
