import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import {
  buildStrategyId,
  getAcceptedStrategyIdentifiers,
  getBotInstanceById,
  listBotTemplates,
  materializeEditableBotForUser,
} from '../services/bot-registry.service'
import { registerBotModelArtifact } from '../services/bot-model-governance.service'
import { runTrainingBacktest } from '../services/training-backtest.service'
import { readTrainingModelArtifact, readTrainingModelArtifactJson, saveTrainingModelArtifact } from '../services/training-model.service'
import { isPythonMlEngineEnabled, trainRealModelPackage } from '../services/python-ml-engine.service'
import { assertTrainingUploadExists, parseTrainingUploadRequest, saveTrainingUpload, TrainingUploadError } from '../services/training-upload.service'
import { emitTrainingStatus } from '../services/socket.service'
import {
  cancelTrainingSessionProcessing,
  captureTrainingSessionCheckpoint,
  getTrainingSessionLogs,
  pauseTrainingSessionProcessing,
  startTrainingSessionProcessing,
} from '../services/training-session.service'
import { buildTrainingEvaluationSummary } from '../services/training-evaluation.service'
import { readTrainingCheckpoint } from '../services/training-checkpoint.service'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'

const createTrainingSessionSchema = z.object({
  botId: z.string().min(1),
  strategyId: z.string().min(1),
  architecture: z.enum(['lstm', 'cnn', 'linear_regression', 'random_forest', 'xgboost', 'transformer']),
  modelVersion: z.string().min(1),
  dataSource: z.enum(['exchange', 'synthetic', 'upload']),
  uploadedFileUrl: z.string().optional(),
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
    sequenceLength: z.number().optional(),
    forecastHorizonCandles: z.number().optional(),
    buyThresholdPercent: z.number().optional(),
    sellThresholdPercent: z.number().optional(),
    walkForwardFolds: z.number().optional(),
    nEstimators: z.number().optional(),
    maxDepth: z.number().optional(),
    randomState: z.number().optional(),
  }),
})
  .superRefine((data, context) => {
    if (data.dataSource === 'upload' && !data.uploadedFileUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uploadedFileUrl'],
        message: 'uploadedFileUrl é obrigatório quando a origem for upload',
      })
    }
  })


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

function normalizeTrainingLogLevel(level: unknown): 'INFO' | 'WARN' | 'ERROR' {
  if (level === 'WARN') {
    return 'WARN'
  }

  if (level === 'ERROR') {
    return 'ERROR'
  }

  return 'INFO'
}

async function buildTrainingSessionResponse(session: any) {
  const config = safeJsonParse<Record<string, unknown>>(session.config, {})
  const metrics = safeJsonParse<any[]>(session.metrics, [])
  const logs = await getTrainingSessionLogs(session.userId, session.id)
  const fallbackStrategyId = typeof session.bot?.template?.id === 'string'
    ? session.bot.template.id
    : typeof session.bot?.strategyType === 'string'
    ? buildStrategyId(session.bot.strategyType)
    : ''
  const strategyName = session.bot?.template?.name
    ?? session.bot?.name
    ?? (typeof config.strategyId === 'string' ? config.strategyId : '')
  const evaluation = buildTrainingEvaluationSummary(config as any, metrics, {
    bestEpoch: session.bestEpoch ?? null,
    bestValLoss: session.bestValLoss ?? null,
  })

  return {
    id: session.id,
    botId: session.botId,
    strategyId: typeof config.strategyId === 'string' ? config.strategyId : fallbackStrategyId,
    strategyName,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime ?? undefined,
    config,
    metrics,
    logs,
    bestEpoch: session.bestEpoch ?? undefined,
    bestValLoss: session.bestValLoss ?? undefined,
    modelUrl: session.modelUrl ?? undefined,
    evaluation,
  }
}

