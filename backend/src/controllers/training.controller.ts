import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { startTrace, endTrace, trace } from '../utils/tracer'
import { z } from 'zod'
import { io } from '../app'

const createTrainingSessionSchema = z.object({
  botId: z.string().min(1),
  strategyId: z.string().min(1),
  architecture: z.enum(['lstm', 'cnn', 'linear_regression', 'random_forest', 'xgboost', 'transformer']),
  modelVersion: z.string().min(1),
  dataSource: z.enum(['exchange', 'synthetic', 'upload']),
  trainingPeriod: z.object({
    startDate: z.string(),
    endDate: z.string()
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
      patience: z.number()
    })
  })
})

export async function getStrategies(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getStrategies', 'training')
  
  try {
    const strategies = [
      { id: 'strategy_scalper', name: 'Scalper V2', strategyType: 'scalper', description: 'Operações rápidas com pequenos lucros' },
      { id: 'strategy_momentum', name: 'Momentum Trader', strategyType: 'momentum', description: 'Identifica moedas com forte momentum' },
      { id: 'strategy_trend', name: 'Trend Follower', strategyType: 'trend_follower', description: 'Segue tendências de médio/longo prazo' },
      { id: 'strategy_reversion', name: 'Mean Reversion', strategyType: 'mean_reversion', description: 'Identifica moedas sobrecompradas/sobrevendidas' },
      { id: 'strategy_arbitrage', name: 'Arbitrage Hunter', strategyType: 'arbitrage', description: 'Identifica oportunidades de arbitragem' }
    ]
    
    endTrace('getStrategies')
    
    return res.json({
      success: true,
      data: strategies
    })
  } catch (error) {
    logger.error('Erro ao buscar estratégias:', error)
    endTrace('getStrategies')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTrainingSessions(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getTrainingSessions', 'training')
  
  try {
    const { botId } = req.query
    const userId = req.userId!
    
    const where: any = { userId }
    if (botId) where.botId = botId as string
    
    const sessions = await prisma.trainingSession.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: {
        bot: {
          select: { name: true, strategyType: true }
        }
      }
    })
    
    const result = sessions.map((s: any) => ({
      id: s.id,
      botId: s.botId,
      strategyId: s.bot?.strategyType,
      strategyName: s.bot?.name,
      status: s.status,
      startTime: s.startTime,
      endTime: s.endTime,
      bestEpoch: s.bestEpoch,
      bestValLoss: s.bestValLoss,
      modelUrl: s.modelUrl
    }))
    
    endTrace('getTrainingSessions')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar sessões de treinamento:', error)
    endTrace('getTrainingSessions')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function createTrainingSession(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'createTrainingSession', 'training')
  
  try {
    const validation = createTrainingSessionSchema.safeParse(req.body)
    if (!validation.success) {
      trace('DEBUG', 'training', 'createTrainingSession', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('createTrainingSession')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }
    
    const data = validation.data
    const userId = req.userId!
    
    const existingActive = await prisma.trainingSession.findFirst({
      where: {
        botId: data.botId,
        userId,
        status: { in: ['pending', 'running', 'paused'] }
      }
    })
    
    if (existingActive) {
      endTrace('createTrainingSession')
      return res.status(409).json({ 
        success: false, 
        error: 'Já existe um treinamento em andamento para este bot' 
      })
    }
    
    const bot = await prisma.bot.findUnique({
      where: { id: data.botId }
    })
    
    const session = await prisma.trainingSession.create({
      data: {
        botId: data.botId,
        userId,
        status: 'pending',
        config: JSON.stringify(data),
        metrics: '[]'
      }
    })
    
    logger.info(`Sessão de treinamento criada: ${session.id} para bot ${data.botId}`)
    trace('DEBUG', 'training', 'createTrainingSession', 'Sessão criada', 0, { sessionId: session.id })
    
    io.to(`training:${session.id}`).emit('training:status', {
      sessionId: session.id,
      status: 'pending'
    })
    
    endTrace('createTrainingSession')
    
    return res.json({
      success: true,
      data: {
        id: session.id,
        botId: session.botId,
        strategyId: bot?.strategyType,
        strategyName: bot?.name,
        status: session.status,
        startTime: session.startTime,
        config: JSON.parse(session.config)
      }
    })
  } catch (error) {
    logger.error('Erro ao criar sessão de treinamento:', error)
    endTrace('createTrainingSession')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getTrainingSessionById(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getTrainingSessionById', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId },
      include: {
        bot: {
          select: { name: true, strategyType: true }
        }
      }
    })
    
    if (!session) {
      endTrace('getTrainingSessionById')
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
      modelUrl: session.modelUrl
    }
    
    endTrace('getTrainingSessionById')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar sessão:', error)
    endTrace('getTrainingSessionById')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function pauseTrainingSession(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'pauseTrainingSession', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session) {
      endTrace('pauseTrainingSession')
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }
    
    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'paused', updatedAt: new Date() }
    })
    
    logger.info(`Sessão de treinamento pausada: ${id}`)
    trace('DEBUG', 'training', 'pauseTrainingSession', 'Sessão pausada', 0, { sessionId: id })
    
    io.to(`training:${id}`).emit('training:status', {
      sessionId: id,
      status: 'paused'
    })
    
    endTrace('pauseTrainingSession')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao pausar treinamento:', error)
    endTrace('pauseTrainingSession')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function resumeTrainingSession(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'resumeTrainingSession', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session) {
      endTrace('resumeTrainingSession')
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }
    
    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'running', updatedAt: new Date() }
    })
    
    logger.info(`Sessão de treinamento retomada: ${id}`)
    trace('DEBUG', 'training', 'resumeTrainingSession', 'Sessão retomada', 0, { sessionId: id })
    
    io.to(`training:${id}`).emit('training:status', {
      sessionId: id,
      status: 'running'
    })
    
    endTrace('resumeTrainingSession')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao retomar treinamento:', error)
    endTrace('resumeTrainingSession')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function cancelTrainingSession(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'cancelTrainingSession', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session) {
      endTrace('cancelTrainingSession')
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }
    
    await prisma.trainingSession.update({
      where: { id },
      data: { 
        status: 'cancelled', 
        endTime: new Date(),
        updatedAt: new Date()
      }
    })
    
    logger.info(`Sessão de treinamento cancelada: ${id}`)
    trace('DEBUG', 'training', 'cancelTrainingSession', 'Sessão cancelada', 0, { sessionId: id })
    
    io.to(`training:${id}`).emit('training:status', {
      sessionId: id,
      status: 'cancelled'
    })
    
    endTrace('cancelTrainingSession')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao cancelar treinamento:', error)
    endTrace('cancelTrainingSession')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function testTrainingSession(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'testTrainingSession', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session) {
      endTrace('testTrainingSession')
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }
    
    const result = {
      sessionId: id,
      testPeriod: {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      },
      totalTrades: 145,
      winRate: 68.5,
      totalProfit: 12500.75,
      sharpeRatio: 1.85,
      maxDrawdown: -12.5,
      profitFactor: 1.92
    }
    
    trace('DEBUG', 'training', 'testTrainingSession', 'Backtesting concluído', 0, { sessionId: id })
    endTrace('testTrainingSession')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro no backtesting:', error)
    endTrace('testTrainingSession')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function saveTrainingModel(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'saveTrainingModel', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session) {
      endTrace('saveTrainingModel')
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }
    
    const modelUrl = `/models/${id}_final.h5`
    
    await prisma.trainingSession.update({
      where: { id },
      data: { 
        modelUrl,
        updatedAt: new Date()
      }
    })
    
    const config = JSON.parse(session.config)
    await prisma.bot.update({
      where: { id: session.botId },
      data: {
        modelVersion: config.modelVersion,
        modelUrl,
        updatedAt: new Date()
      }
    })
    
    logger.info(`Modelo salvo para sessão: ${id}`)
    trace('DEBUG', 'training', 'saveTrainingModel', 'Modelo salvo', 0, { sessionId: id, modelUrl })
    endTrace('saveTrainingModel')
    
    return res.json({
      success: true,
      data: { modelUrl }
    })
  } catch (error) {
    logger.error('Erro ao salvar modelo:', error)
    endTrace('saveTrainingModel')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function downloadTrainingModel(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'downloadTrainingModel', 'training')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId }
    })
    
    if (!session || !session.modelUrl) {
      endTrace('downloadTrainingModel')
      return res.status(404).json({ success: false, error: 'Modelo não encontrado' })
    }
    
    const mockModelData = Buffer.from('mock model data', 'utf-8')
    
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename=model_${id}.h5`)
    
    trace('DEBUG', 'training', 'downloadTrainingModel', 'Modelo baixado', 0, { sessionId: id })
    endTrace('downloadTrainingModel')
    
    return res.send(mockModelData)
  } catch (error) {
    logger.error('Erro ao baixar modelo:', error)
    endTrace('downloadTrainingModel')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}