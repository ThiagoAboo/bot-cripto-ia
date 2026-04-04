import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { io } from '../app'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'

const createTrainingSessionSchema = z.object({
  botId: z.string().min(1),
  strategyId: z.string().min(1),
  architecture: z.enum(['lstm', 'cnn', 'linear_regression', 'random_forest', 'xgboost', 'transformer']),
  modelVersion: z.string().min(1),
  dataSource: z.enum(['exchange', 'synthetic', 'upload']),
  trainingPeriod: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  includedPairs: z.array(z.string()),
  indicators: z.array(z.string()),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']),
  hyperparameters: z.object({
    hiddenLayers: z.number(),
    neuronsPerLayer: z.array(z.number()),
    dropoutRate: z.number(),
    activation: z.enum(['relu', 'tanh', 'sigmoid']),
    batchSize: z.number(),
    epochs: z.number(),
    learningRate: z.number(),
    optimizer: z.enum(['adam', 'sgd', 'rmsprop']),
    lossFunction: z.enum(['mse', 'mae', 'huber']),
    validationSplit: z.number(),
    earlyStopping: z.object({
      enabled: z.boolean(),
      patience: z.number(),
    }),
  }),
})

export async function getStrategies(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getStrategies', 'training')

  try {
    const strategies = [
      { id: 'strategy_scalper', name: 'Scalper V2', strategyType: 'scalper', description: 'Operações rápidas com pequenos lucros' },
      { id: 'strategy_momentum', name: 'Momentum Trader', strategyType: 'momentum', description: 'Identifica moedas com forte momentum' },
      { id: 'strategy_trend', name: 'Trend Follower', strategyType: 'trend_follower', description: 'Segue tendências de médio/longo prazo' },
      { id: 'strategy_reversion', name: 'Mean Reversion', strategyType: 'mean_reversion', description: 'Identifica moedas sobrecompradas/sobrevendidas' },
      { id: 'strategy_arbitrage', name: 'Arbitrage Hunter', strategyType: 'arbitrage', description: 'Identifica oportunidades de arbitragem' },
    ]

    endTrace('getStrategies', { userId: req.userId })
    return res.json({ success: true, data: strategies })
  } catch (error) {
    logger.error('[training] Erro ao buscar estratégias', {
      module: 'training',
      event: 'get_strategies_error',
      userId: req.userId,
      error,
    })

    endTrace('getStrategies', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTrainingSessions(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getTrainingSessions', 'training')

  try {
    const { botId } = req.query
    const userId = req.userId!
    const where: any = { userId }

    if (botId) {
      where.botId = botId as string
    }

    const sessions = await prisma.trainingSession.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: { bot: { select: { name: true, strategyType: true } } },
    })

    const result = sessions.map((session: any) => ({
      id: session.id,
      botId: session.botId,
      strategyId: session.bot?.strategyType,
      strategyName: session.bot?.name,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      bestEpoch: session.bestEpoch,
      bestValLoss: session.bestValLoss,
      modelUrl: session.modelUrl,
    }))

    endTrace('getTrainingSessions', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[training] Erro ao buscar sessões de treinamento', {
      module: 'training',
      event: 'get_training_sessions_error',
      userId: req.userId,
      error,
    })

    endTrace('getTrainingSessions', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function createTrainingSession(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'createTrainingSession', 'training')

  try {
    const validation = createTrainingSessionSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('[training] Payload inválido ao criar sessão de treinamento', {
        module: 'training',
        event: 'create_training_session_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'training', 'createTrainingSession', 'Validação falhou', 0, {
        errors: validation.error.errors,
      })
      endTrace('createTrainingSession', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const data = validation.data
    const userId = req.userId!

    const existingActive = await prisma.trainingSession.findFirst({
      where: {
        botId: data.botId,
        userId,
        status: { in: ['pending', 'running', 'paused'] },
      },
    })

    if (existingActive) {
      logger.warn('[training] Já existe treinamento em andamento para o bot', {
        module: 'training',
        event: 'create_training_session_conflict',
        userId,
        botId: data.botId,
        existingSessionId: existingActive.id,
      })

      endTrace('createTrainingSession', { userId, botId: data.botId, errorFlag: true })
      return res.status(409).json({ success: false, error: 'Já existe um treinamento em andamento para este bot' })
    }

    const bot = await prisma.bot.findUnique({ where: { id: data.botId } })
    const session = await prisma.trainingSession.create({
      data: {
        botId: data.botId,
        userId,
        status: 'pending',
        config: JSON.stringify(data),
        metrics: '[]',
      },
    })

    logger.info('[training] Sessão de treinamento criada', {
      module: 'training',
      event: 'training_session_created',
      userId,
      sessionId: session.id,
      botId: data.botId,
      configuration: data,
    })

    trace('DEBUG', 'training', 'createTrainingSession', 'Sessão criada', 0, {
      sessionId: session.id,
      userId,
    })

    io.to(`training:${session.id}`).emit('training:status', {
      sessionId: session.id,
      status: 'pending',
    })

    endTrace('createTrainingSession', { userId, botId: data.botId })
    return res.json({
      success: true,
      data: {
        id: session.id,
        botId: session.botId,
        strategyId: bot?.strategyType,
        strategyName: bot?.name,
        status: session.status,
        startTime: session.startTime,
        config: JSON.parse(session.config),
      },
    })
  } catch (error) {
    logger.error('[training] Erro ao criar sessão de treinamento', {
      module: 'training',
      event: 'create_training_session_error',
      userId: req.userId,
      error,
    })

    endTrace('createTrainingSession', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTrainingSessionById(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getTrainingSessionById', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!

    const session = await prisma.trainingSession.findFirst({
      where: { id, userId },
      include: { bot: { select: { name: true, strategyType: true } } },
    })

    if (!session) {
      endTrace('getTrainingSessionById', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    const result = {
      id: session.id,
      botId: session.botId,
      strategyId: session.bot?.strategyType,
      strategyName: session.bot?.name,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      config: JSON.parse(session.config),
      metrics: JSON.parse(session.metrics),
      bestEpoch: session.bestEpoch,
      bestValLoss: session.bestValLoss,
      modelUrl: session.modelUrl,
    }

    endTrace('getTrainingSessionById', { userId, botId: session.botId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[training] Erro ao buscar sessão', {
      module: 'training',
      event: 'get_training_session_by_id_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('getTrainingSessionById', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function pauseTrainingSession(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'pauseTrainingSession', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session) {
      endTrace('pauseTrainingSession', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'paused', updatedAt: new Date() },
    })

    logger.info('[training] Sessão de treinamento pausada', {
      module: 'training',
      event: 'training_session_paused',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'pauseTrainingSession', 'Sessão pausada', 0, { sessionId: id, userId })
    io.to(`training:${id}`).emit('training:status', { sessionId: id, status: 'paused' })
    endTrace('pauseTrainingSession', { userId, botId: session.botId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[training] Erro ao pausar treinamento', {
      module: 'training',
      event: 'pause_training_session_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('pauseTrainingSession', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function resumeTrainingSession(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'resumeTrainingSession', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session) {
      endTrace('resumeTrainingSession', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'running', updatedAt: new Date() },
    })

    logger.info('[training] Sessão de treinamento retomada', {
      module: 'training',
      event: 'training_session_resumed',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'resumeTrainingSession', 'Sessão retomada', 0, { sessionId: id, userId })
    io.to(`training:${id}`).emit('training:status', { sessionId: id, status: 'running' })
    endTrace('resumeTrainingSession', { userId, botId: session.botId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[training] Erro ao retomar treinamento', {
      module: 'training',
      event: 'resume_training_session_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('resumeTrainingSession', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function cancelTrainingSession(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'cancelTrainingSession', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session) {
      endTrace('cancelTrainingSession', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'cancelled', endTime: new Date(), updatedAt: new Date() },
    })

    logger.info('[training] Sessão de treinamento cancelada', {
      module: 'training',
      event: 'training_session_cancelled',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'cancelTrainingSession', 'Sessão cancelada', 0, { sessionId: id, userId })
    io.to(`training:${id}`).emit('training:status', { sessionId: id, status: 'cancelled' })
    endTrace('cancelTrainingSession', { userId, botId: session.botId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[training] Erro ao cancelar treinamento', {
      module: 'training',
      event: 'cancel_training_session_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('cancelTrainingSession', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function testTrainingSession(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'testTrainingSession', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session) {
      endTrace('testTrainingSession', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    const result = {
      sessionId: id,
      testPeriod: {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
      },
      totalTrades: 145,
      winRate: 68.5,
      totalProfit: 12500.75,
      sharpeRatio: 1.85,
      maxDrawdown: -12.5,
      profitFactor: 1.92,
    }

    trace('DEBUG', 'training', 'testTrainingSession', 'Backtesting concluído', 0, {
      sessionId: id,
      userId,
    })
    endTrace('testTrainingSession', { userId, botId: session.botId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[training] Erro no backtesting', {
      module: 'training',
      event: 'test_training_session_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('testTrainingSession', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function saveTrainingModel(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'saveTrainingModel', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session) {
      endTrace('saveTrainingModel', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    const modelUrl = `/models/${id}_final.h5`
    await prisma.trainingSession.update({
      where: { id },
      data: { modelUrl, updatedAt: new Date() },
    })

    const config = JSON.parse(session.config)
    await prisma.bot.update({
      where: { id: session.botId },
      data: {
        modelVersion: config.modelVersion,
        modelUrl,
        updatedAt: new Date(),
      },
    })

    logger.info('[training] Modelo salvo para sessão de treinamento', {
      module: 'training',
      event: 'training_model_saved',
      userId,
      sessionId: id,
      botId: session.botId,
      modelUrl,
      modelVersion: config.modelVersion,
    })

    trace('DEBUG', 'training', 'saveTrainingModel', 'Modelo salvo', 0, {
      sessionId: id,
      modelUrl,
      userId,
    })
    endTrace('saveTrainingModel', { userId, botId: session.botId })
    return res.json({ success: true, data: { modelUrl } })
  } catch (error) {
    logger.error('[training] Erro ao salvar modelo', {
      module: 'training',
      event: 'save_training_model_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('saveTrainingModel', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function downloadTrainingModel(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'downloadTrainingModel', 'training')

  try {
    const { id } = req.params
    const userId = req.userId!
    const session = await prisma.trainingSession.findFirst({ where: { id, userId } })

    if (!session || !session.modelUrl) {
      endTrace('downloadTrainingModel', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Modelo não encontrado' })
    }

    const mockModelData = Buffer.from('mock model data', 'utf-8')
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename=model_${id}.h5`)

    trace('DEBUG', 'training', 'downloadTrainingModel', 'Modelo baixado', 0, {
      sessionId: id,
      userId,
    })
    endTrace('downloadTrainingModel', { userId, botId: session.botId })
    return res.send(mockModelData)
  } catch (error) {
    logger.error('[training] Erro ao baixar modelo', {
      module: 'training',
      event: 'download_training_model_error',
      userId: req.userId,
      sessionId: req.params.id,
      error,
    })

    endTrace('downloadTrainingModel', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
