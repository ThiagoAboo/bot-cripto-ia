import { prisma } from '../config/database'
import type { TrainingModelArtifact } from './training-model.service'

export type BotModelGovernanceRole = 'champion' | 'challenger' | 'archived'

export interface BotModelArtifactSummary {
  id: string
  botId: string
  trainingSessionId?: string
  modelVersion: string
  modelUrl: string
  fingerprint: string
  architecture?: string
  validationStrategy?: string
  forecastHorizonCandles?: number
  governanceRole: BotModelGovernanceRole
  isActive: boolean
  notes?: string
  promotedAt?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  evaluation: {
    bestEpoch?: number
    bestValLoss?: number
    accuracyPercent?: number
    f1Score?: number
    precision?: number
    recall?: number
    logLoss?: number
    walkForwardFolds?: number
  }
  reproducibility: {
    configFingerprint?: string
    metricsFingerprint?: string
    datasetFingerprint?: string
    featureFingerprint?: string
  }
}

function normalizeGovernanceRole(value: string): BotModelGovernanceRole {
  if (value === 'champion' || value === 'archived') {
    return value
  }

  return 'challenger'
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

function mapArtifactRecord(artifact: {
  id: string
  botId: string
  trainingSessionId: string | null
  modelVersion: string
  modelUrl: string
  fingerprint: string
  architecture: string | null
  validationStrategy: string | null
  forecastHorizonCandles: number | null
  governanceRole: string
  isActive: boolean
  notes: string | null
  promotedAt: Date | null
  archivedAt: Date | null
  evaluationSummary: string
  reproducibilitySummary: string
  createdAt: Date
  updatedAt: Date
}): BotModelArtifactSummary {
  const evaluation = safeJsonParse<Record<string, unknown>>(artifact.evaluationSummary, {})
  const reproducibility = safeJsonParse<Record<string, unknown>>(artifact.reproducibilitySummary, {})

  return {
    id: artifact.id,
    botId: artifact.botId,
    trainingSessionId: artifact.trainingSessionId ?? undefined,
    modelVersion: artifact.modelVersion,
    modelUrl: artifact.modelUrl,
    fingerprint: artifact.fingerprint,
    architecture: artifact.architecture ?? undefined,
    validationStrategy: artifact.validationStrategy ?? undefined,
    forecastHorizonCandles: artifact.forecastHorizonCandles ?? undefined,
    governanceRole: normalizeGovernanceRole(artifact.governanceRole),
    isActive: artifact.isActive,
    notes: artifact.notes ?? undefined,
    promotedAt: artifact.promotedAt?.toISOString(),
    archivedAt: artifact.archivedAt?.toISOString(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    evaluation: {
      bestEpoch: typeof evaluation.bestEpoch === 'number' ? evaluation.bestEpoch : undefined,
      bestValLoss: typeof evaluation.bestValLoss === 'number' ? evaluation.bestValLoss : undefined,
      accuracyPercent: typeof evaluation.accuracyPercent === 'number' ? evaluation.accuracyPercent : undefined,
      f1Score: typeof evaluation.f1Score === 'number' ? evaluation.f1Score : undefined,
      precision: typeof evaluation.precision === 'number' ? evaluation.precision : undefined,
      recall: typeof evaluation.recall === 'number' ? evaluation.recall : undefined,
      logLoss: typeof evaluation.logLoss === 'number' ? evaluation.logLoss : undefined,
      walkForwardFolds: typeof evaluation.walkForwardFolds === 'number' ? evaluation.walkForwardFolds : undefined,
    },
    reproducibility: {
      configFingerprint: typeof reproducibility.configFingerprint === 'string' ? reproducibility.configFingerprint : undefined,
      metricsFingerprint: typeof reproducibility.metricsFingerprint === 'string' ? reproducibility.metricsFingerprint : undefined,
      datasetFingerprint: typeof reproducibility.datasetFingerprint === 'string' ? reproducibility.datasetFingerprint : undefined,
      featureFingerprint: typeof reproducibility.featureFingerprint === 'string' ? reproducibility.featureFingerprint : undefined,
    },
  }
}

export async function registerBotModelArtifact(input: {
  userId: string
  botId: string
  trainingSessionId: string
  artifact: TrainingModelArtifact
  modelUrl: string
  notes?: string
}) {
  const activeArtifact = await prisma.botModelArtifact.findFirst({
    where: {
      userId: input.userId,
      botId: input.botId,
      isActive: true,
    },
  })

  const isFirstPromotedModel = !activeArtifact
  const createdArtifact = await prisma.botModelArtifact.upsert({
    where: {
      botId_modelUrl: {
        botId: input.botId,
        modelUrl: input.modelUrl,
      },
    },
    update: {
      modelVersion: input.artifact.modelVersion,
      fingerprint: input.artifact.fingerprint,
      architecture: input.artifact.summary.architecture,
      validationStrategy: input.artifact.summary.validationStrategy,
      forecastHorizonCandles: input.artifact.reproducibility.forecastHorizonCandles,
      governanceRole: isFirstPromotedModel ? 'champion' : 'challenger',
      isActive: isFirstPromotedModel,
      notes: input.notes ?? null,
      promotedAt: isFirstPromotedModel ? new Date() : null,
      archivedAt: null,
      evaluationSummary: JSON.stringify({
        bestEpoch: input.artifact.summary.bestEpoch,
        bestValLoss: input.artifact.summary.bestValLoss,
        accuracyPercent: input.artifact.evaluation.summary?.accuracyPercent,
        f1Score: input.artifact.evaluation.summary?.f1Score,
        precision: input.artifact.evaluation.summary?.precision,
        recall: input.artifact.evaluation.summary?.recall,
        logLoss: input.artifact.evaluation.summary?.logLoss,
        walkForwardFolds: input.artifact.evaluation.walkForwardFolds,
      }),
      reproducibilitySummary: JSON.stringify({
        configFingerprint: input.artifact.reproducibility.configFingerprint,
        metricsFingerprint: input.artifact.reproducibility.metricsFingerprint,
        datasetFingerprint: input.artifact.reproducibility.datasetFingerprint,
        featureFingerprint: input.artifact.reproducibility.featureFingerprint,
      }),
      updatedAt: new Date(),
    },
    create: {
      userId: input.userId,
      botId: input.botId,
      trainingSessionId: input.trainingSessionId,
      modelVersion: input.artifact.modelVersion,
      modelUrl: input.modelUrl,
      fingerprint: input.artifact.fingerprint,
      architecture: input.artifact.summary.architecture,
      validationStrategy: input.artifact.summary.validationStrategy,
      forecastHorizonCandles: input.artifact.reproducibility.forecastHorizonCandles,
      governanceRole: isFirstPromotedModel ? 'champion' : 'challenger',
      isActive: isFirstPromotedModel,
      notes: input.notes ?? null,
      promotedAt: isFirstPromotedModel ? new Date() : null,
      evaluationSummary: JSON.stringify({
        bestEpoch: input.artifact.summary.bestEpoch,
        bestValLoss: input.artifact.summary.bestValLoss,
        accuracyPercent: input.artifact.evaluation.summary?.accuracyPercent,
        f1Score: input.artifact.evaluation.summary?.f1Score,
        precision: input.artifact.evaluation.summary?.precision,
        recall: input.artifact.evaluation.summary?.recall,
        logLoss: input.artifact.evaluation.summary?.logLoss,
        walkForwardFolds: input.artifact.evaluation.walkForwardFolds,
      }),
      reproducibilitySummary: JSON.stringify({
        configFingerprint: input.artifact.reproducibility.configFingerprint,
        metricsFingerprint: input.artifact.reproducibility.metricsFingerprint,
        datasetFingerprint: input.artifact.reproducibility.datasetFingerprint,
        featureFingerprint: input.artifact.reproducibility.featureFingerprint,
      }),
    },
  })

  return {
    artifact: mapArtifactRecord(createdArtifact),
    autoPromoted: isFirstPromotedModel,
  }
}

export async function listBotModelArtifacts(userId: string, botId: string): Promise<BotModelArtifactSummary[]> {
  const artifacts = await prisma.botModelArtifact.findMany({
    where: {
      userId,
      botId,
    },
    orderBy: [
      { isActive: 'desc' },
      { promotedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return artifacts.map(mapArtifactRecord)
}

export async function promoteBotModelArtifact(params: {
  userId: string
  botId: string
  artifactId: string
  notes?: string
}): Promise<BotModelArtifactSummary | null> {
  const artifact = await prisma.botModelArtifact.findFirst({
    where: {
      id: params.artifactId,
      userId: params.userId,
      botId: params.botId,
    },
  })

  if (!artifact) {
    return null
  }

  const promoted = await prisma.$transaction(async (tx) => {
    await tx.botModelArtifact.updateMany({
      where: {
        userId: params.userId,
        botId: params.botId,
        id: { not: params.artifactId },
        governanceRole: { not: 'archived' },
      },
      data: {
        isActive: false,
        governanceRole: 'challenger',
        updatedAt: new Date(),
      },
    })

    const updatedArtifact = await tx.botModelArtifact.update({
      where: { id: params.artifactId },
      data: {
        governanceRole: 'champion',
        isActive: true,
        notes: params.notes ?? artifact.notes,
        promotedAt: new Date(),
        archivedAt: null,
        updatedAt: new Date(),
      },
    })

    await tx.bot.update({
      where: { id: params.botId },
      data: {
        modelVersion: updatedArtifact.modelVersion,
        modelUrl: updatedArtifact.modelUrl,
        updatedAt: new Date(),
      },
    })

    return updatedArtifact
  })

  return mapArtifactRecord(promoted)
}

export async function archiveBotModelArtifact(params: {
  userId: string
  botId: string
  artifactId: string
  notes?: string
}): Promise<BotModelArtifactSummary | null> {
  const artifact = await prisma.botModelArtifact.findFirst({
    where: {
      id: params.artifactId,
      userId: params.userId,
      botId: params.botId,
    },
  })

  if (!artifact) {
    return null
  }

  if (artifact.isActive || artifact.governanceRole === 'champion') {
    throw new Error('Promova outro modelo antes de arquivar o champion ativo.')
  }

  const updatedArtifact = await prisma.botModelArtifact.update({
    where: { id: params.artifactId },
    data: {
      governanceRole: 'archived',
      isActive: false,
      notes: params.notes ?? artifact.notes,
      archivedAt: new Date(),
      updatedAt: new Date(),
    },
  })

  return mapArtifactRecord(updatedArtifact)
}
