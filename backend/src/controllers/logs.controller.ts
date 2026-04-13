import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import { listBotInstances } from '../services/bot-registry.service'
import { getSystemLogUserId, logger } from '../utils/logger'
import { startTrace, endTrace } from '../utils/tracer'
import { z } from 'zod'

const logFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  levels: z.string().optional(),
  modules: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
})

const traceFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  levels: z.string().optional(),
  modules: z.string().optional(),
  traceId: z.string().optional(),
  functionName: z.string().optional(),
  botId: z.string().optional(),
  currentPair: z.string().optional(),
  recommendedAction: z.string().optional(),
  minDurationMs: z.coerce.number().optional(),
  onlyErrors: z.coerce.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
})

function buildLogsWhere(userId: string, systemLogUserId: string | null): Record<string, unknown> {
  if (!systemLogUserId) {
    return { userId }
  }

  return {
    OR: [
      { userId },
      { userId: systemLogUserId },
    ],
  }
}

function parseDetails(details: string | null): unknown {
  if (!details) {
    return null
  }

  try {
    return JSON.parse(details)
  } catch {
    return details
  }
}


const frontendLogModules = new Set([
  'dashboard',
  'configurations',
  'training',
  'transactions',
  'bot',
  'system',
  'api',
  'database',
])

const systemBackedModules = ['system', 'app', 'console', 'auth', 'profile', 'logs', 'tracer']

function expandRequestedLogLevels(levels?: string): string[] | undefined {
  if (!levels) {
    return undefined
  }

  const requested = levels.split(',').map((level) => level.trim()).filter(Boolean)
  const expanded = new Set<string>()

  for (const level of requested) {
    if (level === 'INFO') {
      expanded.add('INFO')
      expanded.add('DEBUG')
      continue
    }

    expanded.add(level)
  }

  return expanded.size > 0 ? Array.from(expanded) : undefined
}

function expandRequestedTraceLevels(levels?: string): string[] | undefined {
  if (!levels) {
    return undefined
  }

  const requested = levels.split(',').map((level) => level.trim()).filter(Boolean)
  const expanded = new Set<string>()

  for (const level of requested) {
    if (level === 'TRACE') {
      expanded.add('TRACE')
      expanded.add('INFO')
      expanded.add('WARN')
      expanded.add('ERROR')
      continue
    }

    expanded.add(level)
  }

  return expanded.size > 0 ? Array.from(expanded) : undefined
}

function expandRequestedModules(modules?: string): string[] | undefined {
  if (!modules) {
    return undefined
  }

  const requested = modules.split(',').map((module) => module.trim()).filter(Boolean)
  const expanded = new Set<string>()

  for (const moduleName of requested) {
    if (moduleName === 'system') {
      for (const rawModule of systemBackedModules) {
        expanded.add(rawModule)
      }
      continue
    }

    expanded.add(moduleName)
  }

  return expanded.size > 0 ? Array.from(expanded) : undefined
}

function normalizeLogLevel(level: string): 'INFO' | 'WARN' | 'ERROR' {
  if (level === 'WARN') {
    return 'WARN'
  }

  if (level === 'ERROR') {
    return 'ERROR'
  }

  return 'INFO'
}

function normalizeTraceLevel(level: string): 'DEBUG' | 'TRACE' {
  return level === 'DEBUG' ? 'DEBUG' : 'TRACE'
}

function normalizeModule(moduleName: string): 'dashboard' | 'configurations' | 'training' | 'transactions' | 'bot' | 'system' | 'api' | 'database' {
  if (frontendLogModules.has(moduleName)) {
    return moduleName as 'dashboard' | 'configurations' | 'training' | 'transactions' | 'bot' | 'system' | 'api' | 'database'
  }

  return 'system'
}

