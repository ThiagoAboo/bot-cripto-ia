import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'

import { authMiddleware } from './middleware/auth.middleware'
import { logger } from './utils/logger'

import * as authController from './controllers/auth.controller'
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
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
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

io.on('connection', (socket) => {
  logger.info('[app] WebSocket conectado', {
    module: 'app',
    event: 'websocket_connected',
    socketId: socket.id,
  })

  socket.on('subscribe:dashboard', () => {
    socket.join('dashboard')
    logger.debug('[app] Cliente inscrito em dashboard', {
      module: 'app',
      event: 'ws_subscribe_dashboard',
      socketId: socket.id,
    })
  })

  socket.on('subscribe:orders', () => {
    socket.join('orders')
    logger.debug('[app] Cliente inscrito em orders', {
      module: 'app',
      event: 'ws_subscribe_orders',
      socketId: socket.id,
    })
  })

  socket.on('subscribe:logs', () => {
    socket.join('logs')
    logger.debug('[app] Cliente inscrito em logs', {
      module: 'app',
      event: 'ws_subscribe_logs',
      socketId: socket.id,
    })
  })

  socket.on('subscribe:traces', () => {
    socket.join('traces')
    logger.debug('[app] Cliente inscrito em traces', {
      module: 'app',
      event: 'ws_subscribe_traces',
      socketId: socket.id,
    })
  })

  socket.on('subscribe:training', (sessionId: string) => {
    socket.join(`training:${sessionId}`)
    logger.debug('[app] Cliente inscrito em training', {
      module: 'app',
      event: 'ws_subscribe_training',
      socketId: socket.id,
      sessionId,
    })
  })

  socket.on('unsubscribe:dashboard', () => {
    socket.leave('dashboard')
  })

  socket.on('unsubscribe:orders', () => {
    socket.leave('orders')
  })

  socket.on('unsubscribe:logs', () => {
    socket.leave('logs')
  })

  socket.on('unsubscribe:traces', () => {
    socket.leave('traces')
  })

  socket.on('unsubscribe:training', (sessionId: string) => {
    socket.leave(`training:${sessionId}`)
  })

  socket.on('disconnect', () => {
    logger.info('[app] WebSocket desconectado', {
      module: 'app',
      event: 'websocket_disconnected',
      socketId: socket.id,
    })
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/api/auth/login', authController.login)
app.post('/api/auth/register', authController.register)

app.get('/api/auth/me', authMiddleware, authController.getMe)
app.post('/api/auth/logout', authMiddleware, authController.logout)
app.put('/api/auth/password', authMiddleware, authController.changePassword)

app.get('/api/dashboard/total-balance', authMiddleware, dashboardController.getTotalBalance)
app.get('/api/dashboard/currencies-balance', authMiddleware, dashboardController.getCurrenciesBalance)
app.get('/api/dashboard/recent-transactions', authMiddleware, dashboardController.getRecentTransactions)
app.get('/api/dashboard/bots-status', authMiddleware, dashboardController.getBotsStatus)
app.post('/api/dashboard/bots/:id/pause', authMiddleware, dashboardController.pauseBot)
app.post('/api/dashboard/bots/:id/resume', authMiddleware, dashboardController.resumeBot)
app.get('/api/dashboard/performance', authMiddleware, dashboardController.getPerformance)

app.get('/api/configurations', authMiddleware, configurationsController.getConfigurations)
app.put('/api/configurations', authMiddleware, configurationsController.putConfigurations)
app.post('/api/configurations/test-connection', authMiddleware, configurationsController.testConnection)
app.get('/api/configurations/exchange-pairs', authMiddleware, configurationsController.getExchangePairs)

app.get('/api/training/strategies', authMiddleware, trainingController.getStrategies)
app.get('/api/training/sessions', authMiddleware, trainingController.getTrainingSessions)
app.post('/api/training/sessions', authMiddleware, trainingController.createTrainingSession)
app.get('/api/training/sessions/:id', authMiddleware, trainingController.getTrainingSessionById)
app.post('/api/training/sessions/:id/pause', authMiddleware, trainingController.pauseTrainingSession)
app.post('/api/training/sessions/:id/resume', authMiddleware, trainingController.resumeTrainingSession)
app.post('/api/training/sessions/:id/cancel', authMiddleware, trainingController.cancelTrainingSession)
app.post('/api/training/sessions/:id/test', authMiddleware, trainingController.testTrainingSession)
app.post('/api/training/sessions/:id/save', authMiddleware, trainingController.saveTrainingModel)
app.get('/api/training/sessions/:id/download', authMiddleware, trainingController.downloadTrainingModel)

app.get('/api/orders', authMiddleware, transactionsController.getOrders)
app.post('/api/orders', authMiddleware, transactionsController.createOrder)
app.delete('/api/orders/:id/cancel', authMiddleware, transactionsController.cancelOrder)
app.get('/api/balance', authMiddleware, transactionsController.getBalance)
app.get('/api/exchange/rate', authMiddleware, transactionsController.getExchangeRate)
app.get('/api/exchange/candles', authMiddleware, transactionsController.getCandles)

app.get('/api/logs', authMiddleware, logsController.getLogs)
app.get('/api/traces', authMiddleware, logsController.getTraces)
app.get('/api/traces/group/:traceId', authMiddleware, logsController.getTraceGroup)
app.get('/api/logs/export', authMiddleware, logsController.exportLogs)
app.get('/api/traces/export', authMiddleware, logsController.exportTraces)
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

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
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
      'GET /api/training/*',
      'POST /api/training/sessions',
      'GET /api/orders',
      'POST /api/orders',
      'GET /api/logs',
      'GET /api/traces',
      'GET /api/profile',
    ],
  })
})

export { io }
