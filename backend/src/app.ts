import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'

import { prisma } from './config/database'
import { authMiddleware, resolveAuthenticatedUserFromToken, type AuthenticatedUser } from './middleware/auth.middleware'
import { botRuntimeAuthMiddleware, hasValidBotRuntimeSecret } from './middleware/bot-runtime-auth.middleware'
import {
  getScopedRoom,
  getSystemLogsRoom,
  getTrainingRoom,
  getUserRoom,
  setSocketServer,
} from './services/socket.service'
import { startBotWorker, stopBotWorker } from './services/bot-runner.service'
import { startBinanceUserStreamService, stopBinanceUserStreamService } from './services/binance-user-stream.service'
import { syncBotTemplateCatalog } from './services/bot-template-catalog.service'
import { setInternalApiBaseUrl } from './services/internal-api-base-url.service'
import { startPairDiscoveryRunner, stopPairDiscoveryRunner } from './services/pair-discovery-runner.service'
import { startTrainingWorker, stopTrainingWorker } from './services/training-worker.service'
import { logger } from './utils/logger'

import * as authController from './controllers/auth.controller'
import * as botRuntimeController from './controllers/bot-runtime.controller'
import * as healthController from './controllers/health.controller'
import * as dashboardController from './controllers/dashboard.controller'
import * as configurationsController from './controllers/configurations.controller'
import * as trainingController from './controllers/training.controller'
import * as transactionsController from './controllers/transactions.controller'
import * as logsController from './controllers/logs.controller'
import * as profileController from './controllers/profile.controller'

dotenv.config()

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})

setSocketServer(io)

process.on('unhandledRejection', (reason) => {
  logger.error('[app] Unhandled promise rejection', {
    module: 'app',
    event: 'unhandled_rejection',
    reason,
  })
})

process.on('uncaughtException', (error) => {
  logger.error('[app] Uncaught exception', {
    module: 'app',
    event: 'uncaught_exception',
    error,
  })
})

app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  skip: (req) => hasValidBotRuntimeSecret(req),
  message: { success: false, error: 'Muitas requisições, tente novamente mais tarde' },
  handler: (req, res) => {
    logger.warn('[app] Limite de requisições excedido', {
      module: 'app',
      event: 'rate_limit_exceeded',
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    })

    res.status(429).json({ success: false, error: 'Muitas requisições, tente novamente mais tarde' })
  },
})

app.use('/api/', limiter)

io.use(async (socket, next) => {
  try {
    const authToken = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : null
    const headerToken = typeof socket.handshake.headers.authorization === 'string'
      ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '').trim()
      : null
    const token = authToken || headerToken

    if (!token) {
      return next(new Error('Token não fornecido'))
    }

    const user = await resolveAuthenticatedUserFromToken(token)
    socket.data.user = user
    socket.data.userId = user.id

    return next()
  } catch (error) {
    return next(new Error('Token inválido ou expirado'))
  }
})

