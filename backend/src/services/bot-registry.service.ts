import { prisma } from '../config/database'

type TemplateRecord = {
  id: string
  slug: string
  name: string
  strategyType: string
  indicatorType: string | null
  specialization: string | null
  description: string | null
  defaultParameters: string
  isActive: boolean
}

type BotRecordWithTemplate = {
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
  template?: TemplateRecord | null
}

export interface BotTemplateSummary {
  id: string
  slug: string
  name: string
  strategyType: string
  indicatorType?: string
  specialization?: string
  description: string
  defaultParameters: Record<string, unknown>
  source: 'template' | 'legacy'
}

export interface BotInstanceSummary {
  id: string
  userId?: string
  name: string
  strategyType: string
  strategyId: string
  templateId?: string
  templateSlug?: string
  templateName?: string
  indicatorType?: string
  specialization?: string
  description?: string
  executionMode: string
  isSystemManaged: boolean
  status: 'online' | 'offline' | 'training' | 'error'
  isPaused: boolean
  currentPair?: string
  recommendedAction?: 'buy' | 'sell' | 'hold'
  confidence?: number
  lastAnalysis?: string
  modelVersion: string
  modelUrl?: string
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

export function buildStrategyId(strategyType: string): string {
  return strategyType.startsWith('strategy_') ? strategyType : `strategy_${strategyType}`
}

function normalizeTemplate(template: TemplateRecord): BotTemplateSummary {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    strategyType: template.strategyType,
    indicatorType: template.indicatorType ?? undefined,
    specialization: template.specialization ?? undefined,
    description: template.description ?? `Estratégia ${template.name}`,
    defaultParameters: safeJsonParse<Record<string, unknown>>(template.defaultParameters, {}),
    source: 'template',
  }
}

function normalizeLegacyTemplate(bot: Pick<BotRecordWithTemplate, 'id' | 'name' | 'strategyType' | 'description' | 'parameters'>): BotTemplateSummary {
  return {
    id: buildStrategyId(bot.strategyType),
    slug: buildStrategyId(bot.strategyType),
    name: bot.name,
    strategyType: bot.strategyType,
    description: bot.description ?? `Estratégia ${bot.name}`,
    defaultParameters: safeJsonParse<Record<string, unknown>>(bot.parameters, {}),
    source: 'legacy',
  }
}

export function getAcceptedStrategyIdentifiers(bot: Pick<BotRecordWithTemplate, 'strategyType' | 'templateId'> & { template?: TemplateRecord | null }): Set<string> {
  const identifiers = new Set<string>([
    buildStrategyId(bot.strategyType),
    bot.strategyType,
  ])

  if (bot.templateId) {
    identifiers.add(bot.templateId)
  }

  if (bot.template?.id) {
    identifiers.add(bot.template.id)
  }

  if (bot.template?.slug) {
    identifiers.add(bot.template.slug)
  }

  return identifiers
}

function normalizeBotInstance(bot: BotRecordWithTemplate): BotInstanceSummary {
  const strategyType = bot.template?.strategyType ?? bot.strategyType
  const status = ['online', 'offline', 'training', 'error'].includes(bot.status) ? bot.status as BotInstanceSummary['status'] : 'offline'
  const recommendedAction = ['buy', 'sell', 'hold'].includes(bot.recommendedAction ?? '') ? bot.recommendedAction as BotInstanceSummary['recommendedAction'] : undefined

  return {
    id: bot.id,
    userId: bot.userId ?? undefined,
    name: bot.name,
    strategyType,
    strategyId: bot.template?.id ?? buildStrategyId(strategyType),
    templateId: bot.template?.id ?? bot.templateId ?? undefined,
    templateSlug: bot.template?.slug ?? undefined,
    templateName: bot.template?.name ?? undefined,
    indicatorType: bot.template?.indicatorType ?? undefined,
    specialization: bot.template?.specialization ?? undefined,
    description: bot.description ?? bot.template?.description ?? undefined,
    executionMode: bot.executionMode,
    isSystemManaged: bot.isSystemManaged,
    status,
    isPaused: bot.isPaused,
    currentPair: bot.currentPair ?? undefined,
    recommendedAction,
    confidence: bot.confidence ?? undefined,
    lastAnalysis: bot.lastAnalysis?.toISOString(),
    modelVersion: bot.modelVersion,
    modelUrl: bot.modelUrl ?? undefined,
  }
}

