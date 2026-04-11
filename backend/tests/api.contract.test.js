require('ts-node/register/transpile-only')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.TRAINING_MODEL_STORAGE_DIR = process.env.TRAINING_MODEL_STORAGE_DIR || require('node:path').join(__dirname, '.tmp-models')
process.env.TRAINING_UPLOAD_STORAGE_DIR = process.env.TRAINING_UPLOAD_STORAGE_DIR || require('node:path').join(__dirname, '.tmp-uploads')

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { after, afterEach, before, beforeEach, describe, it } = require('node:test')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { io: createSocketClient } = require('../../frontend/node_modules/socket.io-client')

const { startServer, httpServer } = require('../src/app')
const { prisma } = require('../src/config/database')
const loggerModule = require('../src/utils/logger')
const tracerModule = require('../src/utils/tracer')
const marketValuationService = require('../src/services/market-valuation.service')
const portfolioService = require('../src/services/portfolio.service')
const socketService = require('../src/services/socket.service')
const binanceService = require('../src/services/binance.service')
const trainingDataService = require('../src/services/training-data.service')
const trainingSessionService = require('../src/services/training-session.service')
const webhookService = require('../src/services/webhook.service')

const restores = []
const TEST_USER = {
  id: 'user-test-1',
  email: 'admin@botcrypto.com',
  name: 'Administrador Teste',
}
const OTHER_TEST_USER = {
  id: 'user-test-2',
  email: 'other@botcrypto.com',
  name: 'Outro Usuário',
}

let baseUrl = ''
const connectedSockets = []

function stub(target, key, implementation) {
  const original = target[key]
  target[key] = implementation
  restores.push(() => {
    target[key] = original
  })
}

function restoreAll() {
  while (restores.length > 0) {
    const restore = restores.pop()
    restore()
  }
}

function silenceObservability() {
  stub(loggerModule.logger, 'info', () => loggerModule.logger)
  stub(loggerModule.logger, 'warn', () => loggerModule.logger)
  stub(loggerModule.logger, 'error', () => loggerModule.logger)
  stub(loggerModule.logger, 'debug', () => loggerModule.logger)

  stub(tracerModule, 'startTrace', () => 'trace-test')
  stub(tracerModule, 'trace', () => undefined)
  stub(tracerModule, 'endTrace', () => undefined)
  stub(tracerModule, 'setCurrentTraceUserId', () => undefined)
}

function buildToken(user = TEST_USER) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  )
}

function authHeaders(user = TEST_USER) {
  return {
    Authorization: `Bearer ${buildToken(user)}`,
  }
}

function buildPersistedUser(user) {
  return {
    ...user,
    passwordHash: user.passwordHash,
    preferences: '{}',
    createdAt: new Date('2026-04-11T10:00:00.000Z'),
    updatedAt: new Date('2026-04-11T10:00:00.000Z'),
  }
}

function stubAuthenticatedUsers(users = [TEST_USER]) {
  stub(prisma.user, 'findUnique', async ({ where }) => {
    const user = users.find((entry) => where?.id === entry.id || where?.email === entry.email)

    if (user) {
      return buildPersistedUser(user)
    }

    return null
  })
}

function stubAuthenticatedUser(user = TEST_USER) {
  stubAuthenticatedUsers([user])
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  return { response, body }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createTestSocket(token) {
  const socket = createSocketClient(baseUrl, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    autoConnect: false,
    reconnection: false,
    timeout: 1000,
  })

  connectedSockets.push(socket)
  return socket
}