export async function getStrategies(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getStrategies', 'training')

  try {
    const strategies = await listBotTemplates()

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
      include: {
        bot: {
          select: {
            name: true,
            strategyType: true,
            template: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    const result = await Promise.all(sessions.map((session: any) => buildTrainingSessionResponse(session)))

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

    if (data.dataSource === 'upload' && data.uploadedFileUrl) {
      await assertTrainingUploadExists(data.uploadedFileUrl)
    }

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

    const materializedBot = await materializeEditableBotForUser(userId, data.botId)
    if (!materializedBot) {
      endTrace('createTrainingSession', { userId, botId: data.botId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Bot nao encontrado' })
    }
    const bot = materializedBot.bot

    const acceptedStrategyIds = getAcceptedStrategyIdentifiers(bot)
    if (!acceptedStrategyIds.has(data.strategyId)) {
      endTrace('createTrainingSession', { userId, botId: data.botId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: 'A estratégia selecionada não corresponde ao bot informado',
      })
    }

    const session = await prisma.trainingSession.create({
      data: {
        botId: bot.id,
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
      botId: bot.id,
      configuration: data,
      materializedBot: materializedBot.materialized,
    })

    trace('DEBUG', 'training', 'createTrainingSession', 'Sessão criada', 0, {
      sessionId: session.id,
      userId,
      botId: bot.id,
    })

    emitTrainingStatus(userId, session.id, 'pending')

    startTrainingSessionProcessing(session.id, 600)

    endTrace('createTrainingSession', { userId, botId: data.botId })
    return res.json({
      success: true,
      data: await buildTrainingSessionResponse({
        ...session,
        bot: bot ? {
          name: bot.name,
          strategyType: bot.strategyType,
          template: bot.template ? {
            id: bot.template.id,
            name: bot.template.name,
          } : null,
        } : null,
      }),
    })
  } catch (error) {
    if (error instanceof TrainingUploadError) {
      logger.warn('[training] Sessão de treinamento rejeitada por dataset inválido', {
        module: 'training',
        event: 'create_training_session_invalid_dataset',
        userId: req.userId,
        message: error.message,
      })

      endTrace('createTrainingSession', { userId: req.userId, errorFlag: true })
      return res.status(error.statusCode).json({ success: false, error: error.message })
    }

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

export async function uploadTrainingDataset(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'uploadTrainingDataset', 'training')

  try {
    const upload = await parseTrainingUploadRequest(req)
    const savedUpload = await saveTrainingUpload({
      filename: upload.filename,
      buffer: upload.buffer,
    })

    logger.info('[training] Dataset CSV enviado com sucesso', {
      module: 'training',
      event: 'training_dataset_uploaded',
      userId: req.userId,
      filename: savedUpload.filename,
      size: savedUpload.size,
      url: savedUpload.url,
    })

    trace('DEBUG', 'training', 'uploadTrainingDataset', 'Dataset CSV salvo', 0, {
      userId: req.userId,
      filename: savedUpload.filename,
      size: savedUpload.size,
    })
    endTrace('uploadTrainingDataset', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        url: savedUpload.url,
      },
    })
  } catch (error) {
    if (error instanceof TrainingUploadError) {
      logger.warn('[training] Upload de dataset rejeitado', {
        module: 'training',
        event: 'training_dataset_upload_rejected',
        userId: req.userId,
        message: error.message,
      })

      endTrace('uploadTrainingDataset', { userId: req.userId, errorFlag: true })
      return res.status(error.statusCode).json({ success: false, error: error.message })
    }

    logger.error('[training] Erro ao realizar upload do dataset', {
      module: 'training',
      event: 'training_dataset_upload_error',
      userId: req.userId,
      error,
    })

    endTrace('uploadTrainingDataset', { userId: req.userId, errorFlag: true })
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
      include: {
        bot: {
          select: {
            name: true,
            strategyType: true,
            template: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    if (!session) {
      endTrace('getTrainingSessionById', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    const result = await buildTrainingSessionResponse(session)

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
    const session = await prisma.trainingSession.findFirst({
      where: { id, userId },
      include: {
        bot: {
          include: {
            template: true,
          },
        },
      },
    })

    if (!session) {
      endTrace('pauseTrainingSession', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' })
    }

    if (!['pending', 'running'].includes(session.status)) {
      endTrace('pauseTrainingSession', { userId, botId: session.botId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Apenas sessoes pendentes ou em execucao podem ser pausadas' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'paused', updatedAt: new Date() },
    })

    pauseTrainingSessionProcessing(id)
    await captureTrainingSessionCheckpoint(id, 'paused')

    logger.info('[training] Sessão de treinamento pausada', {
      module: 'training',
      event: 'training_session_paused',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'pauseTrainingSession', 'Sessão pausada', 0, { sessionId: id, userId })
    emitTrainingStatus(userId, id, 'paused')
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

    if (session.status !== 'paused') {
      endTrace('resumeTrainingSession', { userId, botId: session.botId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Apenas sessoes pausadas podem ser retomadas' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'running', updatedAt: new Date() },
    })

    startTrainingSessionProcessing(id, 400)

    logger.info('[training] Sessão de treinamento retomada', {
      module: 'training',
      event: 'training_session_resumed',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'resumeTrainingSession', 'Sessão retomada', 0, { sessionId: id, userId })
    emitTrainingStatus(userId, id, 'running')
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

    if (['completed', 'failed', 'cancelled'].includes(session.status)) {
      endTrace('cancelTrainingSession', { userId, botId: session.botId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'A sessao nao pode mais ser cancelada' })
    }

    await prisma.trainingSession.update({
      where: { id },
      data: { status: 'cancelled', endTime: new Date(), updatedAt: new Date() },
    })

    cancelTrainingSessionProcessing(id)
    await captureTrainingSessionCheckpoint(id, 'cancelled')

    logger.info('[training] Sessão de treinamento cancelada', {
      module: 'training',
      event: 'training_session_cancelled',
      userId,
      sessionId: id,
      botId: session.botId,
    })

    trace('DEBUG', 'training', 'cancelTrainingSession', 'Sessão cancelada', 0, { sessionId: id, userId })
    emitTrainingStatus(userId, id, 'cancelled')
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

    if (session.status !== 'completed') {
      endTrace('testTrainingSession', { userId, botId: session.botId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Conclua o treinamento antes de executar o backtesting' })
    }

    const result = await runTrainingBacktest({
      id: session.id,
      botId: session.botId,
      config: session.config,
    })

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

    if (session.status !== 'completed') {
      endTrace('saveTrainingModel', { userId, botId: session.botId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Somente sessoes concluidas podem ser salvas' })
    }

    const config = JSON.parse(session.config)
    const checkpoint = await readTrainingCheckpoint(id)
    let metrics = safeJsonParse<any[]>(session.metrics, [])
    let bestEpoch = session.bestEpoch ?? null
    let bestValLoss = session.bestValLoss ?? null
    let evaluationOverride: ReturnType<typeof buildTrainingEvaluationSummary> | undefined
    let enginePackage: Awaited<ReturnType<typeof trainRealModelPackage>>['enginePackage'] | undefined

    if (isPythonMlEngineEnabled()) {
      if (checkpoint?.enginePackage && checkpoint?.evaluation) {
        metrics = Array.isArray(checkpoint.metrics) ? checkpoint.metrics : metrics
        bestEpoch = checkpoint.summary.bestEpoch ?? null
        bestValLoss = checkpoint.summary.bestValLoss ?? null
        evaluationOverride = checkpoint.evaluation as unknown as ReturnType<typeof buildTrainingEvaluationSummary>
        enginePackage = checkpoint.enginePackage
      } else {
        const trainingResult = await trainRealModelPackage(config)
        metrics = trainingResult.metrics
        bestEpoch = trainingResult.evaluation.bestEpoch ?? null
        bestValLoss = trainingResult.evaluation.bestValLoss ?? null
        evaluationOverride = trainingResult.evaluation as unknown as ReturnType<typeof buildTrainingEvaluationSummary>
        enginePackage = trainingResult.enginePackage
      }
    }

    const artifact = await saveTrainingModelArtifact({
      sessionId: id,
      userId,
      botId: session.botId,
      modelVersion: config.modelVersion,
      config,
      metrics,
      bestEpoch,
      bestValLoss,
      evaluationOverride,
      enginePackage,
    })
    const modelUrl = artifact.modelUrl
    const savedArtifact = await readTrainingModelArtifactJson(modelUrl)

    await prisma.trainingSession.update({
      where: { id },
      data: {
        metrics: JSON.stringify(metrics),
        bestEpoch,
        bestValLoss,
        modelUrl,
        updatedAt: new Date(),
      },
    })

    await prisma.bot.update({
      where: { id: session.botId },
      data: {
        modelVersion: config.modelVersion,
        modelUrl,
        updatedAt: new Date(),
      },
    })

    const registeredModel = await registerBotModelArtifact({
      userId,
      botId: session.botId,
      trainingSessionId: id,
      artifact: savedArtifact,
      modelUrl,
      notes: isPythonMlEngineEnabled()
        ? 'Modelo salvo a partir de treinamento real em engine Python.'
        : 'Modelo salvo a partir do pipeline simulado do backend.',
    })

    logger.info('[training] Modelo salvo para sessão de treinamento', {
      module: 'training',
      event: 'training_model_saved',
      userId,
      sessionId: id,
      botId: session.botId,
      modelUrl,
      modelVersion: config.modelVersion,
      artifactSize: artifact.size,
      autoPromoted: registeredModel.autoPromoted,
      governanceRole: registeredModel.artifact.governanceRole,
    })

    trace('DEBUG', 'training', 'saveTrainingModel', 'Modelo salvo', 0, {
      sessionId: id,
      modelUrl,
      userId,
    })
    endTrace('saveTrainingModel', { userId, botId: session.botId })
    return res.json({
      success: true,
      data: {
        modelUrl,
        autoPromoted: registeredModel.autoPromoted,
        governanceRole: registeredModel.artifact.governanceRole,
        modelArtifactId: registeredModel.artifact.id,
      },
    })
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

    const { buffer, filename } = await readTrainingModelArtifact(session.modelUrl)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    trace('DEBUG', 'training', 'downloadTrainingModel', 'Modelo baixado', 0, {
      sessionId: id,
      userId,
    })
    endTrace('downloadTrainingModel', { userId, botId: session.botId })
    return res.send(buffer)
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