io.on('connection', (socket) => {
  const user = socket.data.user as AuthenticatedUser | undefined
  const userId = socket.data.userId as string | undefined

  if (!user || !userId) {
    socket.emit('error', { error: 'Sessão não autenticada' })
    socket.disconnect(true)
    return
  }

  socket.join(getUserRoom(userId))

  logger.info('[app] WebSocket conectado', {
    module: 'app',
    event: 'websocket_connected',
    socketId: socket.id,
    userId,
  })

  socket.emit('connected', { message: 'connected', userId })

  socket.on('subscribe:dashboard', () => {
    socket.join(getScopedRoom(userId, 'dashboard'))
    logger.debug('[app] Cliente inscrito em dashboard', {
      module: 'app',
      event: 'ws_subscribe_dashboard',
      socketId: socket.id,
      userId,
    })
  })

  socket.on('subscribe:orders', () => {
    socket.join(getScopedRoom(userId, 'orders'))
    logger.debug('[app] Cliente inscrito em orders', {
      module: 'app',
      event: 'ws_subscribe_orders',
      socketId: socket.id,
      userId,
    })
  })

  socket.on('subscribe:logs', () => {
    socket.join(getScopedRoom(userId, 'logs'))
    socket.join(getSystemLogsRoom())
    logger.debug('[app] Cliente inscrito em logs', {
      module: 'app',
      event: 'ws_subscribe_logs',
      socketId: socket.id,
      userId,
    })
  })

  socket.on('subscribe:traces', () => {
    socket.join(getScopedRoom(userId, 'traces'))
    logger.debug('[app] Cliente inscrito em traces', {
      module: 'app',
      event: 'ws_subscribe_traces',
      socketId: socket.id,
      userId,
    })
  })

  socket.on('subscribe:training', async (sessionId: string) => {
    try {
      if (!sessionId) {
        socket.emit('error', { error: 'Sessão de treinamento inválida' })
        return
      }

      const session = await prisma.trainingSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      })

      if (!session) {
        socket.emit('error', { error: 'Sessão de treinamento não encontrada' })
        return
      }

      socket.join(getTrainingRoom(userId, sessionId))
      logger.debug('[app] Cliente inscrito em training', {
        module: 'app',
        event: 'ws_subscribe_training',
        socketId: socket.id,
        userId,
        sessionId,
      })
    } catch (error) {
      logger.warn('[app] Falha ao inscrever cliente em training', {
        module: 'app',
        event: 'ws_subscribe_training_error',
        socketId: socket.id,
        userId,
        sessionId,
        error,
      })
      socket.emit('error', { error: 'Não foi possível inscrever na sessão de treinamento' })
    }
  })

  socket.on('unsubscribe:dashboard', () => {
    socket.leave(getScopedRoom(userId, 'dashboard'))
  })

  socket.on('unsubscribe:orders', () => {
    socket.leave(getScopedRoom(userId, 'orders'))
  })

  socket.on('unsubscribe:logs', () => {
    socket.leave(getScopedRoom(userId, 'logs'))
    socket.leave(getSystemLogsRoom())
  })

  socket.on('unsubscribe:traces', () => {
    socket.leave(getScopedRoom(userId, 'traces'))
  })

  socket.on('unsubscribe:training', (sessionId: string) => {
    if (!sessionId) {
      return
    }

    socket.leave(getTrainingRoom(userId, sessionId))
  })

  socket.on('disconnect', () => {
    logger.info('[app] WebSocket desconectado', {
      module: 'app',
      event: 'websocket_disconnected',
      socketId: socket.id,
      userId,
    })
  })
})

app.get('/health', healthController.getReadiness)
app.get('/health/live', healthController.getLiveness)
app.get('/health/ready', healthController.getReadiness)
app.get('/api/bot-runtime/heartbeat', botRuntimeAuthMiddleware, botRuntimeController.getBotRuntimeHeartbeat)
app.post('/api/bot-runtime/heartbeat', botRuntimeAuthMiddleware, botRuntimeController.postBotRuntimeHeartbeat)
app.get('/api/bot-runtime/queue', botRuntimeAuthMiddleware, botRuntimeController.getBotRuntimeQueue)
app.post('/api/bot-runtime/maintenance', botRuntimeAuthMiddleware, botRuntimeController.postBotRuntimeMaintenance)
app.get('/api/bot-runtime/bots/:id/cycle-context', botRuntimeAuthMiddleware, botRuntimeController.getBotRuntimeCycleContext)
app.post('/api/bot-runtime/bots/:id/apply-cycle', botRuntimeAuthMiddleware, botRuntimeController.applyBotRuntimeCycle)

app.post('/api/auth/login', authController.login)
app.post('/api/auth/register', authController.register)

app.get('/api/auth/me', authMiddleware, authController.getMe)
app.post('/api/auth/logout', authMiddleware, authController.logout)
app.put('/api/auth/password', authMiddleware, authController.changePassword)
app.put('/api/auth/change-password', authMiddleware, authController.changePassword)

app.get('/api/dashboard/total-balance', authMiddleware, dashboardController.getTotalBalance)
app.get('/api/dashboard/currencies-balance', authMiddleware, dashboardController.getCurrenciesBalance)
app.get('/api/dashboard/recent-transactions', authMiddleware, dashboardController.getRecentTransactions)
app.get('/api/dashboard/transactions/recent', authMiddleware, dashboardController.getRecentTransactions)
app.get('/api/dashboard/bots-status', authMiddleware, dashboardController.getBotsStatus)
app.get('/api/dashboard/bots/templates', authMiddleware, dashboardController.getBotTemplates)
app.get('/api/dashboard/bots', authMiddleware, dashboardController.getBotsStatus)
app.get('/api/dashboard/bots/worker-status', authMiddleware, dashboardController.getBotWorkerStatus)
app.get('/api/dashboard/bots/:id', authMiddleware, dashboardController.getBotDetail)
app.get('/api/dashboard/bots/:id/history', authMiddleware, dashboardController.getBotHistory)
app.get('/api/dashboard/bots/:id/homologation-report', authMiddleware, dashboardController.getBotHomologationReport)
app.get('/api/dashboard/bots/:id/models', authMiddleware, dashboardController.getBotModels)
app.get('/api/dashboard/bots/:id/analysis', authMiddleware, dashboardController.getBotAnalysis)
app.post('/api/dashboard/bots', authMiddleware, dashboardController.createBot)
app.post('/api/dashboard/bots/:id/run', authMiddleware, dashboardController.runBotCycleNow)
app.post('/api/dashboard/bots/:id/models/:modelId/promote', authMiddleware, dashboardController.promoteBotModel)
app.post('/api/dashboard/bots/:id/models/:modelId/archive', authMiddleware, dashboardController.archiveBotModel)
app.post('/api/dashboard/bots/:id/pause', authMiddleware, dashboardController.pauseBot)
app.put('/api/dashboard/bots/:id/pause', authMiddleware, dashboardController.pauseBot)
app.post('/api/dashboard/bots/:id/resume', authMiddleware, dashboardController.resumeBot)
app.put('/api/dashboard/bots/:id/resume', authMiddleware, dashboardController.resumeBot)
app.put('/api/dashboard/bots/:id', authMiddleware, dashboardController.updateBot)
app.delete('/api/dashboard/bots/:id', authMiddleware, dashboardController.deleteBot)
app.get('/api/dashboard/performance', authMiddleware, dashboardController.getPerformance)

