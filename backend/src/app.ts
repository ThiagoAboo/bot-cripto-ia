import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { authMiddleware } from './middleware/auth.middleware'
import { installConsoleCapture, logger } from './utils/logger'

// Import controllers
import * as authController from './controllers/auth.controller'
import * as dashboardController from './controllers/dashboard.controller'
import * as configurationsController from './controllers/configurations.controller'
import * as trainingController from './controllers/training.controller'
import * as transactionsController from './controllers/transactions.controller'
import * as logsController from './controllers/logs.controller'
import * as profileController from './controllers/profile.controller'

dotenv.config()
installConsoleCapture()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }
})

// ==============================
// MIDDLEWARES GLOBAIS
// ==============================
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 300, // limite de 300 requisições por minuto (aumentado)
  message: { success: false, error: 'Muitas requisições, tente novamente mais tarde' }
})
app.use('/api/', limiter)

// ==============================
// WEBSOCKET
// ==============================
io.on('connection', (socket) => {
  logger.info(`WebSocket connected: ${socket.id}`)
  
  socket.on('subscribe:dashboard', () => {
    socket.join('dashboard')
    logger.debug(`Client ${socket.id} subscribed to dashboard`)
  })
  
  socket.on('subscribe:orders', () => {
    socket.join('orders')
    logger.debug(`Client ${socket.id} subscribed to orders`)
  })
  
  socket.on('subscribe:logs', () => {
    socket.join('logs')
    logger.debug(`Client ${socket.id} subscribed to logs`)
  })
  
  socket.on('subscribe:traces', () => {
    socket.join('traces')
    logger.debug(`Client ${socket.id} subscribed to traces`)
  })
  
  socket.on('subscribe:training', (sessionId: string) => {
    socket.join(`training:${sessionId}`)
    logger.debug(`Client ${socket.id} subscribed to training:${sessionId}`)
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
    logger.info(`WebSocket disconnected: ${socket.id}`)
  })
})

// ==============================
// ROTAS PÚBLICAS
// ==============================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Auth routes (públicas)
app.post('/api/auth/login', authController.login)
app.post('/api/auth/register', authController.register)

// ==============================
// ROTAS PROTEGIDAS (requerem autenticação)
// ==============================

// Auth
app.get('/api/auth/me', authMiddleware, authController.getMe)
app.post('/api/auth/logout', authMiddleware, authController.logout)
app.put('/api/auth/change-password', authMiddleware, authController.changePassword)

// Dashboard
app.get('/api/dashboard/total-balance', authMiddleware, dashboardController.getTotalBalance)
app.get('/api/dashboard/currencies-balance', authMiddleware, dashboardController.getCurrenciesBalance)
app.get('/api/dashboard/transactions/recent', authMiddleware, dashboardController.getRecentTransactions)
app.get('/api/dashboard/bots-status', authMiddleware, dashboardController.getBotsStatus)
app.get('/api/dashboard/performance', authMiddleware, dashboardController.getPerformance)
app.put('/api/dashboard/bots/:id/pause', authMiddleware, dashboardController.pauseBot)
app.put('/api/dashboard/bots/:id/resume', authMiddleware, dashboardController.resumeBot)

// Configurations
app.get('/api/configurations', authMiddleware, configurationsController.getConfigurations)
app.put('/api/configurations', authMiddleware, configurationsController.putConfigurations)
app.post('/api/configurations/test-connection', authMiddleware, configurationsController.testConnection)
app.get('/api/exchange/pairs', authMiddleware, configurationsController.getExchangePairs)

// Training
app.get('/api/training/strategies', authMiddleware, trainingController.getStrategies)
app.get('/api/training/sessions', authMiddleware, trainingController.getTrainingSessions)
app.post('/api/training/sessions', authMiddleware, trainingController.createTrainingSession)
app.get('/api/training/sessions/:id', authMiddleware, trainingController.getTrainingSessionById)
app.put('/api/training/sessions/:id/pause', authMiddleware, trainingController.pauseTrainingSession)
app.put('/api/training/sessions/:id/resume', authMiddleware, trainingController.resumeTrainingSession)
app.delete('/api/training/sessions/:id/cancel', authMiddleware, trainingController.cancelTrainingSession)
app.post('/api/training/sessions/:id/test', authMiddleware, trainingController.testTrainingSession)
app.post('/api/training/sessions/:id/save', authMiddleware, trainingController.saveTrainingModel)
app.get('/api/training/sessions/:id/download', authMiddleware, trainingController.downloadTrainingModel)

// Transactions
app.get('/api/orders', authMiddleware, transactionsController.getOrders)
app.post('/api/orders', authMiddleware, transactionsController.createOrder)
app.delete('/api/orders/:id/cancel', authMiddleware, transactionsController.cancelOrder)
app.get('/api/balance', authMiddleware, transactionsController.getBalance)
app.get('/api/exchange/rate', authMiddleware, transactionsController.getExchangeRate)
app.get('/api/exchange/candles', authMiddleware, transactionsController.getCandles)

// Logs
app.get('/api/logs', authMiddleware, logsController.getLogs)
app.get('/api/traces', authMiddleware, logsController.getTraces)
app.get('/api/traces/group/:traceId', authMiddleware, logsController.getTraceGroup)
app.get('/api/logs/export', authMiddleware, logsController.exportLogs)
app.get('/api/traces/export', authMiddleware, logsController.exportTraces)
app.get('/api/traces/bots', authMiddleware, logsController.getBotsForFilter)

// Profile
app.get('/api/profile', authMiddleware, profileController.getProfile)
app.put('/api/profile', authMiddleware, profileController.updateProfile)
app.put('/api/profile/preferences', authMiddleware, profileController.updatePreferences)

// ==============================
// TRATAMENTO DE ERROS 404
// ==============================
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' })
})

// ==============================
// INICIALIZAÇÃO DO SERVIDOR
// ==============================
const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`)
  logger.info(`📍 http://localhost:${PORT}`)
  logger.info(`🔌 WebSocket enabled at ws://localhost:${PORT}`)
  logger.info(`📋 API endpoints:`)
  logger.info(`   POST   /api/auth/login`)
  logger.info(`   GET    /api/auth/me`)
  logger.info(`   GET    /api/dashboard/*`)
  logger.info(`   GET    /api/configurations`)
  logger.info(`   PUT    /api/configurations`)
  logger.info(`   GET    /api/training/*`)
  logger.info(`   POST   /api/training/sessions`)
  logger.info(`   GET    /api/orders`)
  logger.info(`   POST   /api/orders`)
  logger.info(`   GET    /api/logs`)
  logger.info(`   GET    /api/traces`)
  logger.info(`   GET    /api/profile`)
})

export { io }