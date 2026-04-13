require('ts-node/register/transpile-only')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.TRAINING_MODEL_STORAGE_DIR = process.env.TRAINING_MODEL_STORAGE_DIR || require('node:path').join(__dirname, '.tmp-models')
process.env.TRAINING_UPLOAD_STORAGE_DIR = process.env.TRAINING_UPLOAD_STORAGE_DIR || require('node:path').join(__dirname, '.tmp-uploads')
process.env.TRAINING_CHECKPOINT_STORAGE_DIR = process.env.TRAINING_CHECKPOINT_STORAGE_DIR || require('node:path').join(__dirname, '.tmp-checkpoints')

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
const pairDiscoveryService = require('../src/services/pair-discovery.service')
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

function buildPersistedConfiguration(overrides = {}) {
  return {
    exchange: 'binance',
    apiKey: 'api-key',
    secretKey: 'secret-key',
    stopLossPercent: 5,
    takeProfitPercent: 10,
    leverage: 1,
    maxTradeAmount: 1000,
    maxTradeAmountUnit: 'USDT',
    allowedPairs: JSON.stringify(['BTC/USDT', 'ETH/USDT']),
    useBnbForFees: true,
    discountUsdtPercent: 0.075,
    discountBnbPercent: 0.075,
    minBnbBalance: 0.01,
    reserveBnbForFeesEnabled: true,
    pairDiscovery: JSON.stringify({
      autoDiscoveryEnabled: true,
      autoAddToAllowedPairs: true,
      autoRemoveFromAllowedPairs: false,
      reviewRequired: true,
      sources: {
        reddit: true,
        rss: true,
        x: false,
        telegram: false,
      },
      minSocialScore: 70,
      minMentions: 30,
      maxPairs: 20,
      excludedAssets: ['BNB', 'USDC'],
      managedPairs: [],
    }),
    mode: 'spot',
    orderType: 'market',
    slippagePercent: 0.5,
    strategies: JSON.stringify([]),
    ...overrides,
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
    trainingSessionService.stopTrainingSessionProcessing()
    await Promise.all([
      fs.rm(process.env.TRAINING_MODEL_STORAGE_DIR, { recursive: true, force: true }),
      fs.rm(process.env.TRAINING_UPLOAD_STORAGE_DIR, { recursive: true, force: true }),
      fs.rm(process.env.TRAINING_CHECKPOINT_STORAGE_DIR, { recursive: true, force: true }),
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

  it('GET /api/configurations returns fees and pair discovery settings in the configuration contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())

    const { response, body } = await requestJson('/api/configurations', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.botParameters.fees.useBnbForFees, true)
    assert.equal(body.data.botParameters.fees.reserveBnbForFeesEnabled, true)
    assert.equal(body.data.botParameters.pairDiscovery.autoDiscoveryEnabled, true)
    assert.deepEqual(body.data.botParameters.pairDiscovery.excludedAssets, ['BNB', 'USDC'])
  })

  it('GET /api/social/latest returns normalized social signals for the authenticated user', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())
    stub(pairDiscoveryService, 'getLatestSocialSignals', async () => [
      {
        symbol: 'BTC',
        pair: 'BTC/USDT',
        score: 84,
        mentions: 12,
        sentiment: 'bullish',
        sources: ['reddit', 'rss'],
        references: [
          {
            source: 'reddit',
            title: '$BTC breaks resistance',
            url: 'https://example.com/btc',
          },
        ],
      },
    ])

    const { response, body } = await requestJson('/api/social/latest', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.length, 1)
    assert.equal(body.data[0].pair, 'BTC/USDT')
    assert.equal(body.data[0].score, 84)
    assert.deepEqual(body.data[0].sources, ['reddit', 'rss'])
  })

  it('GET /api/dashboard/bots-status returns bot instances enriched with template metadata', async () => {
    stubAuthenticatedUser()
    stub(prisma.bot, 'findMany', async () => [
      {
        id: 'bot-macd-1',
        userId: TEST_USER.id,
        templateId: 'template_macd',
        name: 'MACD Momentum Bot',
        strategyType: 'momentum',
        description: 'Bot de momentum com especialização em MACD',
        executionMode: 'paper',
        isSystemManaged: true,
        status: 'online',
        isPaused: false,
        currentPair: 'BTC/USDT',
        lastAnalysis: new Date('2026-04-11T13:00:00.000Z'),
        recommendedAction: 'buy',
        confidence: 88,
        modelVersion: 'v1.0.0',
        modelUrl: null,
        parameters: '{}',
        template: {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: '{}',
          isActive: true,
        },
      },
    ])

    const { response, body } = await requestJson('/api/dashboard/bots-status', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.deepEqual(body.data, [
      {
        id: 'bot-macd-1',
        name: 'MACD Momentum Bot',
        strategy: 'momentum',
        strategyId: 'template_macd',
        templateId: 'template_macd',
        templateSlug: 'macd-momentum-specialist',
        templateName: 'MACD Momentum Specialist',
        indicatorType: 'MACD',
        specialization: 'macd_momentum',
        executionMode: 'paper',
        description: 'Bot de momentum com especialização em MACD',
        currentPair: 'BTC/USDT',
        status: 'online',
        isPaused: false,
        recommendedAction: 'buy',
        confidence: 88,
        lastAnalysis: '2026-04-11T13:00:00.000Z',
      },
      ])
    })

    it('GET /api/dashboard/bots/:id/analysis returns a specialist-driven market reading for the selected bot', async () => {
      stubAuthenticatedUser()
      stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())
      stub(prisma.bot, 'findFirst', async () => ({
        id: 'bot-macd-1',
        userId: TEST_USER.id,
        templateId: 'template_macd',
        name: 'MACD Momentum Bot',
        strategyType: 'momentum',
        description: 'Bot de momentum com especialização em MACD',
        executionMode: 'paper',
        isSystemManaged: true,
        status: 'online',
        isPaused: false,
        currentPair: 'BTC/USDT',
        lastAnalysis: null,
        recommendedAction: null,
        confidence: null,
        modelVersion: 'v1.0.0',
        modelUrl: null,
        parameters: JSON.stringify({
          timeframe: '1h',
          momentumThreshold: 0.5,
          macdFast: 12,
          macdSlow: 26,
          macdSignal: 9,
        }),
        template: {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: '{}',
          isActive: true,
        },
      }))
      stub(prisma.bot, 'update', async (payload) => ({
        id: payload.where.id,
        ...payload.data,
      }))
      stub(binanceService, 'getCandles', async (pair) => {
        if (pair === 'BTC/USDT') {
          return [
            { timestamp: '2026-04-11T00:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 900 },
            { timestamp: '2026-04-11T01:00:00.000Z', open: 100, high: 102, low: 99.5, close: 101, volume: 940 },
            { timestamp: '2026-04-11T02:00:00.000Z', open: 101, high: 103, low: 100, close: 102, volume: 970 },
            { timestamp: '2026-04-11T03:00:00.000Z', open: 102, high: 104, low: 101, close: 103, volume: 990 },
            { timestamp: '2026-04-11T04:00:00.000Z', open: 103, high: 105, low: 102, close: 104, volume: 1030 },
            { timestamp: '2026-04-11T05:00:00.000Z', open: 104, high: 106, low: 103, close: 105, volume: 1080 },
            { timestamp: '2026-04-11T06:00:00.000Z', open: 105, high: 107, low: 104, close: 106, volume: 1110 },
            { timestamp: '2026-04-11T07:00:00.000Z', open: 106, high: 108, low: 105, close: 107, volume: 1140 },
            { timestamp: '2026-04-11T08:00:00.000Z', open: 107, high: 109, low: 106, close: 108, volume: 1170 },
            { timestamp: '2026-04-11T09:00:00.000Z', open: 108, high: 110, low: 107, close: 109, volume: 1200 },
            { timestamp: '2026-04-11T10:00:00.000Z', open: 109, high: 111, low: 108, close: 110, volume: 1250 },
            { timestamp: '2026-04-11T11:00:00.000Z', open: 110, high: 112, low: 109, close: 111, volume: 1280 },
            { timestamp: '2026-04-11T12:00:00.000Z', open: 111, high: 113, low: 110, close: 112, volume: 1320 },
            { timestamp: '2026-04-11T13:00:00.000Z', open: 112, high: 114, low: 111, close: 113, volume: 1360 },
            { timestamp: '2026-04-11T14:00:00.000Z', open: 113, high: 115, low: 112, close: 114, volume: 1390 },
            { timestamp: '2026-04-11T15:00:00.000Z', open: 114, high: 116, low: 113, close: 115, volume: 1430 },
            { timestamp: '2026-04-11T16:00:00.000Z', open: 115, high: 117, low: 114, close: 116, volume: 1480 },
            { timestamp: '2026-04-11T17:00:00.000Z', open: 116, high: 118, low: 115, close: 117, volume: 1510 },
            { timestamp: '2026-04-11T18:00:00.000Z', open: 117, high: 119, low: 116, close: 118, volume: 1560 },
            { timestamp: '2026-04-11T19:00:00.000Z', open: 118, high: 120, low: 117, close: 119, volume: 1600 },
            { timestamp: '2026-04-11T20:00:00.000Z', open: 119, high: 121, low: 118, close: 120, volume: 1660 },
            { timestamp: '2026-04-11T21:00:00.000Z', open: 120, high: 122, low: 119, close: 121, volume: 1700 },
            { timestamp: '2026-04-11T22:00:00.000Z', open: 121, high: 123, low: 120, close: 122, volume: 1740 },
            { timestamp: '2026-04-11T23:00:00.000Z', open: 122, high: 124, low: 121, close: 123, volume: 1780 },
            { timestamp: '2026-04-12T00:00:00.000Z', open: 123, high: 125, low: 122, close: 124, volume: 1820 },
            { timestamp: '2026-04-12T01:00:00.000Z', open: 124, high: 126, low: 123, close: 125, volume: 1860 },
            { timestamp: '2026-04-12T02:00:00.000Z', open: 125, high: 127, low: 124, close: 126, volume: 1900 },
            { timestamp: '2026-04-12T03:00:00.000Z', open: 126, high: 128, low: 125, close: 127, volume: 1940 },
          ]
        }

        return [
          { timestamp: '2026-04-11T00:00:00.000Z', open: 80, high: 80.5, low: 79.5, close: 80, volume: 900 },
          { timestamp: '2026-04-11T01:00:00.000Z', open: 80, high: 80.2, low: 79.2, close: 79.5, volume: 910 },
          { timestamp: '2026-04-11T02:00:00.000Z', open: 79.5, high: 79.8, low: 78.9, close: 79.1, volume: 920 },
          { timestamp: '2026-04-11T03:00:00.000Z', open: 79.1, high: 79.4, low: 78.5, close: 78.9, volume: 930 },
          { timestamp: '2026-04-11T04:00:00.000Z', open: 78.9, high: 79.1, low: 78.2, close: 78.6, volume: 940 },
          { timestamp: '2026-04-11T05:00:00.000Z', open: 78.6, high: 78.9, low: 78.1, close: 78.4, volume: 950 },
          { timestamp: '2026-04-11T06:00:00.000Z', open: 78.4, high: 78.7, low: 77.9, close: 78.2, volume: 960 },
          { timestamp: '2026-04-11T07:00:00.000Z', open: 78.2, high: 78.5, low: 77.7, close: 78.1, volume: 970 },
          { timestamp: '2026-04-11T08:00:00.000Z', open: 78.1, high: 78.4, low: 77.6, close: 78.0, volume: 980 },
          { timestamp: '2026-04-11T09:00:00.000Z', open: 78.0, high: 78.2, low: 77.5, close: 77.9, volume: 990 },
          { timestamp: '2026-04-11T10:00:00.000Z', open: 77.9, high: 78.1, low: 77.4, close: 77.8, volume: 1000 },
          { timestamp: '2026-04-11T11:00:00.000Z', open: 77.8, high: 78.0, low: 77.2, close: 77.6, volume: 1010 },
          { timestamp: '2026-04-11T12:00:00.000Z', open: 77.6, high: 77.9, low: 77.0, close: 77.4, volume: 1020 },
          { timestamp: '2026-04-11T13:00:00.000Z', open: 77.4, high: 77.8, low: 76.9, close: 77.3, volume: 1030 },
          { timestamp: '2026-04-11T14:00:00.000Z', open: 77.3, high: 77.6, low: 76.8, close: 77.2, volume: 1040 },
          { timestamp: '2026-04-11T15:00:00.000Z', open: 77.2, high: 77.5, low: 76.7, close: 77.1, volume: 1050 },
          { timestamp: '2026-04-11T16:00:00.000Z', open: 77.1, high: 77.4, low: 76.6, close: 77.0, volume: 1060 },
          { timestamp: '2026-04-11T17:00:00.000Z', open: 77.0, high: 77.3, low: 76.5, close: 76.9, volume: 1070 },
          { timestamp: '2026-04-11T18:00:00.000Z', open: 76.9, high: 77.2, low: 76.4, close: 76.8, volume: 1080 },
          { timestamp: '2026-04-11T19:00:00.000Z', open: 76.8, high: 77.1, low: 76.3, close: 76.7, volume: 1090 },
          { timestamp: '2026-04-11T20:00:00.000Z', open: 76.7, high: 77.0, low: 76.2, close: 76.6, volume: 1100 },
          { timestamp: '2026-04-11T21:00:00.000Z', open: 76.6, high: 76.9, low: 76.1, close: 76.5, volume: 1110 },
          { timestamp: '2026-04-11T22:00:00.000Z', open: 76.5, high: 76.8, low: 76.0, close: 76.4, volume: 1120 },
          { timestamp: '2026-04-11T23:00:00.000Z', open: 76.4, high: 76.7, low: 75.9, close: 76.3, volume: 1130 },
          { timestamp: '2026-04-12T00:00:00.000Z', open: 76.3, high: 76.6, low: 75.8, close: 76.2, volume: 1140 },
          { timestamp: '2026-04-12T01:00:00.000Z', open: 76.2, high: 76.5, low: 75.7, close: 76.1, volume: 1150 },
          { timestamp: '2026-04-12T02:00:00.000Z', open: 76.1, high: 76.4, low: 75.6, close: 76.0, volume: 1160 },
          { timestamp: '2026-04-12T03:00:00.000Z', open: 76.0, high: 76.3, low: 75.5, close: 75.9, volume: 1170 },
        ]
      })
      stub(binanceService, 'getTickerPrice', async (pair) => (pair === 'BTC/USDT' ? 127 : 75.9))
      stub(pairDiscoveryService, 'getLatestSocialSignals', async () => [
        {
          symbol: 'BTC',
          pair: 'BTC/USDT',
          score: 82,
          mentions: 22,
          sentiment: 'bullish',
          sources: ['reddit'],
          references: [],
        },
      ])

      const { response, body } = await requestJson('/api/dashboard/bots/bot-macd-1/analysis', {
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.botId, 'bot-macd-1')
      assert.equal(body.data.primarySpecialist, 'macd_momentum')
      assert.equal(body.data.timeframe, '1h')
      assert.equal(body.data.summary.analyzedPairs, 2)
      assert.equal(Array.isArray(body.data.opportunities), true)
      assert.equal(body.data.opportunities.length, 2)
      assert.equal(body.data.opportunities[0].pair, 'BTC/USDT')
      assert.equal(Array.isArray(body.data.opportunities[0].specialists), true)
      assert.equal(body.data.socialSignals[0].pair, 'BTC/USDT')
    })

  it('POST /api/configurations/pair-discovery/preview returns the next suggestion set for the current draft', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())

    let previewPayload = null
    stub(pairDiscoveryService, 'generatePairDiscoveryPreview', async (payload) => {
      previewPayload = payload
      return {
        generatedAt: '2026-04-11T14:00:00.000Z',
        autoDiscoveryEnabled: true,
        reviewRequired: true,
        sourcesUsed: ['reddit'],
        signals: [],
        items: [
          {
            action: 'add',
            symbol: 'SOL',
            pair: 'SOL/USDT',
            score: 82,
            mentions: 14,
            sentiment: 'bullish',
            sources: ['reddit'],
            reason: 'Score 82 com 14 menções',
          },
        ],
        nextAllowedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
        managedPairs: ['SOL/USDT'],
        summary: {
          currentAllowed: 2,
          nextAllowed: 3,
          additions: 1,
          removals: 0,
        },
      }
    })

    const { response, body } = await requestJson('/api/configurations/pair-discovery/preview', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allowedPairs: ['BTC/USDT', 'ETH/USDT'],
        fees: {
          useBnbForFees: true,
          discountUsdtPercent: 0.075,
          discountBnbPercent: 0.075,
          minBnbBalance: 0.01,
          reserveBnbForFeesEnabled: true,
        },
        pairDiscovery: {
          autoDiscoveryEnabled: true,
          autoAddToAllowedPairs: true,
          autoRemoveFromAllowedPairs: false,
          reviewRequired: true,
          sources: {
            reddit: true,
            rss: false,
            x: false,
            telegram: false,
          },
          minSocialScore: 70,
          minMentions: 30,
          maxPairs: 20,
          excludedAssets: ['BNB'],
        },
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.summary.additions, 1)
    assert.deepEqual(body.data.nextAllowedPairs, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])
    assert.deepEqual(previewPayload.allowedPairs, ['BTC/USDT', 'ETH/USDT'])
    assert.equal(previewPayload.pairDiscovery.sources.reddit, true)
    assert.equal(previewPayload.fees.useBnbForFees, true)
  })

  it('POST /api/configurations/pair-discovery/apply requires confirmation when review is enabled', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())
    stub(pairDiscoveryService, 'generatePairDiscoveryPreview', async () => ({
      generatedAt: '2026-04-11T14:10:00.000Z',
      autoDiscoveryEnabled: true,
      reviewRequired: true,
      sourcesUsed: ['reddit'],
      signals: [],
      items: [
        {
          action: 'add',
          symbol: 'SOL',
          pair: 'SOL/USDT',
          score: 82,
          mentions: 14,
          sentiment: 'bullish',
          sources: ['reddit'],
          reason: 'Score 82 com 14 menções',
        },
      ],
      nextAllowedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      managedPairs: ['SOL/USDT'],
      summary: {
        currentAllowed: 2,
        nextAllowed: 3,
        additions: 1,
        removals: 0,
      },
    }))

    let updateCalled = false
    stub(prisma.configuration, 'update', async () => {
      updateCalled = true
      return buildPersistedConfiguration()
    })

    const { response, body } = await requestJson('/api/configurations/pair-discovery/apply', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allowedPairs: ['BTC/USDT', 'ETH/USDT'],
        fees: {
          useBnbForFees: true,
          discountUsdtPercent: 0.075,
          discountBnbPercent: 0.075,
          minBnbBalance: 0.01,
          reserveBnbForFeesEnabled: true,
        },
        pairDiscovery: {
          autoDiscoveryEnabled: true,
          autoAddToAllowedPairs: true,
          autoRemoveFromAllowedPairs: false,
          reviewRequired: true,
          sources: {
            reddit: true,
            rss: false,
            x: false,
            telegram: false,
          },
          minSocialScore: 70,
          minMentions: 30,
          maxPairs: 20,
          excludedAssets: ['BNB'],
        },
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.applied, false)
    assert.equal(body.data.requiresConfirmation, true)
    assert.equal(updateCalled, false)
  })

  it('POST /api/configurations/pair-discovery/apply persists the managed pairs when confirmation is explicit', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())
    stub(pairDiscoveryService, 'generatePairDiscoveryPreview', async () => ({
      generatedAt: '2026-04-11T14:15:00.000Z',
      autoDiscoveryEnabled: true,
      reviewRequired: true,
      sourcesUsed: ['reddit'],
      signals: [],
      items: [
        {
          action: 'add',
          symbol: 'SOL',
          pair: 'SOL/USDT',
          score: 82,
          mentions: 14,
          sentiment: 'bullish',
          sources: ['reddit'],
          reason: 'Score 82 com 14 menções',
        },
      ],
      nextAllowedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      managedPairs: ['SOL/USDT'],
      summary: {
        currentAllowed: 2,
        nextAllowed: 3,
        additions: 1,
        removals: 0,
      },
    }))

    let updatedConfigurationPayload = null
    stub(prisma.configuration, 'update', async ({ data }) => {
      updatedConfigurationPayload = data
      return buildPersistedConfiguration({
        allowedPairs: JSON.stringify(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']),
        pairDiscovery: JSON.stringify({
          autoDiscoveryEnabled: true,
          autoAddToAllowedPairs: true,
          autoRemoveFromAllowedPairs: false,
          reviewRequired: true,
          sources: {
            reddit: true,
            rss: true,
            x: false,
            telegram: false,
          },
          minSocialScore: 70,
          minMentions: 30,
          maxPairs: 20,
          excludedAssets: ['BNB', 'USDC'],
          managedPairs: ['SOL/USDT'],
        }),
      })
    })

    const { response, body } = await requestJson('/api/configurations/pair-discovery/apply', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        force: true,
        allowedPairs: ['BTC/USDT', 'ETH/USDT'],
        fees: {
          useBnbForFees: true,
          discountUsdtPercent: 0.075,
          discountBnbPercent: 0.075,
          minBnbBalance: 0.01,
          reserveBnbForFeesEnabled: true,
        },
        pairDiscovery: {
          autoDiscoveryEnabled: true,
          autoAddToAllowedPairs: true,
          autoRemoveFromAllowedPairs: false,
          reviewRequired: true,
          sources: {
            reddit: true,
            rss: false,
            x: false,
            telegram: false,
          },
          minSocialScore: 70,
          minMentions: 30,
          maxPairs: 20,
          excludedAssets: ['BNB'],
        },
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.applied, true)
    assert.deepEqual(body.data.configuration.botParameters.allowedPairs, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])
    assert.equal(updatedConfigurationPayload.allowedPairs, JSON.stringify(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']))
    assert.match(updatedConfigurationPayload.pairDiscovery, /SOL\/USDT/)
  })

  it('POST /api/orders returns the executed manual order contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => ({
      useBnbForFees: false,
      discountUsdtPercent: 0.075,
      discountBnbPercent: 0.075,
      minBnbBalance: 0.01,
      reserveBnbForFeesEnabled: true,
    }))
    stub(prisma.balance, 'findMany', async () => ([
      {
        id: 'balance-usdt',
        currency: 'USDT',
        available: 1000,
        reserved: 0,
        total: 1000,
      },
    ]))
    stub(binanceService, 'getTickerPrice', async () => 100)
    stub(prisma.transaction, 'create', async ({ data }) => ({
      id: 'order-1',
      date: new Date('2026-04-11T12:00:00.000Z'),
      ...data,
    }))
    stub(prisma.balance, 'update', async () => undefined)
    stub(prisma.balance, 'create', async () => undefined)
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
    assert.equal(body.data.fee, 0.185)
    assert.equal(body.data.feeCurrency, 'USDT')
    assert.equal(body.data.feeDiscountSource, 'usdt')
  })

  it('POST /api/orders uses BNB for fees when there is available reserve above the protected floor', async () => {
    stubAuthenticatedUser()
    stub(prisma.configuration, 'findUnique', async () => ({
      useBnbForFees: true,
      discountUsdtPercent: 0.075,
      discountBnbPercent: 0.075,
      minBnbBalance: 0.01,
      reserveBnbForFeesEnabled: true,
    }))
    stub(prisma.balance, 'findMany', async () => ([
      {
        id: 'balance-usdt',
        currency: 'USDT',
        available: 1000,
        reserved: 0,
        total: 1000,
      },
      {
        id: 'balance-bnb',
        currency: 'BNB',
        available: 1,
        reserved: 0,
        total: 1,
      },
    ]))
    stub(binanceService, 'getTickerPrice', async () => 100)
    stub(marketValuationService, 'getCurrencyRateToBrl', async (currency) => {
      if (currency === 'BNB') {
        return 3000
      }

      if (currency === 'USDT') {
        return 5
      }

      return 1
    })
    stub(prisma.transaction, 'create', async ({ data }) => ({
      id: 'order-bnb-fee',
      date: new Date('2026-04-11T12:00:00.000Z'),
      ...data,
    }))
    stub(prisma.balance, 'update', async () => undefined)
    stub(prisma.balance, 'create', async () => undefined)
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
    assert.equal(body.data.feeCurrency, 'BNB')
    assert.equal(body.data.feeDiscountSource, 'bnb')
    assert.ok(Math.abs(body.data.fee - 0.0003083333333333333) < 1e-12)
  })

  it('POST /api/training/sessions returns the pending session contract', async () => {
    stubAuthenticatedUser()
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'MACD Momentum Bot',
      strategyType: 'scalper',
      template: {
        id: 'template-macd',
        slug: 'macd-momentum-specialist',
        name: 'MACD Momentum Specialist',
      },
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
      strategyId: 'template-macd',
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
    assert.equal(body.data.strategyId, 'template-macd')
    assert.equal(body.data.strategyName, 'MACD Momentum Specialist')
  })

  it('GET /api/training/strategies derives the catalog from persisted templates', async () => {
    stubAuthenticatedUser()
    stub(prisma.botTemplate, 'findMany', async () => [
      {
        id: 'template_macd',
        slug: 'macd-momentum-specialist',
        name: 'Momentum Trader',
        strategyType: 'momentum',
        indicatorType: 'MACD',
        specialization: 'macd_momentum',
        description: 'Identifica moedas com forte momentum',
        defaultParameters: '{}',
        isActive: true,
      },
      {
        id: 'template_mean_reversion',
        slug: 'rsi-reversion-specialist',
        name: 'Mean Reversion',
        strategyType: 'mean_reversion',
        indicatorType: 'RSI',
        specialization: 'rsi_reversion',
        description: 'Busca reversão à média',
        defaultParameters: '{}',
        isActive: true,
      },
    ])

    const { response, body } = await requestJson('/api/training/strategies', {
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.deepEqual(body.data, [
      {
        id: 'template_macd',
        slug: 'macd-momentum-specialist',
        name: 'Momentum Trader',
        strategyType: 'momentum',
        description: 'Identifica moedas com forte momentum',
        indicatorType: 'MACD',
        specialization: 'macd_momentum',
        defaultParameters: {},
        source: 'template',
      },
      {
        id: 'template_mean_reversion',
        slug: 'rsi-reversion-specialist',
        name: 'Mean Reversion',
        strategyType: 'mean_reversion',
        description: 'Busca reversão à média',
        indicatorType: 'RSI',
        specialization: 'rsi_reversion',
        defaultParameters: {},
        source: 'template',
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
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot1',
      userId: TEST_USER.id,
      templateId: null,
      name: 'Scalper V2',
      strategyType: 'scalper',
      template: null,
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
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot1',
      userId: TEST_USER.id,
    }))

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
    stub(prisma.trainingSession, 'findUnique', async () => ({
      id: 'session-1',
      userId: TEST_USER.id,
      botId: 'bot1',
      status: 'paused',
      config: JSON.stringify({ architecture: 'lstm' }),
      metrics: JSON.stringify([{ epoch: 1, trainLoss: 0.12, valLoss: 0.14, learningRate: 0.001, duration: 350 }]),
      bestEpoch: 1,
      bestValLoss: 0.14,
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

    const checkpointFile = path.join(process.env.TRAINING_CHECKPOINT_STORAGE_DIR, 'checkpoint_session-1.json')
    const checkpoint = JSON.parse(await fs.readFile(checkpointFile, 'utf-8'))
    assert.equal(checkpoint.reason, 'paused')
    assert.equal(checkpoint.status, 'paused')
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
    stub(prisma.trainingSession, 'findUnique', async () => ({
      id: 'session-1',
      userId: TEST_USER.id,
      botId: 'bot1',
      status: 'cancelled',
      config: JSON.stringify({ architecture: 'lstm' }),
      metrics: JSON.stringify([{ epoch: 3, trainLoss: 0.08, valLoss: 0.1, learningRate: 0.001, duration: 1050 }]),
      bestEpoch: 3,
      bestValLoss: 0.1,
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

    const checkpointFile = path.join(process.env.TRAINING_CHECKPOINT_STORAGE_DIR, 'checkpoint_session-1.json')
    const checkpoint = JSON.parse(await fs.readFile(checkpointFile, 'utf-8'))
    assert.equal(checkpoint.reason, 'cancelled')
    assert.equal(checkpoint.status, 'cancelled')
  })

  it('processTrainingQueueCycle recovers active sessions from the database queue and writes periodic checkpoints', async () => {
    stub(prisma.trainingSession, 'findMany', async () => [
      {
        id: 'session-recover-1',
        userId: TEST_USER.id,
        botId: 'bot1',
        status: 'running',
        config: JSON.stringify({
          architecture: 'lstm',
          hyperparameters: {
            epochs: 20,
            learningRate: 0.001,
            earlyStopping: {
              enabled: false,
              patience: 5,
            },
          },
          includedPairs: ['BTC/USDT'],
        }),
        metrics: JSON.stringify(
          Array.from({ length: 9 }, (_, index) => ({
            epoch: index + 1,
            trainLoss: 0.12 - (index * 0.005),
            valLoss: 0.14 - (index * 0.004),
            learningRate: 0.001,
            duration: (index + 1) * 350,
          })),
        ),
      },
    ])
    stub(prisma.trainingSession, 'findUnique', async () => ({
      id: 'session-recover-1',
      userId: TEST_USER.id,
      botId: 'bot1',
      status: 'running',
      config: JSON.stringify({
        architecture: 'lstm',
        hyperparameters: {
          epochs: 20,
          learningRate: 0.001,
          earlyStopping: {
            enabled: false,
            patience: 5,
          },
        },
        includedPairs: ['BTC/USDT'],
      }),
      metrics: JSON.stringify(
        Array.from({ length: 9 }, (_, index) => ({
          epoch: index + 1,
          trainLoss: 0.12 - (index * 0.005),
          valLoss: 0.14 - (index * 0.004),
          learningRate: 0.001,
          duration: (index + 1) * 350,
        })),
      ),
      bestEpoch: 9,
      bestValLoss: 0.108,
    }))

    let updatedSessionPayload = null
    stub(prisma.trainingSession, 'update', async ({ where, data }) => {
      updatedSessionPayload = { where, data }
      return { id: where.id, ...data }
    })

    await trainingSessionService.processTrainingQueueCycle()

    assert.deepEqual(updatedSessionPayload.where, { id: 'session-recover-1' })
    assert.equal(updatedSessionPayload.data.status, 'running')

    const persistedMetrics = JSON.parse(updatedSessionPayload.data.metrics)
    assert.equal(persistedMetrics.length, 10)
    assert.equal(persistedMetrics[9].epoch, 10)

    const checkpointFile = path.join(process.env.TRAINING_CHECKPOINT_STORAGE_DIR, 'checkpoint_session-recover-1.json')
    const checkpoint = JSON.parse(await fs.readFile(checkpointFile, 'utf-8'))
    assert.equal(checkpoint.reason, 'periodic')
    assert.equal(checkpoint.status, 'running')
    assert.equal(checkpoint.summary.lastEpoch, 10)
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