app.get('/api/configurations', authMiddleware, configurationsController.getConfigurations)
app.put('/api/configurations', authMiddleware, configurationsController.putConfigurations)
app.get('/api/configurations/backup/export', authMiddleware, configurationsController.exportConfigurationBackupSnapshot)
app.post('/api/configurations/backup/restore', authMiddleware, configurationsController.restoreConfigurationBackupSnapshot)
app.post('/api/configurations/reset', authMiddleware, configurationsController.runConfigurationReset)
app.post('/api/configurations/test-connection', authMiddleware, configurationsController.testConnection)
app.post('/api/configurations/test', authMiddleware, configurationsController.testConnection)
app.get('/api/configurations/exchange-pairs', authMiddleware, configurationsController.getExchangePairs)
app.post('/api/configurations/pair-discovery/preview', authMiddleware, configurationsController.previewPairDiscovery)
app.post('/api/configurations/pair-discovery/apply', authMiddleware, configurationsController.applyPairDiscovery)
app.post('/api/configurations/pair-discovery/run', authMiddleware, configurationsController.runPairDiscoveryNow)
app.get('/api/exchange/pairs', authMiddleware, configurationsController.getExchangePairs)
app.get('/api/social/latest', authMiddleware, configurationsController.getSocialLatest)

app.get('/api/training/strategies', authMiddleware, trainingController.getStrategies)
app.get('/api/training/sessions', authMiddleware, trainingController.getTrainingSessions)
app.post('/api/training/upload', authMiddleware, trainingController.uploadTrainingDataset)
app.post('/api/training/sessions', authMiddleware, trainingController.createTrainingSession)
app.get('/api/training/sessions/:id', authMiddleware, trainingController.getTrainingSessionById)
app.post('/api/training/sessions/:id/pause', authMiddleware, trainingController.pauseTrainingSession)
app.put('/api/training/sessions/:id/pause', authMiddleware, trainingController.pauseTrainingSession)
app.post('/api/training/sessions/:id/resume', authMiddleware, trainingController.resumeTrainingSession)
app.put('/api/training/sessions/:id/resume', authMiddleware, trainingController.resumeTrainingSession)
app.post('/api/training/sessions/:id/cancel', authMiddleware, trainingController.cancelTrainingSession)
app.delete('/api/training/sessions/:id/cancel', authMiddleware, trainingController.cancelTrainingSession)
app.post('/api/training/sessions/:id/test', authMiddleware, trainingController.testTrainingSession)
app.post('/api/training/sessions/:id/save', authMiddleware, trainingController.saveTrainingModel)
app.get('/api/training/sessions/:id/download', authMiddleware, trainingController.downloadTrainingModel)

app.get('/api/orders', authMiddleware, transactionsController.getOrders)
app.get('/api/orders/:id', authMiddleware, transactionsController.getOrderById)
app.post('/api/orders', authMiddleware, transactionsController.createOrder)
app.post('/api/orders/reconcile', authMiddleware, transactionsController.reconcileOrders)
app.post('/api/orders/:id/reconcile', authMiddleware, transactionsController.reconcileOrder)
app.delete('/api/orders/:id/cancel', authMiddleware, transactionsController.cancelOrder)
app.get('/api/balance', authMiddleware, transactionsController.getBalance)
app.get('/api/exchange/rate', authMiddleware, transactionsController.getExchangeRate)
app.get('/api/exchange/price', authMiddleware, transactionsController.getPrice)
app.get('/api/exchange/orderbook', authMiddleware, transactionsController.getOrderBook)
app.get('/api/exchange/candles', authMiddleware, transactionsController.getCandles)