function onceSocketEvent(socket, event, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timeout waiting for socket event "${event}"`))
    }, timeoutMs)

    const handler = (payload) => {
      cleanup()
      resolve(payload)
    }

    const cleanup = () => {
      clearTimeout(timer)
      socket.off(event, handler)
    }

    socket.on(event, handler)
  })
}

describe('API contract tests', () => {
  before(async () => {
    silenceObservability()
    await startServer(0)
    const address = httpServer.address()
    baseUrl = `http://127.0.0.1:${address.port}`
    restoreAll()
  })

  after(async () => {
    silenceObservability()

    await new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    await wait(50)
    restoreAll()
  })

  beforeEach(() => {
    silenceObservability()
  })

  afterEach(async () => {
    while (connectedSockets.length > 0) {
      const socket = connectedSockets.pop()
      socket.removeAllListeners()
      socket.disconnect()
      socket.close()
    }

    await wait(50)
    await Promise.all([
      fs.rm(process.env.TRAINING_MODEL_STORAGE_DIR, { recursive: true, force: true }),
      fs.rm(process.env.TRAINING_UPLOAD_STORAGE_DIR, { recursive: true, force: true }),
    ])
    restoreAll()
  })

  it('POST /api/auth/login returns the auth contract for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('admin123', 10)
    stubAuthenticatedUser({ ...TEST_USER, passwordHash })
    stub(prisma.user, 'update', async ({ where }) => ({
      id: where.id,
      lastLogin: new Date(),
    }))

    const { response, body } = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: 'admin123',
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(typeof body.token, 'string')
    assert.deepEqual(body.user, {
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
    })
  })

  it('GET /api/dashboard/total-balance returns the expected balance summary contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.balance, 'findMany', async () => [
      { currency: 'USDT', available: 100 },
    ])
    stub(prisma.transaction, 'findMany', async (args) => {
      if (args.take === 100) {
        return [
          { profitBrl: 50, date: new Date('2026-04-11T08:00:00.000Z') },
          { profitBrl: -10, date: new Date('2026-04-10T08:00:00.000Z') },
        ]
      }

      if (args.where?.date?.gte) {
        return [
          { profitBrl: 50, date: new Date('2026-04-11T08:00:00.000Z') },
        ]
      }

      return [
        { profitBrl: 50, date: new Date('2026-04-11T08:00:00.000Z') },
        { profitBrl: -10, date: new Date('2026-04-10T08:00:00.000Z') },
      ]
    })
    stub(marketValuationService, 'getCurrencyRateToBrl', async (currency) => (currency === 'USDT' ? 5 : 0))
    stub(portfolioService, 'recordBalanceHistorySnapshotValue', async () => undefined)

    const { response, body } = await requestJson('/api/dashboard/total-balance', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.totalBrl, 500)
    assert.equal(body.data.dailyProfitBrl, 50)
    assert.equal(body.data.totalPnlBrl, 40)
    assert.equal(Math.round(body.data.hitRate), 50)
    assert.equal(typeof body.data.lastUpdate, 'string')
  })

  it('GET /api/exchange/candles returns the candles contract used by the transactions chart', async () => {
    stubAuthenticatedUser()
    stub(binanceService, 'getCandles', async () => [
      {
        timestamp: '2026-04-11T12:00:00.000Z',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 1000,
      },
    ])

    const { response, body } = await requestJson('/api/exchange/candles?pair=BTC/USDT&period=1h&limit=1', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.length, 1)
    assert.deepEqual(body.data[0], {
      timestamp: '2026-04-11T12:00:00.000Z',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 1000,
    })
  })

  it('POST /api/orders returns the executed manual order contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.balance, 'findUnique', async () => ({
      available: 1000,
      reserved: 0,
      total: 1000,
    }))
    stub(binanceService, 'getTickerPrice', async () => 100)
    stub(prisma.transaction, 'create', async ({ data }) => ({
      id: 'order-1',
      date: new Date('2026-04-11T12:00:00.000Z'),
      ...data,
    }))
    stub(prisma.balance, 'update', async () => undefined)
    stub(prisma.balance, 'upsert', async () => undefined)
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => undefined)
    stub(webhookService, 'sendWebhook', async () => undefined)

    const { response, body } = await requestJson('/api/orders', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair: 'BTC/USDT',
        type: 'buy',
        quantity: 2,
        orderType: 'market',
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.id, 'order-1')
    assert.equal(body.data.status, 'executed')
    assert.equal(body.data.total, 200)
    assert.equal(body.data.fee, 0.2)
  })

  it('POST /api/training/sessions returns the pending session contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(prisma.bot, 'findUnique', async () => ({
      id: 'bot1',
      name: 'Scalper V2',
      strategyType: 'scalper',
    }))
    stub(prisma.trainingSession, 'create', async ({ data }) => ({
      id: 'session-1',
      botId: data.botId,
      userId: data.userId,
      status: data.status,
      config: data.config,
      metrics: data.metrics,
      startTime: new Date('2026-04-11T12:00:00.000Z'),
      endTime: null,
      bestEpoch: null,
      bestValLoss: null,
      modelUrl: null,
    }))
    stub(prisma.log, 'findMany', async () => [])
    stub(trainingSessionService, 'startTrainingSessionProcessing', () => undefined)
    stub(trainingSessionService, 'getTrainingSessionLogs', async () => [])

    const payload = {
      botId: 'bot1',
      strategyId: 'strategy_scalper',
      architecture: 'lstm',
      modelVersion: 'v1.0.0',
      dataSource: 'exchange',
      trainingPeriod: {
        startDate: '2026-01-01',
        endDate: '2026-04-01',
      },
      includedPairs: ['BTC/USDT'],
      indicators: ['RSI', 'MACD'],
      timeframe: '1h',
      hyperparameters: {
        hiddenLayers: 2,
        neuronsPerLayer: [64, 32],
        dropoutRate: 0.2,
        activation: 'relu',
        batchSize: 32,
        epochs: 20,
        learningRate: 0.001,
        optimizer: 'adam',
        lossFunction: 'mse',
        validationSplit: 0.2,
        earlyStopping: {
          enabled: true,
          patience: 5,
        },
      },
    }

    const { response, body } = await requestJson('/api/training/sessions', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.id, 'session-1')
    assert.equal(body.data.status, 'pending')
    assert.deepEqual(body.data.logs, [])
    assert.equal(body.data.botId, 'bot1')
  })

  it('GET /api/training/strategies derives the catalog from persisted bots', async () => {
    stubAuthenticatedUser()
    stub(prisma.bot, 'findMany', async () => [
      {
        name: 'Momentum Trader',
        strategyType: 'momentum',
        description: 'Identifica moedas com forte momentum',
      },
      {
        name: 'Momentum Trader Replica',
        strategyType: 'momentum',
        description: 'Mesmo tipo para validar deduplicação',
      },
      {
        name: 'Mean Reversion',
        strategyType: 'mean_reversion',
        description: 'Busca reversão à média',
      },
    ])

    const { response, body } = await requestJson('/api/training/strategies', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.deepEqual(body.data, [
      {
        id: 'strategy_momentum',
        name: 'Momentum Trader',
        strategyType: 'momentum',
        description: 'Identifica moedas com forte momentum',
      },
      {
        id: 'strategy_mean_reversion',
        name: 'Mean Reversion',
        strategyType: 'mean_reversion',
        description: 'Busca reversão à média',
      },
    ])
  })

  it('POST /api/training/upload stores a CSV dataset and returns its URL', async () => {
    stubAuthenticatedUser()

    const formData = new FormData()
    formData.append(
      'file',
      new Blob(
        ['timestamp,open,high,low,close,volume\n2026-01-01T00:00:00.000Z,1,2,0.5,1.5,1000'],
        { type: 'text/csv' },
      ),
      'market-dataset.csv',
    )

    const response = await fetch(`${baseUrl}/api/training/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.match(body.data.url, /^\/uploads\/dataset_\d{8}_\d{6}_market-dataset\.csv$/)

    const uploadFile = path.join(process.env.TRAINING_UPLOAD_STORAGE_DIR, path.basename(body.data.url))
    const savedContent = await fs.readFile(uploadFile, 'utf-8')
    assert.match(savedContent, /timestamp,open,high,low,close,volume/)
  })

  it('POST /api/training/sessions rejects upload source without uploadedFileUrl', async () => {
    stubAuthenticatedUser()

    const payload = {
      botId: 'bot1',
      strategyId: 'strategy_scalper',
      architecture: 'lstm',
      modelVersion: 'v1.0.0',
      dataSource: 'upload',
      trainingPeriod: {
        startDate: '2026-01-01',
        endDate: '2026-04-01',
      },
      includedPairs: ['BTC/USDT'],
      indicators: ['RSI'],
      timeframe: '1h',
      hyperparameters: {
        hiddenLayers: 2,
        neuronsPerLayer: [64, 32],
        dropoutRate: 0.2,
        activation: 'relu',
        batchSize: 32,
        epochs: 20,
        learningRate: 0.001,
        optimizer: 'adam',
        lossFunction: 'mse',
        validationSplit: 0.2,
        earlyStopping: {
          enabled: true,
          patience: 5,
        },
      },
    }

    const { response, body } = await requestJson('/api/training/sessions', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    assert.equal(response.status, 400)
    assert.equal(body.success, false)
    assert.match(body.error, /uploadedFileUrl/)
  })

  it('POST /api/training/sessions rejects strategies that do not match the selected bot', async () => {
    stubAuthenticatedUser()
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(prisma.bot, 'findUnique', async () => ({
      id: 'bot1',
      name: 'Scalper V2',
      strategyType: 'scalper',
      status: 'online',
    }))

    const payload = {
      botId: 'bot1',
      strategyId: 'strategy_momentum',
      architecture: 'lstm',
      modelVersion: 'v1.0.0',
      dataSource: 'exchange',
      trainingPeriod: {
        startDate: '2026-01-01',
        endDate: '2026-04-01',
      },
      includedPairs: ['BTC/USDT'],
      indicators: ['RSI'],
      timeframe: '1h',
      hyperparameters: {
        hiddenLayers: 2,
        neuronsPerLayer: [64, 32],
        dropoutRate: 0.2,
        activation: 'relu',
        batchSize: 32,
        epochs: 20,
        learningRate: 0.001,
        optimizer: 'adam',
        lossFunction: 'mse',
        validationSplit: 0.2,
        earlyStopping: {
          enabled: true,
          patience: 5,
        },
      },
    }

    const { response, body } = await requestJson('/api/training/sessions', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    assert.equal(response.status, 400)
    assert.equal(body.success, false)
    assert.match(body.error, /estratégia selecionada/i)
  })

  it('POST /api/dashboard/bots/:id/pause returns success and updates the bot state', async () => {
    stubAuthenticatedUser()

    let updatedBotPayload = null
    stub(prisma.bot, 'update', async ({ where, data }) => {
      updatedBotPayload = { where, data }
      return {
        id: where.id,
        ...data,
      }
    })

    const { response, body } = await requestJson('/api/dashboard/bots/bot1/pause', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(body, { success: true })
    assert.deepEqual(updatedBotPayload.where, { id: 'bot1' })
    assert.equal(updatedBotPayload.data.isPaused, true)
  })

  it('POST /api/training/sessions/:id/pause resumes the training contract for mutable sessions', async () => {
    stubAuthenticatedUser()

    let updatedSessionPayload = null
    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      status: 'running',
    }))
    stub(prisma.trainingSession, 'update', async ({ where, data }) => {
      updatedSessionPayload = { where, data }
      return { id: where.id, ...data }
    })

    const { response, body } = await requestJson('/api/training/sessions/session-1/pause', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(body, { success: true })
    assert.deepEqual(updatedSessionPayload.where, { id: 'session-1' })
    assert.equal(updatedSessionPayload.data.status, 'paused')
  })

  it('POST /api/training/sessions/:id/resume returns success for paused sessions', async () => {
    stubAuthenticatedUser()

    let updatedSessionPayload = null
    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      status: 'paused',
    }))
    stub(prisma.trainingSession, 'update', async ({ where, data }) => {
      updatedSessionPayload = { where, data }
      return { id: where.id, ...data }
    })
    stub(trainingSessionService, 'startTrainingSessionProcessing', () => undefined)

    const { response, body } = await requestJson('/api/training/sessions/session-1/resume', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(body, { success: true })
    assert.deepEqual(updatedSessionPayload.where, { id: 'session-1' })
    assert.equal(updatedSessionPayload.data.status, 'running')
  })

  it('POST /api/training/sessions/:id/cancel returns success for active sessions', async () => {
    stubAuthenticatedUser()

    let updatedSessionPayload = null
    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      status: 'running',
    }))
    stub(prisma.trainingSession, 'update', async ({ where, data }) => {
      updatedSessionPayload = { where, data }
      return { id: where.id, ...data }
    })

    const { response, body } = await requestJson('/api/training/sessions/session-1/cancel', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(body, { success: true })
    assert.deepEqual(updatedSessionPayload.where, { id: 'session-1' })
    assert.equal(updatedSessionPayload.data.status, 'cancelled')
    assert.ok(updatedSessionPayload.data.endTime instanceof Date)
  })

  it('POST /api/training/sessions/:id/test returns computed backtest metrics for completed sessions', async () => {
    stubAuthenticatedUser()
    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      status: 'completed',
      config: JSON.stringify({
        trainingPeriod: {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
        includedPairs: ['BTC/USDT'],
        timeframe: '1h',
      }),
    }))
    stub(trainingDataService, 'collectTrainingData', async () => ({
      'BTC/USDT': [
        {
          timestamp: '2026-02-01T00:00:00.000Z',
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1200,
          SMA_7: 99,
          SMA_14: 98,
          EMA_7: 99.5,
          RSI: 44,
          MACD: 0.8,
        },
        {
          timestamp: '2026-02-01T01:00:00.000Z',
          open: 100,
          high: 106,
          low: 99,
          close: 105,
          volume: 1800,
          SMA_7: 101,
          SMA_14: 99,
          EMA_7: 101,
          RSI: 52,
          MACD: 1.2,
        },
        {
          timestamp: '2026-02-01T02:00:00.000Z',
          open: 105,
          high: 110,
          low: 104,
          close: 109,
          volume: 2000,
          SMA_7: 103,
          SMA_14: 100,
          EMA_7: 103,
          RSI: 71,
          MACD: -0.4,
        },
      ],
    }))

    const { response, body } = await requestJson('/api/training/sessions/session-1/test', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.sessionId, 'session-1')
    assert.equal(body.data.totalTrades, 1)
    assert.equal(typeof body.data.totalProfit, 'number')
    assert.equal(typeof body.data.sharpeRatio, 'number')
    assert.equal(typeof body.data.maxDrawdown, 'number')
    assert.equal(typeof body.data.profitFactor, 'number')
  })

  it('POST /api/training/sessions/:id/save persists a model artifact and updates session/bot metadata', async () => {
    stubAuthenticatedUser()

    let updatedSessionPayload = null
    let updatedBotPayload = null

    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      userId: TEST_USER.id,
      status: 'completed',
      config: JSON.stringify({
        strategyId: 'strategy_scalper',
        modelVersion: 'v2.1.0',
      }),
      metrics: JSON.stringify([
        { epoch: 1, trainLoss: 0.12, valLoss: 0.13, learningRate: 0.001, duration: 350 },
      ]),
      bestEpoch: 1,
      bestValLoss: 0.13,
    }))
    stub(prisma.trainingSession, 'update', async ({ where, data }) => {
      updatedSessionPayload = { where, data }
      return { id: where.id, ...data }
    })
    stub(prisma.bot, 'update', async ({ where, data }) => {
      updatedBotPayload = { where, data }
      return { id: where.id, ...data }
    })

    const { response, body } = await requestJson('/api/training/sessions/session-1/save', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.match(body.data.modelUrl, /^\/models\/model_session-1_v2.1.0\.h5$/)
    assert.equal(updatedSessionPayload.data.modelUrl, body.data.modelUrl)
    assert.equal(updatedBotPayload.data.modelVersion, 'v2.1.0')

    const artifactFile = path.join(process.env.TRAINING_MODEL_STORAGE_DIR, path.basename(body.data.modelUrl))
    const artifactContent = JSON.parse(await fs.readFile(artifactFile, 'utf-8'))

    assert.equal(artifactContent.sessionId, 'session-1')
    assert.equal(artifactContent.botId, 'bot1')
    assert.equal(artifactContent.modelVersion, 'v2.1.0')
  })

  it('GET /api/training/sessions/:id/download streams the saved model artifact', async () => {
    stubAuthenticatedUser()

    await fs.mkdir(process.env.TRAINING_MODEL_STORAGE_DIR, { recursive: true })
    const filename = 'model_session-1_v2.1.0.h5'
    await fs.writeFile(path.join(process.env.TRAINING_MODEL_STORAGE_DIR, filename), 'artifact-content', 'utf-8')

    stub(prisma.trainingSession, 'findFirst', async () => ({
      id: 'session-1',
      botId: 'bot1',
      userId: TEST_USER.id,
      status: 'completed',
      modelUrl: `/models/${filename}`,
    }))

    const response = await fetch(`${baseUrl}/api/training/sessions/session-1/download`, {
      headers: authHeaders(),
    })
    const body = Buffer.from(await response.arrayBuffer()).toString('utf-8')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/octet-stream')
    assert.equal(response.headers.get('content-disposition'), `attachment; filename="${filename}"`)
    assert.equal(body, 'artifact-content')
  })

  it('GET /api/logs returns normalized log entries with pagination metadata', async () => {
    stubAuthenticatedUser()
    stub(loggerModule, 'getSystemLogUserId', async () => 'system-user')
    stub(prisma.log, 'findMany', async () => [
      {
        id: 'log-1',
        timestamp: new Date('2026-04-11T12:00:00.000Z'),
        level: 'DEBUG',
        module: 'app',
        message: 'Servidor iniciado',
        details: JSON.stringify({ event: 'server_started' }),
        userId: 'system-user',
      },
      {
        id: 'log-2',
        timestamp: new Date('2026-04-11T12:05:00.000Z'),
        level: 'ERROR',
        module: 'transactions',
        message: 'Falha ao executar ordem',
        details: JSON.stringify({ orderId: 'order-1' }),
        userId: TEST_USER.id,
      },
    ])
    stub(prisma.log, 'count', async () => 2)

    const { response, body } = await requestJson('/api/logs?page=1&limit=50', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.total, 2)
    assert.equal(body.data.items[0].module, 'system')
    assert.equal(body.data.items[0].level, 'INFO')
    assert.equal(body.data.items[0].isSystem, true)
    assert.deepEqual(body.data.items[1].details, { orderId: 'order-1' })
  })

  it('GET /api/traces returns normalized trace entries with bot metadata', async () => {
    stubAuthenticatedUser()
    stub(prisma.trace, 'findMany', async () => [
      {
        id: 'trace-1',
        timestamp: new Date('2026-04-11T12:00:00.000Z'),
        level: 'TRACE',
        module: 'training',
        traceId: 'trace-root',
        parentTraceId: null,
        functionName: 'createTrainingSession',
        message: 'Sessão criada',
        durationMs: 42,
        botId: 'bot1',
        currentPair: 'BTC/USDT',
        recommendedAction: 'buy',
        confidence: 82,
        errorFlag: false,
        bot: {
          name: 'Scalper V2',
        },
      },
    ])
    stub(prisma.trace, 'count', async () => 1)

    const { response, body } = await requestJson('/api/traces?page=1&limit=50', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.total, 1)
    assert.equal(body.data.items[0].module, 'training')
    assert.equal(body.data.items[0].level, 'TRACE')
    assert.equal(body.data.items[0].botName, 'Scalper V2')
    assert.equal(body.data.items[0].recommendedAction, 'buy')
  })

  it('rejects websocket connections without an auth token', async () => {
    const socket = createTestSocket(undefined)
    const errorPromise = onceSocketEvent(socket, 'connect_error')

    socket.connect()

    const error = await errorPromise
    assert.equal(error.message, 'Token não fornecido')
  })

  it('accepts authenticated websocket connections and emits the connected payload', async () => {
    stubAuthenticatedUser()

    const socket = createTestSocket(buildToken())
    const connectedPromise = onceSocketEvent(socket, 'connected')
    const transportConnectedPromise = onceSocketEvent(socket, 'connect')

    socket.connect()

    await transportConnectedPromise
    const payload = await connectedPromise

    assert.deepEqual(payload, {
      message: 'connected',
      userId: TEST_USER.id,
    })
  })

  it('delivers dashboard realtime events only to the subscribed owner room', async () => {
    stubAuthenticatedUsers([TEST_USER, OTHER_TEST_USER])

    const socketA = createTestSocket(buildToken(TEST_USER))
    const socketB = createTestSocket(buildToken(OTHER_TEST_USER))

    socketA.connect()
    socketB.connect()

    await Promise.all([
      onceSocketEvent(socketA, 'connect'),
      onceSocketEvent(socketB, 'connect'),
    ])

    const receivedByA = []
    const receivedByB = []
    socketA.on('dashboard:update', (payload) => receivedByA.push(payload))
    socketB.on('dashboard:update', (payload) => receivedByB.push(payload))

    socketA.emit('subscribe:dashboard')
    socketB.emit('subscribe:dashboard')
    await wait(50)

    const payload = {
      scope: 'portfolio',
      reason: 'order_executed',
      updatedAt: '2026-04-11T13:00:00.000Z',
    }

    socketService.emitDashboardUpdate(TEST_USER.id, payload)
    await wait(100)

    assert.deepEqual(receivedByA, [payload])
    assert.deepEqual(receivedByB, [])
  })

  it('broadcasts system logs to every client subscribed to the logs stream', async () => {
    stubAuthenticatedUsers([TEST_USER, OTHER_TEST_USER])

    const socketA = createTestSocket(buildToken(TEST_USER))
    const socketB = createTestSocket(buildToken(OTHER_TEST_USER))

    socketA.connect()
    socketB.connect()

    await Promise.all([
      onceSocketEvent(socketA, 'connect'),
      onceSocketEvent(socketB, 'connect'),
    ])

    const receivedByA = []
    const receivedByB = []
    socketA.on('log:new', (payload) => receivedByA.push(payload))
    socketB.on('log:new', (payload) => receivedByB.push(payload))

    socketA.emit('subscribe:logs')
    socketB.emit('subscribe:logs')
    await wait(50)

    const payload = {
      id: 'log-system-1',
      timestamp: '2026-04-11T13:10:00.000Z',
      level: 'INFO',
      module: 'system',
      message: 'Servidor iniciado',
      isSystem: true,
    }

    socketService.emitSystemLogNew(payload)
    await wait(100)

    assert.deepEqual(receivedByA, [payload])
    assert.deepEqual(receivedByB, [payload])
  })

  it('only allows the owner to subscribe to a training room', async () => {
    stubAuthenticatedUsers([TEST_USER, OTHER_TEST_USER])
    stub(prisma.trainingSession, 'findFirst', async ({ where }) => {
      if (where?.id === 'session-1' && where?.userId === TEST_USER.id) {
        return { id: 'session-1' }
      }

      return null
    })

    const socketA = createTestSocket(buildToken(TEST_USER))
    const socketB = createTestSocket(buildToken(OTHER_TEST_USER))

    socketA.connect()
    socketB.connect()

    await Promise.all([
      onceSocketEvent(socketA, 'connect'),
      onceSocketEvent(socketB, 'connect'),
    ])

    const receivedByA = []
    socketA.on('training:status', (payload) => receivedByA.push(payload))

    const forbiddenSubscriptionPromise = onceSocketEvent(socketB, 'error')
    socketA.emit('subscribe:training', 'session-1')
    socketB.emit('subscribe:training', 'session-1')

    const subscriptionError = await forbiddenSubscriptionPromise
    assert.deepEqual(subscriptionError, {
      error: 'Sessão de treinamento não encontrada',
    })

    await wait(50)
    socketService.emitTrainingStatus(TEST_USER.id, 'session-1', 'running')
    await wait(100)

    assert.deepEqual(receivedByA, [
      {
        sessionId: 'session-1',
        status: 'running',
      },
    ])
  })
})
