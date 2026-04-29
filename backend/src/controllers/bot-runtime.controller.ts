import { Request, Response } from 'express'
import { z } from 'zod'

import {
  applyBotRuntimeCycleResult,
  buildBotRuntimeCycleContext,
  listBotRuntimeQueue,
  processBotRuntimeMaintenanceCycle,
} from '../services/bot-runner.service'
import {
  DEFAULT_BOT_RUNTIME_SERVICE_NAME,
  getRuntimeHeartbeatStatus,
  touchRuntimeHeartbeat,
} from '../services/runtime-heartbeat.service'
import { logger } from '../utils/logger'

const botRuntimeActionSchema = z.enum(['buy', 'sell', 'hold'])

const runtimeInsightSchema = z.object({
  specialist: z.string(),
  action: botRuntimeActionSchema,
  confidence: z.number(),
  reason: z.string(),
  indicators: z.record(z.number().nullable()),
})

const runtimeOpportunitySchema = z.object({
  pair: z.string(),
  action: botRuntimeActionSchema,
  confidence: z.number(),
  price: z.number(),
  reason: z.string(),
  specialists: z.array(runtimeInsightSchema),
})

const runtimeSocialSignalReferenceSchema = z.object({
  source: z.enum(['reddit', 'rss', 'x', 'telegram']),
  title: z.string(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
})

const runtimeSocialSignalSchema = z.object({
  symbol: z.string(),
  pair: z.string(),
  score: z.number(),
  mentions: z.number(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  sources: z.array(z.enum(['reddit', 'rss', 'x', 'telegram'])),
  references: z.array(runtimeSocialSignalReferenceSchema),
})

const runtimeAnalysisSchema = z.object({
  timeframe: z.string(),
  analyzedPairs: z.array(z.string()),
  primarySpecialist: z.string(),
  summary: z.object({
    analyzedPairs: z.number(),
    actionablePairs: z.number(),
    buySignals: z.number(),
    sellSignals: z.number(),
    holdSignals: z.number(),
  }),
  bestOpportunity: runtimeOpportunitySchema.nullable().optional(),
  opportunities: z.array(runtimeOpportunitySchema),
  socialSignals: z.array(runtimeSocialSignalSchema),
})

const runtimePaperSimulationSchema = z.object({
  requestedQuantity: z.number(),
  executedQuantity: z.number(),
  executionPrice: z.number(),
  slippagePercent: z.number(),
  simulatedLatencyMs: z.number(),
  simulatedFillPercent: z.number(),
})

const runtimePlanSchema = z.object({
  status: z.enum(['skipped', 'suggested', 'execute']),
  reason: z.string(),
  pair: z.string().optional(),
  action: botRuntimeActionSchema.optional(),
  confidence: z.number().optional(),
  decisionPrice: z.number().optional(),
  quantity: z.number().nullable().optional(),
  isRiskOverride: z.boolean().optional(),
  rank: z.number().int().optional(),
  source: z.enum(['analysis', 'risk_override']).optional(),
  paperSimulation: runtimePaperSimulationSchema.nullable().optional(),
})

const runtimeCycleResultSchema = z.object({
  analysis: runtimeAnalysisSchema,
  plan: runtimePlanSchema,
  plans: z.array(runtimePlanSchema).default([]),
})

const heartbeatSchema = z.object({
  serviceName: z.string().trim().min(1).default(DEFAULT_BOT_RUNTIME_SERVICE_NAME),
  instanceId: z.string().trim().min(1),
  metadata: z.record(z.unknown()).optional(),
})

const applyCycleSchema = z.object({
  userId: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1).optional(),
  cycleResult: runtimeCycleResultSchema,
})

export async function getBotRuntimeQueue(_req: Request, res: Response): Promise<Response> {
  const items = await listBotRuntimeQueue()

  return res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      items,
    },
  })
}

export async function getBotRuntimeCycleContext(req: Request, res: Response): Promise<Response> {
  const botId = req.params.id

  if (!botId) {
    return res.status(400).json({ success: false, error: 'Bot inválido' })
  }

  const context = await buildBotRuntimeCycleContext(botId)
  if (!context) {
    return res.status(404).json({ success: false, error: 'Bot indisponível para execução neste momento' })
  }

  return res.json({
    success: true,
    data: context,
  })
}

export async function applyBotRuntimeCycle(req: Request, res: Response): Promise<Response> {
  const botId = req.params.id
  const parsedBody = applyCycleSchema.safeParse(req.body)

  if (!botId || !parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Payload inválido para aplicar o ciclo do bot',
      details: parsedBody.success ? undefined : parsedBody.error.flatten(),
    })
  }

  const result = await applyBotRuntimeCycleResult({
    botId,
    userId: parsedBody.data.userId,
    cycleGeneratedAt: parsedBody.data.generatedAt,
    cycleResult: parsedBody.data.cycleResult,
  })

  if (!result) {
    return res.status(404).json({ success: false, error: 'Bot indisponível para aplicar o ciclo' })
  }

  return res.json({
    success: true,
    data: result,
  })
}

export async function postBotRuntimeMaintenance(_req: Request, res: Response): Promise<Response> {
  await processBotRuntimeMaintenanceCycle()

  return res.json({
    success: true,
    data: {
      processedAt: new Date().toISOString(),
    },
  })
}

export async function postBotRuntimeHeartbeat(req: Request, res: Response): Promise<Response> {
  const parsedBody = heartbeatSchema.safeParse(req.body ?? {})

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Payload inválido para heartbeat do runtime',
      details: parsedBody.error.flatten(),
    })
  }

  const heartbeat = await touchRuntimeHeartbeat(parsedBody.data)

  logger.debug('[bot-runtime] Heartbeat recebido', {
    module: 'bot-runtime',
    event: 'bot_runtime_heartbeat_received',
    serviceName: heartbeat.serviceName,
    instanceId: heartbeat.instanceId,
  })

  return res.json({
    success: true,
    data: heartbeat,
  })
}

export async function getBotRuntimeHeartbeat(_req: Request, res: Response): Promise<Response> {
  const heartbeat = await getRuntimeHeartbeatStatus(DEFAULT_BOT_RUNTIME_SERVICE_NAME)

  return res.json({
    success: true,
    data: heartbeat,
  })
}