app.post('/api/logs', authMiddleware, logsController.createLogEntry)
app.get('/api/logs', authMiddleware, logsController.getLogs)
app.post('/api/traces', authMiddleware, logsController.createTraceEntry)
app.get('/api/traces', authMiddleware, logsController.getTraces)
app.get('/api/traces/group/:traceId', authMiddleware, logsController.getTraceGroup)
app.get('/api/logs/export', authMiddleware, logsController.exportLogs)
app.get('/api/traces/export', authMiddleware, logsController.exportTraces)
app.get('/api/traces/export-analysis', authMiddleware, logsController.exportTracesForAnalysis)
app.get('/api/traces/bots', authMiddleware, logsController.getBotsForFilter)

app.get('/api/profile', authMiddleware, profileController.getProfile)
app.put('/api/profile', authMiddleware, profileController.updateProfile)
app.put('/api/profile/preferences', authMiddleware, profileController.updatePreferences)
app.put('/api/profile/password', authMiddleware, profileController.changePassword)

app.use('*', (req, res) => {
  logger.warn('[app] Rota não encontrada', {
    module: 'app',
    event: 'route_not_found',
    method: req.method,
    path: req.originalUrl,
  })

  res.status(404).json({ success: false, error: 'Rota não encontrada' })
})

const PORT = Number(process.env.PORT || 3001)

function shouldStartInternalBotWorker(): boolean {
  return process.env.NODE_ENV !== 'test'
    && process.env.BOT_WORKER_AUTOSTART !== 'false'
    && process.env.BOT_RUNTIME_EXPECT_EXTERNAL_SERVICE !== 'true'
}

function logServerStartup(port: number | string): void {
  logger.info('[app] Servidor iniciado', {
    module: 'app',
    event: 'server_started',
    port: PORT,
    httpUrl: `http://localhost:${PORT}`,
    websocketUrl: `ws://localhost:${PORT}`,
  })

  logger.info('[app] Endpoints disponíveis', {
    module: 'app',
    event: 'available_endpoints',
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/auth/me',
      'GET /api/dashboard/*',
      'GET /api/configurations',
      'PUT /api/configurations',
      'GET /api/configurations/backup/export',
      'POST /api/configurations/backup/restore',
      'GET /api/training/*',
      'POST /api/training/sessions',
      'GET /api/orders',
      'POST /api/orders',
      'GET /api/logs',
      'GET /api/traces',
      'GET /api/profile',
    ],
  })
}

export async function startServer(port: number = PORT): Promise<typeof httpServer> {
  if (httpServer.listening) {
    return httpServer
  }

  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      httpServer.off('error', handleError)
      reject(error)
    }

    httpServer.once('error', handleError)
    httpServer.listen(port, () => {
      httpServer.off('error', handleError)
      const address = httpServer.address()
      const resolvedPort =
        typeof address === 'object' && address && 'port' in address
          ? address.port
          : port

      setInternalApiBaseUrl(`http://127.0.0.1:${resolvedPort}`)
      void syncBotTemplateCatalog().catch((error) => {
        logger.warn('[app] Falha ao sincronizar catalogo de templates de bots na inicializacao', {
          module: 'app',
          event: 'bot_template_catalog_sync_error',
          error,
          skipPersistence: true,
        })
      })
      logServerStartup(resolvedPort)
      if (process.env.TRAINING_WORKER_AUTOSTART !== 'false' && process.env.NODE_ENV !== 'test') {
        startTrainingWorker()
      }
      if (shouldStartInternalBotWorker()) {
        startBotWorker()
      }
      if (process.env.BINANCE_USER_STREAM_AUTOSTART !== 'false' && process.env.NODE_ENV !== 'test') {
        startBinanceUserStreamService()
      }
      if (process.env.PAIR_DISCOVERY_AUTOSYNC_AUTOSTART !== 'false' && process.env.NODE_ENV !== 'test') {
        startPairDiscoveryRunner()
      }
      resolve(httpServer)
    })
  })
}

httpServer.on('close', () => {
  stopBotWorker()
  stopBinanceUserStreamService()
  stopPairDiscoveryRunner()
  stopTrainingWorker()
})

if (require.main === module) {
  void startServer().catch((error) => {
    logger.error('[app] Erro ao iniciar servidor', {
      module: 'app',
      event: 'server_start_error',
      error,
    })

    process.exitCode = 1
  })
}

export { app, httpServer, io }