export async function getLogs(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'getLogs', 'logs')

  try {
    const validation = logFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('getLogs')
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((e) => e.message).join(', '),
      })
    }

    const { page, limit, levels, modules, startDate, endDate, search } = validation.data
    const userId = req.userId!
    const systemLogUserId = await getSystemLogUserId()
    const skip = (page - 1) * limit

    const where: any = buildLogsWhere(userId, systemLogUserId)

    const expandedLogLevels = expandRequestedLogLevels(levels)
    if (expandedLogLevels) where.level = { in: expandedLogLevels }
    const expandedLogModules = expandRequestedModules(modules)
    if (expandedLogModules) where.module = { in: expandedLogModules }
    if (startDate) where.timestamp = { ...where.timestamp, gte: new Date(startDate) }
    if (endDate) where.timestamp = { ...where.timestamp, lte: new Date(endDate) }
    if (search) where.message = { contains: search }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.log.count({ where }),
    ])

    const items = logs.map((log: any) => ({
      id: log.id,
      timestamp: log.timestamp,
      level: normalizeLogLevel(log.level),
      module: normalizeModule(log.module),
      message: log.message,
      details: parseDetails(log.details),
      isSystem: systemLogUserId ? log.userId === systemLogUserId : false,
    }))

    endTrace('getLogs')

    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('Erro ao buscar logs:', error)
    endTrace('getLogs', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTraces(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'getTraces', 'logs')

  try {
    const validation = traceFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('getTraces')
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((e) => e.message).join(', '),
      })
    }

    const {
      page,
      limit,
      levels,
      modules,
      traceId: traceIdFilter,
      functionName,
      botId,
      currentPair,
      recommendedAction,
      minDurationMs,
      onlyErrors,
      startDate,
      endDate,
      search,
    } = validation.data
    const userId = req.userId!
    const skip = (page - 1) * limit

    const where: any = { userId }

    const expandedTraceLevels = expandRequestedTraceLevels(levels)
    if (expandedTraceLevels) where.level = { in: expandedTraceLevels }
    const expandedTraceModules = expandRequestedModules(modules)
    if (expandedTraceModules) where.module = { in: expandedTraceModules }
    if (traceIdFilter) where.traceId = traceIdFilter
    if (functionName) where.functionName = { contains: functionName }
    if (botId) where.botId = botId
    if (currentPair) where.currentPair = currentPair
    if (recommendedAction) where.recommendedAction = recommendedAction
    if (minDurationMs) where.durationMs = { gte: minDurationMs }
    if (onlyErrors) where.errorFlag = true
    if (startDate) where.timestamp = { ...where.timestamp, gte: new Date(startDate) }
    if (endDate) where.timestamp = { ...where.timestamp, lte: new Date(endDate) }
    if (search) {
      where.OR = [
        { message: { contains: search } },
        { functionName: { contains: search } },
      ]
    }

    const [traces, total] = await Promise.all([
      prisma.trace.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        skip,
        take: limit,
        include: {
          bot: {
            select: { name: true },
          },
        },
      }),
      prisma.trace.count({ where }),
    ])

    const items = traces.map((trace: any) => ({
      id: trace.id,
      timestamp: trace.timestamp,
      level: normalizeTraceLevel(trace.level),
      module: normalizeModule(trace.module),
      traceId: trace.traceId,
      parentTraceId: trace.parentTraceId ?? undefined,
      functionName: trace.functionName,
      message: trace.message,
      durationMs: trace.durationMs,
      botId: trace.botId ?? undefined,
      botName: trace.bot?.name ?? undefined,
      currentPair: trace.currentPair ?? undefined,
      recommendedAction: trace.recommendedAction ?? undefined,
      confidence: trace.confidence ?? undefined,
      errorFlag: trace.errorFlag,
    }))

    endTrace('getTraces')

    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('Erro ao buscar traces:', error)
    endTrace('getTraces', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTraceGroup(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'getTraceGroup', 'logs')

  try {
    const { traceId: traceIdParam } = req.params
    const userId = req.userId!

    const traces = await prisma.trace.findMany({
      where: {
        userId,
        traceId: traceIdParam,
      },
      orderBy: { timestamp: 'asc' },
      include: {
        bot: {
          select: { name: true },
        },
      },
    })

    if (traces.length === 0) {
      endTrace('getTraceGroup')
      return res.status(404).json({ success: false, error: 'Trace não encontrado' })
    }

    const entries = traces.map((trace: any) => ({
      id: trace.id,
      timestamp: trace.timestamp,
      level: normalizeTraceLevel(trace.level),
      module: normalizeModule(trace.module),
      traceId: trace.traceId,
      parentTraceId: trace.parentTraceId ?? undefined,
      functionName: trace.functionName,
      message: trace.message,
      durationMs: trace.durationMs,
      botId: trace.botId ?? undefined,
      botName: trace.bot?.name ?? undefined,
      currentPair: trace.currentPair ?? undefined,
      recommendedAction: trace.recommendedAction ?? undefined,
      confidence: trace.confidence ?? undefined,
      errorFlag: trace.errorFlag,
    }))

    const result = {
      traceId: traceIdParam,
      entries,
      startTime: traces[0].timestamp,
      endTime: traces[traces.length - 1].timestamp,
      totalDurationMs: traces[traces.length - 1].durationMs,
      hasError: traces.some((t: any) => t.errorFlag),
      botId: traces[0].botId,
      botName: traces[0].bot?.name,
    }

    endTrace('getTraceGroup')
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('Erro ao buscar grupo de traces:', error)
    endTrace('getTraceGroup', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function exportLogs(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'exportLogs', 'logs')

  try {
    const validation = logFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('exportLogs')
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((e) => e.message).join(', '),
      })
    }

    const { levels, modules, startDate, endDate, search } = validation.data
    const userId = req.userId!
    const systemLogUserId = await getSystemLogUserId()
    const where: any = buildLogsWhere(userId, systemLogUserId)

    const expandedLogLevels = expandRequestedLogLevels(levels)
    if (expandedLogLevels) where.level = { in: expandedLogLevels }
    const expandedLogModules = expandRequestedModules(modules)
    if (expandedLogModules) where.module = { in: expandedLogModules }
    if (startDate) where.timestamp = { ...where.timestamp, gte: new Date(startDate) }
    if (endDate) where.timestamp = { ...where.timestamp, lte: new Date(endDate) }
    if (search) where.message = { contains: search }

    const logs = await prisma.log.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    })

    const headers = ['timestamp', 'level', 'module', 'message', 'details', 'isSystem']
    const csvRows = [headers.join(',')]

    for (const log of logs) {
      const row = [
        log.timestamp.toISOString(),
        normalizeLogLevel(log.level),
        normalizeModule(log.module),
        `"${log.message.replace(/"/g, '""')}"`,
        log.details ? `"${log.details.replace(/"/g, '""')}"` : '',
        systemLogUserId ? log.userId === systemLogUserId : false,
      ]
      csvRows.push(row.join(','))
    }

    const csv = csvRows.join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=logs_${Date.now()}.csv`)

    endTrace('exportLogs')
    return res.send(csv)
  } catch (error) {
    logger.error('Erro ao exportar logs:', error)
    endTrace('exportLogs', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function exportTraces(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'exportTraces', 'logs')

  try {
    const validation = traceFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('exportTraces')
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((e) => e.message).join(', '),
      })
    }

    const { levels, modules, traceId: traceIdFilter, functionName, botId, startDate, endDate, search } = validation.data
    const userId = req.userId!
    const where: any = { userId }

    const expandedTraceLevels = expandRequestedTraceLevels(levels)
    if (expandedTraceLevels) where.level = { in: expandedTraceLevels }
    const expandedTraceModules = expandRequestedModules(modules)
    if (expandedTraceModules) where.module = { in: expandedTraceModules }
    if (traceIdFilter) where.traceId = traceIdFilter
    if (functionName) where.functionName = { contains: functionName }
    if (botId) where.botId = botId
    if (startDate) where.timestamp = { ...where.timestamp, gte: new Date(startDate) }
    if (endDate) where.timestamp = { ...where.timestamp, lte: new Date(endDate) }
    if (search) {
      where.OR = [
        { message: { contains: search } },
        { functionName: { contains: search } },
      ]
    }

    const traces = await prisma.trace.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    })

    const headers = [
      'timestamp',
      'level',
      'module',
      'traceId',
      'functionName',
      'message',
      'durationMs',
      'botId',
      'currentPair',
      'recommendedAction',
      'confidence',
      'errorFlag',
    ]
    const csvRows = [headers.join(',')]

    for (const trace of traces) {
      const row = [
        trace.timestamp.toISOString(),
        normalizeTraceLevel(trace.level),
        normalizeModule(trace.module),
        trace.traceId,
        `"${trace.functionName.replace(/"/g, '""')}"`,
        `"${trace.message.replace(/"/g, '""')}"`,
        trace.durationMs,
        trace.botId || '',
        trace.currentPair || '',
        trace.recommendedAction || '',
        trace.confidence || '',
        trace.errorFlag,
      ]
      csvRows.push(row.join(','))
    }

    const csv = csvRows.join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=traces_${Date.now()}.csv`)

    endTrace('exportTraces')
    return res.send(csv)
  } catch (error) {
    logger.error('Erro ao exportar traces:', error)
    endTrace('exportTraces', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotsForFilter(req: AuthRequest, res: Response) {
  startTrace(req.userId!, 'getBotsForFilter', 'logs')

  try {
    const bots = await listBotInstances(req.userId!)

    endTrace('getBotsForFilter')
    return res.json({
      success: true,
      data: bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
      })),
    })
  } catch (error) {
    logger.error('Erro ao buscar bots:', error)
    endTrace('getBotsForFilter', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