export async function listBotTemplates(): Promise<BotTemplateSummary[]> {
  const templates = await prisma.botTemplate.findMany({
    where: { isActive: true },
    orderBy: [
      { createdAt: 'asc' },
      { name: 'asc' },
    ],
  })

  if (templates.length > 0) {
    return templates.map(normalizeTemplate)
  }

  const legacyBots = await prisma.bot.findMany({
    select: {
      id: true,
      name: true,
      strategyType: true,
      description: true,
      parameters: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { name: 'asc' },
    ],
  })

  const deduplicated = new Map<string, BotTemplateSummary>()
  for (const bot of legacyBots) {
    if (!deduplicated.has(bot.strategyType)) {
      deduplicated.set(bot.strategyType, normalizeLegacyTemplate(bot))
    }
  }

  return Array.from(deduplicated.values())
}

export async function listBotInstances(userId: string): Promise<BotInstanceSummary[]> {
  const bots = await prisma.bot.findMany({
    where: {
      OR: [
        { userId },
        { userId: null },
      ],
    },
    include: {
      template: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { name: 'asc' },
    ],
  })

  const userOwnedTemplateIds = new Set(
    bots
      .filter((bot) => bot.userId === userId)
      .map((bot) => bot.templateId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
  const userOwnedLegacyKeys = new Set(
    bots
      .filter((bot) => bot.userId === userId && !bot.templateId)
      .map((bot) => `${bot.strategyType}:${bot.name}`),
  )

  return bots
    .filter((bot) => {
      if (bot.userId === userId) {
        return true
      }

      if (bot.templateId && userOwnedTemplateIds.has(bot.templateId)) {
        return false
      }

      if (!bot.templateId && userOwnedLegacyKeys.has(`${bot.strategyType}:${bot.name}`)) {
        return false
      }

      return true
    })
    .map((bot) => normalizeBotInstance(bot as BotRecordWithTemplate))
}

export async function getBotInstanceById(userId: string, botId: string) {
  return prisma.bot.findFirst({
    where: {
      id: botId,
      OR: [
        { userId },
        { userId: null },
      ],
    },
    include: {
      template: true,
    },
  })
}

export async function materializeEditableBotForUser(userId: string, botId: string) {
  const sourceBot = await getBotInstanceById(userId, botId)
  if (!sourceBot) {
    return null
  }

  if (sourceBot.userId === userId) {
    return {
      bot: sourceBot,
      materialized: false,
    }
  }

  if (sourceBot.templateId) {
    const existingCustomBot = await prisma.bot.findFirst({
      where: {
        userId,
        templateId: sourceBot.templateId,
      },
      include: {
        template: true,
      },
    })

    if (existingCustomBot) {
      return {
        bot: existingCustomBot,
        materialized: false,
      }
    }
  }

  const createdBot = await prisma.bot.create({
    data: {
      userId,
      templateId: sourceBot.templateId,
      name: sourceBot.name,
      strategyType: sourceBot.strategyType,
      description: sourceBot.description,
      executionMode: sourceBot.executionMode,
      isSystemManaged: false,
      status: sourceBot.status,
      isPaused: sourceBot.isPaused,
      currentPair: sourceBot.currentPair,
      lastAnalysis: sourceBot.lastAnalysis,
      recommendedAction: sourceBot.recommendedAction,
      confidence: sourceBot.confidence,
      modelVersion: sourceBot.modelVersion,
      modelUrl: sourceBot.modelUrl,
      parameters: sourceBot.parameters,
    },
    include: {
      template: true,
    },
  })

  return {
    bot: createdBot,
    materialized: true,
  }
}
