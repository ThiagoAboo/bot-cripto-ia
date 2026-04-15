require('ts-node/register/transpile-only')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.TRAINING_ML_ENGINE_PROVIDER = 'simulated'
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
const botAnalysisService = require('../src/services/bot-analysis.service')
const binanceUserStreamService = require('../src/services/binance-user-stream.service')
const externalHttpService = require('../src/services/external-http.service')
const pairDiscoveryService = require('../src/services/pair-discovery.service')
const pairDiscoveryRunnerService = require('../src/services/pair-discovery-runner.service')
const botRunnerService = require('../src/services/bot-runner.service')
const botDecisionService = require('../src/services/bot-decision.service')
const trainingDataService = require('../src/services/training-data.service')
const trainingSessionService = require('../src/services/training-session.service')
const transactionsController = require('../src/controllers/transactions.controller')
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
const originalWebSocket = global.WebSocket

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
    stub(prisma.botDecision, 'findMany', async () => [])
    stub(botDecisionService, 'resolveBotOperationalReadiness', async (modelUrl) => ({
      hasModel: Boolean(modelUrl),
      modelReady: true,
      modelVersion: 'test-model',
      modelUrl: modelUrl ?? null,
      modelArchitecture: 'random_forest',
      validationStrategy: 'walk_forward',
      forecastHorizonCandles: 5,
      buyThresholdPercent: 0.3,
      sellThresholdPercent: -0.3,
      hasEnginePackage: true,
      operationalBlockReason: undefined,
    }))
  })

  afterEach(async () => {
    while (connectedSockets.length > 0) {
      const socket = connectedSockets.pop()
      socket.removeAllListeners()
      socket.disconnect()
      socket.close()
    }

    await wait(50)
    binanceUserStreamService.stopBinanceUserStreamService()
    global.WebSocket = originalWebSocket
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

  it('POST /api/configurations/pair-discovery/run executes automatic curation and returns refreshed configuration', async () => {
    stubAuthenticatedUser()
    stub(pairDiscoveryRunnerService, 'runPairDiscoveryForUser', async () => ({
      userId: TEST_USER.id,
      applied: true,
      previewRequired: false,
      status: 'applied',
      summary: '1 adições e 0 remoções sugeridas',
      preview: {
        generatedAt: '2026-04-13T12:00:00.000Z',
        autoDiscoveryEnabled: true,
        reviewRequired: false,
        sourcesUsed: ['reddit'],
        signals: [],
        items: [{
          action: 'add',
          symbol: 'DOGE',
          pair: 'DOGE/USDT',
          score: 81,
          mentions: 42,
          sentiment: 'bullish',
          sources: ['reddit'],
          reason: 'Score 81 com 42 menções',
        }],
        nextAllowedPairs: ['BTC/USDT', 'DOGE/USDT'],
        managedPairs: ['DOGE/USDT'],
        summary: {
          currentAllowed: 1,
          nextAllowed: 2,
          additions: 1,
          removals: 0,
        },
      },
    }))
    stub(pairDiscoveryRunnerService, 'getPairDiscoveryRunnerStatus', () => ({
      running: true,
      lastCycleAt: '2026-04-13T12:00:00.000Z',
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      allowedPairs: JSON.stringify(['BTC/USDT', 'DOGE/USDT']),
      pairDiscovery: JSON.stringify({
        autoDiscoveryEnabled: true,
        autoAddToAllowedPairs: true,
        autoRemoveFromAllowedPairs: true,
        reviewRequired: false,
        autoSyncIntervalMinutes: 30,
        sources: {
          reddit: true,
          rss: false,
          x: false,
          telegram: false,
        },
        minSocialScore: 70,
        minMentions: 20,
        maxPairs: 20,
        excludedAssets: ['BNB'],
        managedPairs: ['DOGE/USDT'],
        lastSyncAt: '2026-04-13T12:00:00.000Z',
        lastAppliedAt: '2026-04-13T12:00:00.000Z',
        lastSyncStatus: 'applied',
        lastSyncSummary: '1 adições e 0 remoções sugeridas',
      }),
    }))

    const { response, body } = await requestJson('/api/configurations/pair-discovery/run', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.applied, true)
    assert.equal(body.data.runner.running, true)
    assert.equal(body.data.preview.nextAllowedPairs[1], 'DOGE/USDT')
    assert.equal(body.data.configuration.botParameters.pairDiscovery.autoSyncIntervalMinutes, 30)
    assert.equal(body.data.configuration.botParameters.pairDiscovery.lastSyncStatus, 'applied')
  })

  it('POST /api/configurations/reset with scope configurations restores defaults and preserves API keys', async () => {
    stubAuthenticatedUser()

    let persistedConfiguration = buildPersistedConfiguration({
      exchange: 'binance',
      apiKey: 'preserved-api-key',
      secretKey: 'preserved-secret-key',
      allowedPairs: JSON.stringify(['DOGE/USDT']),
      stopLossPercent: 2,
      pairDiscovery: JSON.stringify({
        autoDiscoveryEnabled: true,
        autoAddToAllowedPairs: true,
        autoRemoveFromAllowedPairs: true,
        reviewRequired: false,
        autoSyncIntervalMinutes: 15,
        sources: {
          reddit: true,
          rss: true,
          x: true,
          telegram: true,
        },
        minSocialScore: 90,
        minMentions: 40,
        maxPairs: 10,
        excludedAssets: ['BNB'],
        managedPairs: ['DOGE/USDT'],
      }),
    })

    stub(prisma, '$transaction', async (callback) => {
      const fakeTx = {
        configuration: {
          findUnique: async () => ({
            exchange: persistedConfiguration.exchange,
            apiKey: persistedConfiguration.apiKey,
            secretKey: persistedConfiguration.secretKey,
          }),
          upsert: async ({ update, create }) => {
            persistedConfiguration = {
              ...persistedConfiguration,
              ...(update || create),
            }

            return persistedConfiguration
          },
        },
        trainingSession: {
          findMany: async () => [],
        },
        bot: {
          findMany: async () => [],
        },
      }

      return callback(fakeTx)
    })
    stub(prisma.configuration, 'findUnique', async () => persistedConfiguration)

    const { response, body } = await requestJson('/api/configurations/reset', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'configurations' }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.scope, 'configurations')
    assert.equal(body.data.preservedApiKeys, true)
    assert.equal(body.data.configuration.exchangeApiKeys.apiKey, 'preserved-api-key')
    assert.equal(body.data.configuration.exchangeApiKeys.secretKey, 'preserved-secret-key')
    assert.deepEqual(body.data.configuration.botParameters.allowedPairs, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])
    assert.equal(body.data.configuration.botParameters.pairDiscovery.autoDiscoveryEnabled, false)
    assert.equal(body.data.deletedRecords.configurations, 1)
  })

  it('POST /api/configurations/reset with scope paper recreates the initial paper wallet', async () => {
    stubAuthenticatedUser()
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => ({ created: true, totalBrl: 10000 }))

    let paperBalancePayload = null
    stub(prisma, '$transaction', async (callback) => {
      const fakeTx = {
        configuration: {
          findUnique: async () => ({
            exchange: 'binance',
            apiKey: 'paper-api-key',
            secretKey: 'paper-secret-key',
          }),
        },
        trainingSession: {
          findMany: async () => [],
        },
        bot: {
          findMany: async () => [],
          updateMany: async () => ({ count: 2 }),
        },
        botDecision: {
          deleteMany: async () => ({ count: 6 }),
        },
        transaction: {
          deleteMany: async () => ({ count: 11 }),
        },
        balance: {
          deleteMany: async () => ({ count: 3 }),
          upsert: async (payload) => {
            paperBalancePayload = payload
            return payload
          },
        },
        balanceHistory: {
          deleteMany: async () => ({ count: 7 }),
        },
      }

      return callback(fakeTx)
    })
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'paper-api-key',
      secretKey: 'paper-secret-key',
    }))

    const { response, body } = await requestJson('/api/configurations/reset', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'paper' }),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.scope, 'paper')
    assert.equal(body.data.paperBalance.currency, 'USDT')
    assert.equal(body.data.paperBalance.amount, 10000)
    assert.equal(body.data.deletedRecords.transactions, 11)
    assert.equal(body.data.deletedRecords.botDecisions, 6)
    assert.equal(body.data.deletedRecords.botsRuntimeResets, 2)
    assert.equal(paperBalancePayload.create.currency, 'USDT')
    assert.equal(paperBalancePayload.create.available, 10000)
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
        userId: TEST_USER.id,
        name: 'MACD Momentum Bot',
        strategy: 'momentum',
        strategyId: 'template_macd',
        templateId: 'template_macd',
        templateSlug: 'macd-momentum-specialist',
        templateName: 'MACD Momentum Specialist',
        indicatorType: 'MACD',
        specialization: 'macd_momentum',
        executionMode: 'paper',
        isSystemManaged: true,
        description: 'Bot de momentum com especialização em MACD',
        currentPair: 'BTC/USDT',
        status: 'online',
        isPaused: false,
        recommendedAction: 'buy',
        confidence: 88,
        lastAnalysis: '2026-04-11T13:00:00.000Z',
        modelVersion: 'v1.0.0',
        hasModel: false,
        modelReady: true,
        modelArchitecture: 'random_forest',
        validationStrategy: 'walk_forward',
        forecastHorizonCandles: 5,
        paperReadiness: {
          readyForFullAuto: false,
          evaluatedSignals: 0,
          pendingSignals: 0,
          minimumEvaluatedSignals: 30,
          accuracyPercent: 0,
          minimumAccuracyPercent: 55,
          averageStrategyReturnPercent: 0,
          minimumAverageStrategyReturnPercent: 0.15,
          averageEdgePercent: 0,
          minimumAverageEdgePercent: 0,
          maxObservedDrawdownPercent: 0,
          maximumDrawdownPercent: 12,
          maxConsecutiveIncorrect: 0,
          currentConsecutiveIncorrect: 0,
          maximumConsecutiveIncorrect: 5,
          blockers: [
            'Avalie pelo menos 30 sinais em paper antes de liberar o bot.',
            'A acurácia online está em 0% e precisa atingir 55%.',
            'O retorno médio da estratégia (0%) ainda está abaixo do mínimo de 0.15%.',
          ],
        },
      },
      ])
    })

    it('GET /api/dashboard/bots/templates returns the active bot template catalog', async () => {
      stubAuthenticatedUser()
      stub(prisma.botTemplate, 'findMany', async () => [
        {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: JSON.stringify({
            minConfidence: 68,
            maxPositionSize: 500,
          }),
          isActive: true,
          createdAt: new Date('2026-04-11T10:00:00.000Z'),
          updatedAt: new Date('2026-04-11T10:00:00.000Z'),
        },
      ])

      const { response, body } = await requestJson('/api/dashboard/bots/templates', {
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.length, 1)
      assert.equal(body.data[0].id, 'template_macd')
      assert.equal(body.data[0].defaultParameters.maxPositionSize, 500)
    })

    it('GET /api/dashboard/bots/:id returns merged bot detail with instance-level allowed pairs', async () => {
      stubAuthenticatedUser()
      stub(prisma.bot, 'findFirst', async () => ({
        id: 'bot-custom-1',
        userId: TEST_USER.id,
        templateId: 'template_macd',
        name: 'MACD Custom Bot',
        strategyType: 'momentum',
        description: 'Bot ajustado pelo usuário',
        executionMode: 'semi_auto',
        isSystemManaged: false,
        status: 'online',
        isPaused: false,
        currentPair: 'ETH/USDT',
        lastAnalysis: new Date('2026-04-13T10:00:00.000Z'),
        recommendedAction: 'buy',
        confidence: 82,
        modelVersion: 'v1.2.0',
        modelUrl: null,
        parameters: JSON.stringify({
          minConfidence: 74,
          timeframe: '4h',
          allowedPairs: ['ETH/USDT', 'SOL/USDT'],
          maxPositionSize: 250,
        }),
        createdAt: new Date('2026-04-12T08:00:00.000Z'),
        updatedAt: new Date('2026-04-13T09:00:00.000Z'),
        template: {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: JSON.stringify({
            minConfidence: 68,
            timeframe: '1h',
            maxPositionSize: 500,
          }),
        },
      }))
      stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
        allowedPairs: JSON.stringify(['BTC/USDT', 'ETH/USDT']),
      }))

      const { response, body } = await requestJson('/api/dashboard/bots/bot-custom-1', {
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.id, 'bot-custom-1')
      assert.equal(body.data.template.id, 'template_macd')
      assert.equal(body.data.allowedPairsSource, 'instance')
      assert.deepEqual(body.data.effectiveAllowedPairs, ['ETH/USDT', 'SOL/USDT'])
      assert.equal(body.data.effectiveParameters.timeframe, '4h')
      assert.equal(body.data.effectiveParameters.maxPositionSize, 250)
      assert.equal(body.data.paperReadiness.readyForFullAuto, false)
      assert.equal(body.data.paperReadiness.minimumEvaluatedSignals, 30)
    })

    it('POST /api/dashboard/bots creates a custom bot instance from a template', async () => {
      stubAuthenticatedUser()
      stub(prisma.botTemplate, 'findFirst', async () => ({
        id: 'template_rsi',
        slug: 'rsi-reversion-specialist',
        name: 'RSI Reversion Specialist',
        strategyType: 'mean_reversion',
        indicatorType: 'RSI',
        specialization: 'rsi_reversion',
        description: 'Especialista em RSI',
        defaultParameters: JSON.stringify({
          timeframe: '1h',
          maxPositionSize: 500,
        }),
        isActive: true,
      }))
      stub(prisma.bot, 'create', async ({ data }) => ({
        id: 'bot-created-1',
        userId: data.userId,
        templateId: data.templateId,
        name: data.name,
        strategyType: data.strategyType,
        description: data.description,
        executionMode: data.executionMode,
        isSystemManaged: data.isSystemManaged,
        status: data.status,
        isPaused: data.isPaused,
        currentPair: null,
        lastAnalysis: null,
        recommendedAction: null,
        confidence: null,
        modelVersion: 'v1.0.0',
        modelUrl: null,
        parameters: data.parameters,
        createdAt: new Date('2026-04-13T10:00:00.000Z'),
        updatedAt: new Date('2026-04-13T10:00:00.000Z'),
        template: {
          id: 'template_rsi',
          slug: 'rsi-reversion-specialist',
          name: 'RSI Reversion Specialist',
          strategyType: 'mean_reversion',
          indicatorType: 'RSI',
          specialization: 'rsi_reversion',
          description: 'Especialista em RSI',
          defaultParameters: JSON.stringify({
            timeframe: '1h',
            maxPositionSize: 500,
          }),
        },
      }))
      stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())

      const { response, body } = await requestJson('/api/dashboard/bots', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: 'template_rsi',
          name: 'Meu RSI Bot',
          executionMode: 'paper',
          status: 'offline',
          parameters: {
            allowedPairs: ['BTC/USDT', 'ETH/USDT'],
            minConfidence: 72,
          },
        }),
      })

      assert.equal(response.status, 201)
      assert.equal(body.success, true)
      assert.equal(body.data.id, 'bot-created-1')
      assert.equal(body.data.isCustom, true)
      assert.deepEqual(body.data.effectiveAllowedPairs, ['BTC/USDT', 'ETH/USDT'])
    })

    it('POST /api/dashboard/bots blocks going online when there is no operational model', async () => {
      stubAuthenticatedUser()
      stub(botDecisionService, 'resolveBotOperationalReadiness', async () => ({
        hasModel: false,
        modelReady: false,
        modelVersion: undefined,
        modelUrl: null,
        modelArchitecture: undefined,
        validationStrategy: undefined,
        forecastHorizonCandles: undefined,
        buyThresholdPercent: undefined,
        sellThresholdPercent: undefined,
        hasEnginePackage: false,
        operationalBlockReason: 'Associe um modelo treinado e salvo antes de colocar este bot em operação contínua.',
      }))
      stub(prisma.botTemplate, 'findFirst', async () => ({
        id: 'template_rsi',
        slug: 'rsi-specialist',
        name: 'RSI Specialist',
        strategyType: 'mean_reversion',
        indicatorType: 'RSI',
        specialization: 'rsi_reversion',
        description: 'Especialista em RSI',
        defaultParameters: JSON.stringify({ timeframe: '1h' }),
      }))

      const { response, body } = await requestJson('/api/dashboard/bots', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: 'template_rsi',
          name: 'Meu RSI Bot',
          executionMode: 'paper',
          status: 'online',
          parameters: {},
        }),
      })

      assert.equal(response.status, 400)
      assert.equal(body.success, false)
      assert.match(body.error, /modelo treinado/i)
    })

    it('PUT /api/dashboard/bots/:id materializes a shared bot into a user-owned instance before updating it', async () => {
      stubAuthenticatedUser()
      let findFirstCalls = 0

      stub(prisma.bot, 'findFirst', async ({ where }) => {
        findFirstCalls += 1

        if (where?.id === 'bot-shared-1') {
          return {
            id: 'bot-shared-1',
            userId: null,
            templateId: 'template_macd',
            name: 'MACD Shared Bot',
            strategyType: 'momentum',
            description: 'Bot do sistema',
            executionMode: 'paper',
            isSystemManaged: true,
            status: 'online',
            isPaused: false,
            currentPair: 'BTC/USDT',
            lastAnalysis: null,
            recommendedAction: 'hold',
            confidence: 55,
            modelVersion: 'v1.0.0',
            modelUrl: null,
            parameters: JSON.stringify({
              minConfidence: 60,
            }),
            createdAt: new Date('2026-04-10T10:00:00.000Z'),
            updatedAt: new Date('2026-04-10T10:00:00.000Z'),
            template: {
              id: 'template_macd',
              slug: 'macd-momentum-specialist',
              name: 'MACD Momentum Specialist',
              strategyType: 'momentum',
              indicatorType: 'MACD',
              specialization: 'macd_momentum',
              description: 'Especialista em MACD',
              defaultParameters: JSON.stringify({
                maxPositionSize: 500,
              }),
            },
          }
        }

        if (where?.userId === TEST_USER.id && where?.templateId === 'template_macd') {
          return null
        }

        return null
      })
      stub(prisma.bot, 'create', async ({ data }) => ({
        id: 'bot-user-override-1',
        userId: data.userId,
        templateId: data.templateId,
        name: data.name,
        strategyType: data.strategyType,
        description: data.description,
        executionMode: data.executionMode,
        isSystemManaged: data.isSystemManaged,
        status: data.status,
        isPaused: data.isPaused,
        currentPair: data.currentPair,
        lastAnalysis: data.lastAnalysis,
        recommendedAction: data.recommendedAction,
        confidence: data.confidence,
        modelVersion: data.modelVersion,
        modelUrl: data.modelUrl,
        parameters: data.parameters,
        createdAt: new Date('2026-04-13T10:00:00.000Z'),
        updatedAt: new Date('2026-04-13T10:00:00.000Z'),
        template: {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: JSON.stringify({
            maxPositionSize: 500,
          }),
        },
      }))
      stub(prisma.bot, 'update', async ({ where, data }) => ({
        id: where.id,
        userId: TEST_USER.id,
        templateId: 'template_macd',
        name: data.name,
        strategyType: 'momentum',
        description: data.description,
        executionMode: data.executionMode,
        isSystemManaged: false,
        status: data.status,
        isPaused: data.isPaused,
        currentPair: 'BTC/USDT',
        lastAnalysis: null,
        recommendedAction: 'hold',
        confidence: 55,
        modelVersion: 'v1.0.0',
        modelUrl: null,
        parameters: data.parameters,
        createdAt: new Date('2026-04-13T10:00:00.000Z'),
        updatedAt: new Date('2026-04-13T10:05:00.000Z'),
        template: {
          id: 'template_macd',
          slug: 'macd-momentum-specialist',
          name: 'MACD Momentum Specialist',
          strategyType: 'momentum',
          indicatorType: 'MACD',
          specialization: 'macd_momentum',
          description: 'Especialista em MACD',
          defaultParameters: JSON.stringify({
            maxPositionSize: 500,
          }),
        },
      }))
      stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration())

      const { response, body } = await requestJson('/api/dashboard/bots/bot-shared-1', {
        method: 'PUT',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'MACD Customizado',
          executionMode: 'full_auto',
          parameters: {
            allowedPairs: ['BTC/USDT', 'SOL/USDT'],
            maxPositionSize: 320,
          },
        }),
      })

      assert.equal(findFirstCalls >= 2, true)
      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.id, 'bot-user-override-1')
      assert.equal(body.data.materializedFromTemplate, true)
      assert.equal(body.data.executionMode, 'full_auto')
      assert.deepEqual(body.data.effectiveAllowedPairs, ['BTC/USDT', 'SOL/USDT'])
      assert.equal(body.data.effectiveParameters.maxPositionSize, 320)
    })

    it('GET /api/dashboard/bots/:id/history returns transactions, decisions, traces and training sessions for the bot', async () => {
      stubAuthenticatedUser()
      stub(prisma.bot, 'findFirst', async () => ({
        id: 'bot-history-1',
        userId: TEST_USER.id,
        templateId: 'template_rsi',
        name: 'History Bot',
        strategyType: 'mean_reversion',
        description: 'Bot com histórico',
        executionMode: 'paper',
        isSystemManaged: false,
        status: 'online',
        isPaused: false,
        currentPair: null,
        lastAnalysis: null,
        recommendedAction: null,
        confidence: null,
        modelVersion: 'v1.0.0',
        modelUrl: null,
        parameters: '{}',
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
        updatedAt: new Date('2026-04-12T10:00:00.000Z'),
        template: null,
      }))
      stub(prisma.transaction, 'findMany', async () => [
        {
          id: 'tx-bot-1',
          date: new Date('2026-04-13T09:00:00.000Z'),
          pair: 'BTC/USDT',
          type: 'buy',
          quantity: 0.01,
          requestedQuantity: 0.01,
          price: 100000,
          total: 1000,
          fee: 1,
          feeCurrency: 'USDT',
          status: 'executed',
          orderType: 'market',
          origin: 'bot',
          profitBrl: null,
          profitPercent: null,
          externalStatus: 'FILLED',
          syncedAt: new Date('2026-04-13T09:00:02.000Z'),
        },
      ])
      stub(prisma.trace, 'findMany', async () => [
        {
          id: 'trace-bot-1',
          timestamp: new Date('2026-04-13T09:00:01.000Z'),
          level: 'TRACE',
          module: 'bot',
          traceId: 'trace-1',
          functionName: 'runBotCycle',
          message: 'Executando ciclo',
          durationMs: 120,
          currentPair: 'BTC/USDT',
          recommendedAction: 'buy',
          confidence: 78,
          errorFlag: false,
        },
      ])
      stub(prisma.trainingSession, 'findMany', async () => [
        {
          id: 'session-1',
          status: 'completed',
          startTime: new Date('2026-04-12T09:00:00.000Z'),
          endTime: new Date('2026-04-12T10:00:00.000Z'),
          bestEpoch: 12,
          bestValLoss: 0.14,
          createdAt: new Date('2026-04-12T09:00:00.000Z'),
          updatedAt: new Date('2026-04-12T10:00:00.000Z'),
        },
      ])
      stub(prisma.botDecision, 'findMany', async () => [
        {
          id: 'decision-1',
          pair: 'BTC/USDT',
          action: 'buy',
          confidence: 78,
          reason: 'Sinal confirmado pelo modelo',
          timeframe: '1h',
          executionMode: 'paper',
          executionStatus: 'executed',
          modelVersion: 'v1.0.0',
          modelUrl: '/models/rsi-alpha.json',
          modelArchitecture: 'random_forest',
          horizonCandles: 5,
          decisionPrice: 100000,
          requestedQuantity: 0.01,
          executedQuantity: 0.0092,
          transactionId: 'tx-bot-1',
          slippagePercent: 0.18,
          simulatedLatencyMs: 420,
          simulatedFillPercent: 0.92,
          createdAt: new Date('2026-04-13T09:00:00.000Z'),
          dueAt: new Date('2026-04-13T14:00:00.000Z'),
          evaluatedAt: new Date('2026-04-13T14:00:00.000Z'),
          evaluationStatus: 'evaluated',
          evaluationPrice: 101200,
          marketReturnPercent: 1.2,
          strategyReturnPercent: 1.2,
          realizedEdgePercent: 0,
          actualLabel: 'buy',
          expectedLabel: 'buy',
          isCorrect: true,
        },
      ])

      const { response, body } = await requestJson('/api/dashboard/bots/bot-history-1/history', {
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.transactions.length, 1)
      assert.equal(body.data.decisions.length, 1)
      assert.equal(body.data.traces.length, 1)
      assert.equal(body.data.trainingSessions.length, 1)
      assert.equal(body.data.decisionSummary.accuracyPercent, 100)
      assert.equal(body.data.paperReadiness.readyForFullAuto, false)
      assert.equal(body.data.paperReadiness.evaluatedSignals, 1)
      assert.equal(body.data.decisions[0].executionStatus, 'executed')
      assert.equal(body.data.traces[0].functionName, 'runBotCycle')
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

    it('POST /api/dashboard/bots/:id/run returns the manual cycle execution contract', async () => {
      stubAuthenticatedUser()
      stub(botRunnerService, 'runBotCycle', async () => ({
        botId: 'bot-macd-1',
        botName: 'MACD Momentum Bot',
        generatedAt: '2026-04-12T19:00:00.000Z',
        analysis: {
          botId: 'bot-macd-1',
          botName: 'MACD Momentum Bot',
          strategyId: 'template_macd',
          primarySpecialist: 'macd_momentum',
          timeframe: '1h',
          generatedAt: '2026-04-12T19:00:00.000Z',
          analyzedPairs: ['BTC/USDT'],
          summary: {
            analyzedPairs: 1,
            actionablePairs: 1,
            buySignals: 1,
            sellSignals: 0,
            holdSignals: 0,
          },
          bestOpportunity: {
            pair: 'BTC/USDT',
            action: 'buy',
            confidence: 79,
            price: 128,
            reason: 'Consenso inclinado para compra',
            specialists: [],
          },
          opportunities: [],
          socialSignals: [],
        },
        execution: {
          mode: 'paper',
          status: 'executed',
          reason: 'Executado automaticamente em modo paper',
          pair: 'BTC/USDT',
          action: 'buy',
          quantity: 1.25,
          transaction: {
            id: 'tx-bot-1',
            date: '2026-04-12T19:00:00.000Z',
            pair: 'BTC/USDT',
            origin: 'bot',
            botId: 'bot-macd-1',
            type: 'buy',
            quantity: 1.25,
            price: 128,
            total: 160,
            fee: 0.12,
            feeCurrency: 'BNB',
            feeRateApplied: 0.00075,
            feeDiscountSource: 'bnb',
            status: 'executed',
            profitBrl: null,
            profitPercent: null,
          },
        },
      }))

      const { response, body } = await requestJson('/api/dashboard/bots/bot-macd-1/run', {
        method: 'POST',
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
      assert.equal(body.success, true)
      assert.equal(body.data.botId, 'bot-macd-1')
      assert.equal(body.data.execution.mode, 'paper')
      assert.equal(body.data.execution.status, 'executed')
      assert.equal(body.data.execution.transaction.origin, 'bot')
    })

  it('GET /api/dashboard/bots/worker-status exposes whether the bot worker is active', async () => {
      stubAuthenticatedUser()
      stub(botRunnerService, 'isBotWorkerRunning', () => true)

      const { response, body } = await requestJson('/api/dashboard/bots/worker-status', {
        headers: authHeaders(),
      })

      assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.running, true)
  })

  it('prepareSpotOrderRequest applies Binance stepSize, tickSize and minNotional filters before execution', async () => {
    stub(externalHttpService, 'requestJson', async () => ({
      timezone: 'UTC',
      serverTime: Date.now(),
      symbols: [
        {
          symbol: 'BTCUSDT',
          status: 'TRADING',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          permissions: ['SPOT'],
          filters: [
            {
              filterType: 'PRICE_FILTER',
              minPrice: '0.01',
              maxPrice: '1000000',
              tickSize: '0.01',
            },
            {
              filterType: 'LOT_SIZE',
              minQty: '0.01',
              maxQty: '100',
              stepSize: '0.01',
            },
            {
              filterType: 'MIN_NOTIONAL',
              minNotional: '10',
              applyToMarket: true,
            },
          ],
        },
      ],
    }))

    const prepared = await binanceService.prepareSpotOrderRequest({
      pair: 'BTC/USDT',
      quantity: 1.239,
      orderType: 'LIMIT',
      price: 127.129,
    })

    assert.equal(prepared.isValid, true)
    assert.equal(prepared.quantity, 1.23)
    assert.equal(prepared.price, 127.12)
    assert.ok(prepared.notional > 156)
    assert.equal(prepared.adjustments.length, 2)
  })

  it('syncBinanceUserStreamRegistry opens a native Binance user stream for eligible users', async () => {
    class FakeWebSocket {
      constructor(url) {
        this.url = url
        setTimeout(() => {
          this.onopen?.()
        }, 0)
      }

      close() {
        this.onclose?.({ code: 1000, reason: 'closed' })
      }
    }

    global.WebSocket = FakeWebSocket

    stub(prisma.bot, 'findMany', async () => [{ userId: TEST_USER.id }])
    stub(prisma.transaction, 'findMany', async ({ where }) => {
      if (where?.externalOrderId) {
        return []
      }

      return []
    })
    stub(prisma.configuration, 'findMany', async () => ([{
      userId: TEST_USER.id,
      apiKey: 'live-key',
      secretKey: 'live-secret',
    }]))
    stub(externalHttpService, 'requestJson', async (url, options = {}) => {
      if (url.includes('/api/v3/userDataStream') && options.method === 'POST') {
        return { listenKey: 'listen-key-1' }
      }

      if (url.includes('/api/v3/userDataStream') && options.method === 'DELETE') {
        return { listenKey: 'listen-key-1' }
      }

      if (url.includes('/api/v3/userDataStream') && options.method === 'PUT') {
        return { listenKey: 'listen-key-1' }
      }

      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })

    await binanceUserStreamService.syncBinanceUserStreamRegistry()
    await wait(20)

    const status = binanceUserStreamService.getBinanceUserStreamStatus()

    assert.equal(status.activeUsers, 1)
  })

  it('processBinanceUserStreamMessage reconciles local orders after an executionReport event', async () => {
    class FakeWebSocket {
      constructor(url) {
        this.url = url
        setTimeout(() => {
          this.onopen?.()
        }, 0)
      }

      close() {
        this.onclose?.({ code: 1000, reason: 'closed' })
      }
    }

    global.WebSocket = FakeWebSocket

    let reconciledTransactionId = null

    stub(prisma.bot, 'findMany', async () => [{ userId: TEST_USER.id }])
    stub(prisma.transaction, 'findMany', async ({ where }) => {
      if (where?.externalOrderId) {
        return []
      }

      return []
    })
    stub(prisma.configuration, 'findMany', async () => ([{
      userId: TEST_USER.id,
      apiKey: 'live-key',
      secretKey: 'live-secret',
    }]))
    stub(prisma.transaction, 'findFirst', async ({ where }) => {
      if (Array.isArray(where?.OR) && where.userId === TEST_USER.id) {
        return { id: 'tx-stream-1' }
      }

      return null
    })
    stub(transactionsController, 'reconcileExchangeOrderForUser', async ({ transactionId }) => {
      reconciledTransactionId = transactionId
      return null
    })
    stub(externalHttpService, 'requestJson', async (url, options = {}) => {
      if (url.includes('/api/v3/userDataStream') && options.method === 'POST') {
        return { listenKey: 'listen-key-2' }
      }

      if (url.includes('/api/v3/userDataStream') && options.method === 'DELETE') {
        return { listenKey: 'listen-key-2' }
      }

      if (url.includes('/api/v3/userDataStream') && options.method === 'PUT') {
        return { listenKey: 'listen-key-2' }
      }

      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })

    await binanceUserStreamService.syncBinanceUserStreamRegistry()
    await wait(20)
    await binanceUserStreamService.processBinanceUserStreamMessage(TEST_USER.id, {
      e: 'executionReport',
      i: 321,
      c: 'client-order-stream-1',
    })

    assert.equal(reconciledTransactionId, 'tx-stream-1')
  })

  it('runBotCycle executes a live Binance order when the bot is in full_auto mode', async () => {
    let createdSpotOrderPayload = null

    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-live-1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'Live MACD Bot',
      strategyType: 'momentum',
      description: 'Bot em execução real',
      executionMode: 'full_auto',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'BTC/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 82,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
        stopLossPercent: 5,
        takeProfitPercent: 10,
      }),
      template: {
        id: 'template-macd',
        name: 'MACD Momentum Specialist',
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-live-1',
      botName: 'Live MACD Bot',
      strategyId: 'template-macd',
      templateId: 'template-macd',
      templateName: 'MACD Momentum Specialist',
      primarySpecialist: 'macd_momentum',
      timeframe: '1h',
      generatedAt: '2026-04-12T20:00:00.000Z',
      analyzedPairs: ['BTC/USDT'],
      summary: {
        analyzedPairs: 1,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 0,
      },
      bestOpportunity: {
        pair: 'BTC/USDT',
        action: 'buy',
        confidence: 82,
        price: 127,
        reason: 'Momentum e MACD alinhados',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'live-key',
      secretKey: 'live-secret',
      maxTradeAmount: 127,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['BTC/USDT']),
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
    stub(prisma.balance, 'upsert', async () => undefined)
    stub(prisma.balance, 'update', async () => undefined)
    stub(prisma.balance, 'create', async () => undefined)
    stub(prisma.balanceHistory, 'findFirst', async () => ({ totalBrl: 5000 }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async ({ where }) => {
      if (where?.botId) {
        return []
      }

      return []
    })
    stub(prisma.transaction, 'create', async ({ data }) => ({
      id: 'tx-live-1',
      date: new Date('2026-04-12T20:00:01.000Z'),
      ...data,
    }))
    stub(binanceService, 'getAccountBalances', async () => ([
      {
        currency: 'USDT',
        available: 1000,
        reserved: 0,
        total: 1000,
      },
      {
        currency: 'BNB',
        available: 1,
        reserved: 0,
        total: 1,
      },
    ]))
    stub(binanceService, 'prepareSpotOrderRequest', async () => ({
      isValid: true,
      quantity: 1,
      notional: 127,
      adjustments: ['Quantidade ajustada de 1.00393701 para 1 por stepSize'],
      rules: {
        pair: 'BTC/USDT',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        minQty: 0.001,
        stepSize: 0.001,
        minNotional: 10,
      },
    }))
    stub(binanceService, 'createSpotOrder', async (_apiKey, _secretKey, payload) => {
      createdSpotOrderPayload = payload
      return {
        symbol: 'BTCUSDT',
        orderId: 123,
        clientOrderId: 'live-order-1',
        price: '0',
        origQty: '1',
        executedQty: '1',
        cummulativeQuoteQty: '127',
        status: 'FILLED',
        type: 'MARKET',
        side: 'BUY',
        fills: [
          {
            price: '127',
            qty: '1',
            commission: '0.0002',
            commissionAsset: 'BNB',
          },
        ],
      }
    })
    stub(marketValuationService, 'getCurrencyRateToBrl', async (currency) => {
      if (currency === 'BNB') {
        return 3000
      }

      if (currency === 'USDT') {
        return 5
      }

      return 1
    })
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => undefined)
    stub(webhookService, 'sendWebhook', async () => undefined)

    const result = await botRunnerService.runBotCycle('bot-live-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-live-1')
    assert.equal(result.execution.mode, 'full_auto')
    assert.equal(result.execution.status, 'executed')
    assert.match(result.execution.reason, /Binance/i)
    assert.equal(result.execution.transaction.origin, 'bot')
    assert.equal(result.execution.transaction.feeCurrency, 'BNB')
    assert.equal(result.execution.transaction.feeDiscountSource, 'bnb')
    assert.match(result.execution.reason, /stepSize/i)
    assert.equal(createdSpotOrderPayload.pair, 'BTC/USDT')
    assert.equal(createdSpotOrderPayload.side, 'BUY')
  })

  it('runBotCycle persists a submitted external order when Binance returns NEW instead of FILLED', async () => {
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-live-pending-1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'Live Pending Bot',
      strategyType: 'momentum',
      description: 'Bot aguardando fill',
      executionMode: 'full_auto',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'BTC/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 79,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
      }),
      template: {
        id: 'template-macd',
        name: 'MACD Momentum Specialist',
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-live-pending-1',
      botName: 'Live Pending Bot',
      strategyId: 'template-macd',
      templateId: 'template-macd',
      templateName: 'MACD Momentum Specialist',
      primarySpecialist: 'macd_momentum',
      timeframe: '1h',
      generatedAt: '2026-04-12T20:00:00.000Z',
      analyzedPairs: ['BTC/USDT'],
      summary: {
        analyzedPairs: 1,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 0,
      },
      bestOpportunity: {
        pair: 'BTC/USDT',
        action: 'buy',
        confidence: 79,
        price: 127,
        reason: 'Sinal comprador em andamento',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'live-key',
      secretKey: 'live-secret',
      maxTradeAmount: 127,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['BTC/USDT']),
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
    stub(prisma.balance, 'upsert', async () => undefined)
    stub(prisma.balance, 'update', async () => undefined)
    stub(prisma.balance, 'create', async () => undefined)
    stub(prisma.balanceHistory, 'findFirst', async () => ({ totalBrl: 5000 }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async () => [])
    stub(prisma.transaction, 'create', async ({ data }) => ({
      id: 'tx-live-pending-1',
      date: new Date('2026-04-12T20:00:01.000Z'),
      ...data,
    }))
    stub(binanceService, 'getAccountBalances', async () => ([
      {
        currency: 'USDT',
        available: 1000,
        reserved: 0,
        total: 1000,
      },
      {
        currency: 'BNB',
        available: 1,
        reserved: 0,
        total: 1,
      },
    ]))
    stub(binanceService, 'prepareSpotOrderRequest', async () => ({
      isValid: true,
      quantity: 1,
      notional: 127,
      adjustments: [],
      rules: {
        pair: 'BTC/USDT',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        minQty: 0.001,
        stepSize: 0.001,
        minNotional: 10,
      },
    }))
    stub(binanceService, 'createSpotOrder', async () => ({
      symbol: 'BTCUSDT',
      orderId: 456,
      clientOrderId: 'live-order-pending-1',
      price: '0',
      origQty: '1',
      executedQty: '0',
      cummulativeQuoteQty: '0',
      status: 'NEW',
      type: 'MARKET',
      side: 'BUY',
      fills: [],
      updateTime: Date.parse('2026-04-12T20:00:02.000Z'),
    }))
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => undefined)
    stub(webhookService, 'sendWebhook', async () => undefined)

    const result = await botRunnerService.runBotCycle('bot-live-pending-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-live-pending-1')
    assert.equal(result.execution.mode, 'full_auto')
    assert.equal(result.execution.status, 'submitted')
    assert.match(result.execution.reason, /pendente/i)
    assert.equal(result.execution.transaction.status, 'pending')
    assert.equal(result.execution.transaction.requestedQuantity, 1)
    assert.equal(result.execution.transaction.quantity, 0)
    assert.equal(result.execution.transaction.externalOrderId, '456')
    assert.equal(result.execution.transaction.externalStatus, 'NEW')
  })

  it('processOpenExchangeOrdersCycle reconciles users that still have open external orders', async () => {
    let reconciledOrderQueries = 0

    stub(prisma.transaction, 'findMany', async (args) => {
      if (args?.where?.externalOrderId && args?.distinct?.includes('userId')) {
        return [{ userId: TEST_USER.id }]
      }

      if (args?.where?.externalOrderId) {
        return [
          {
            id: 'tx-open-1',
            userId: TEST_USER.id,
            botId: 'bot-1',
            date: new Date('2026-04-12T21:00:00.000Z'),
            pair: 'BTC/USDT',
            origin: 'bot',
            type: 'buy',
            quantity: 0,
            requestedQuantity: 1,
            orderType: 'market',
            price: 127,
            total: 0,
            fee: 0,
            feeCurrency: 'USDT',
            feeRateApplied: 0,
            feeDiscountSource: null,
            status: 'pending',
            externalOrderId: '999',
            externalClientOrderId: 'client-open-1',
            externalStatus: 'NEW',
            syncedAt: new Date('2026-04-12T21:00:01.000Z'),
            profitBrl: null,
            profitPercent: null,
          },
        ]
      }

      return []
    })
    stub(prisma.transaction, 'findFirst', async ({ where }) => {
      if (where?.id === 'tx-open-1') {
        reconciledOrderQueries += 1
        return {
          id: 'tx-open-1',
          userId: TEST_USER.id,
          botId: 'bot-1',
          date: new Date('2026-04-12T21:00:00.000Z'),
          pair: 'BTC/USDT',
          origin: 'bot',
          type: 'buy',
          quantity: 0,
          requestedQuantity: 1,
          orderType: 'market',
          price: 127,
          total: 0,
          fee: 0,
          feeCurrency: 'USDT',
          feeRateApplied: 0,
          feeDiscountSource: null,
          status: 'pending',
          externalOrderId: '999',
          externalClientOrderId: 'client-open-1',
          externalStatus: 'NEW',
          syncedAt: new Date('2026-04-12T21:00:01.000Z'),
          profitBrl: null,
          profitPercent: null,
        }
      }

      return null
    })
    stub(prisma.transaction, 'update', async ({ data }) => ({
      id: 'tx-open-1',
      userId: TEST_USER.id,
      pair: 'BTC/USDT',
      origin: 'bot',
      type: 'buy',
      botId: 'bot-1',
      date: new Date('2026-04-12T21:00:00.000Z'),
      ...data,
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'live-key',
      secretKey: 'live-secret',
    }))
    stub(binanceService, 'getSpotOrder', async () => ({
      symbol: 'BTCUSDT',
      orderId: 999,
      clientOrderId: 'client-open-1',
      price: '0',
      origQty: '1',
      executedQty: '1',
      cummulativeQuoteQty: '127',
      status: 'FILLED',
      type: 'MARKET',
      side: 'BUY',
      updateTime: Date.parse('2026-04-12T21:05:00.000Z'),
    }))
    stub(binanceService, 'getSpotOrderTrades', async () => [])
    stub(binanceService, 'getAccountBalances', async () => [])
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => undefined)

    await botRunnerService.processOpenExchangeOrdersCycle()

    assert.equal(reconciledOrderQueries, 1)
  })

  it('runBotCycle skips full_auto execution when Binance minNotional filters reject the order', async () => {
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-filter-1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'Filter Guard Bot',
      strategyType: 'momentum',
      description: 'Bot validando filtros',
      executionMode: 'full_auto',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'BTC/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 81,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
      }),
      template: {
        id: 'template-macd',
        name: 'MACD Momentum Specialist',
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-filter-1',
      botName: 'Filter Guard Bot',
      strategyId: 'template-macd',
      templateId: 'template-macd',
      templateName: 'MACD Momentum Specialist',
      primarySpecialist: 'macd_momentum',
      timeframe: '1h',
      generatedAt: '2026-04-12T20:10:00.000Z',
      analyzedPairs: ['BTC/USDT'],
      summary: {
        analyzedPairs: 1,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 0,
      },
      bestOpportunity: {
        pair: 'BTC/USDT',
        action: 'buy',
        confidence: 81,
        price: 10,
        reason: 'Sinal comprador válido',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'live-key',
      secretKey: 'live-secret',
      maxTradeAmount: 12,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['BTC/USDT']),
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
    stub(prisma.balance, 'upsert', async () => undefined)
    stub(prisma.balanceHistory, 'findFirst', async () => ({ totalBrl: 5000 }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async () => [])
    stub(binanceService, 'getAccountBalances', async () => ([
      {
        currency: 'USDT',
        available: 1000,
        reserved: 0,
        total: 1000,
      },
      {
        currency: 'BNB',
        available: 1,
        reserved: 0,
        total: 1,
      },
    ]))
    stub(binanceService, 'prepareSpotOrderRequest', async () => ({
      isValid: false,
      rejectionReason: 'Notional 12.00000000 abaixo do mínimo 20 da Binance',
      adjustments: [],
      rules: {
        pair: 'BTC/USDT',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        minQty: 0.001,
        stepSize: 0.001,
        minNotional: 20,
      },
    }))

    const result = await botRunnerService.runBotCycle('bot-filter-1', TEST_USER.id)

    assert.equal(result.execution.mode, 'full_auto')
    assert.equal(result.execution.status, 'skipped')
    assert.match(result.execution.reason, /Notional/i)
  })

  it('runBotCycle skips new buys when the portfolio exposure limit is already reached', async () => {
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-risk-exposure-1',
      userId: TEST_USER.id,
      templateId: 'template-rsi',
      name: 'Risk Exposure Bot',
      strategyType: 'reversion',
      description: 'Bot limitado por exposição',
      executionMode: 'paper',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'ETH/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 76,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
        maxExposurePerCoin: 0.1,
        maxTotalExposure: 0.5,
        maxConcurrentTrades: 3,
      }),
      template: {
        id: 'template-rsi',
        name: 'RSI Reversion Specialist',
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-risk-exposure-1',
      botName: 'Risk Exposure Bot',
      strategyId: 'template-rsi',
      templateId: 'template-rsi',
      templateName: 'RSI Reversion Specialist',
      primarySpecialist: 'rsi_reversion',
      timeframe: '1h',
      generatedAt: '2026-04-12T21:30:00.000Z',
      analyzedPairs: ['ETH/USDT', 'BTC/USDT'],
      summary: {
        analyzedPairs: 2,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 1,
      },
      bestOpportunity: {
        pair: 'ETH/USDT',
        action: 'buy',
        confidence: 76,
        price: 100,
        reason: 'Sinal comprador válido',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      maxTradeAmount: 100,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['ETH/USDT', 'BTC/USDT']),
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
    stub(prisma.balanceHistory, 'findFirst', async () => ({
      totalBrl: 500,
    }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async (args) => {
      if (args?.where?.botId) {
        return []
      }

      if (args?.where?.externalOrderId) {
        return []
      }

      if (args?.where?.userId === TEST_USER.id && args?.where?.status === 'executed' && args?.distinct?.includes('pair')) {
        return [{ pair: 'BTC/USDT' }]
      }

      if (args?.where?.pair === 'BTC/USDT' && args?.where?.status === 'executed') {
        return [
          {
            type: 'buy',
            quantity: 1,
            total: 100,
            fee: 0,
            date: new Date('2026-04-12T20:00:00.000Z'),
            createdAt: new Date('2026-04-12T20:00:00.000Z'),
          },
        ]
      }

      return []
    })
    stub(binanceService, 'getTickerPrice', async () => 100)
    stub(marketValuationService, 'getCurrencyRateToBrl', async (currency) => {
      if (currency === 'USDT') {
        return 5
      }

      return 1
    })

    const result = await botRunnerService.runBotCycle('bot-risk-exposure-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-risk-exposure-1')
    assert.equal(result.execution.status, 'skipped')
    assert.match(result.execution.reason, /Exposição máxima por moeda/i)
  })

  it('runBotCycle reduces buy size using ATR-based volatility sizing and max position caps', async () => {
    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-risk-atr-1',
      userId: TEST_USER.id,
      templateId: 'template-rsi',
      name: 'ATR Risk Bot',
      strategyType: 'mean_reversion',
      description: 'Bot com sizing por volatilidade',
      executionMode: 'semi_auto',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'ETH/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 78,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
        timeframe: '1h',
      }),
      template: {
        id: 'template-rsi',
        name: 'RSI Reversion Specialist',
        defaultParameters: JSON.stringify({
          maxPositionSize: 200,
          atrPeriod: 14,
          targetAtrPercent: 0.02,
          minAtrPositionFactor: 0.35,
        }),
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-risk-atr-1',
      botName: 'ATR Risk Bot',
      strategyId: 'template-rsi',
      templateId: 'template-rsi',
      templateName: 'RSI Reversion Specialist',
      primarySpecialist: 'rsi_reversion',
      timeframe: '1h',
      generatedAt: '2026-04-13T10:00:00.000Z',
      analyzedPairs: ['ETH/USDT'],
      summary: {
        analyzedPairs: 1,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 0,
      },
      bestOpportunity: {
        pair: 'ETH/USDT',
        action: 'buy',
        confidence: 78,
        price: 100,
        reason: 'Entrada válida por reversão',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      maxTradeAmount: 1000,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['ETH/USDT']),
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
    stub(prisma.balanceHistory, 'findFirst', async () => ({
      totalBrl: 5000,
    }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async (args) => {
      if (args?.where?.botId) {
        return []
      }

      if (args?.where?.externalOrderId) {
        return []
      }

      if (args?.where?.userId === TEST_USER.id && args?.where?.status === 'executed' && args?.distinct?.includes('pair')) {
        return []
      }

      return []
    })
    stub(binanceService, 'getCandles', async () => Array.from({ length: 20 }, (_, index) => ({
      timestamp: `2026-04-13T${String(index).padStart(2, '0')}:00:00.000Z`,
      open: 100,
      high: 110,
      low: 100,
      close: 100,
      volume: 1000,
    })))

    const result = await botRunnerService.runBotCycle('bot-risk-atr-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-risk-atr-1')
    assert.equal(result.execution.status, 'suggested')
    assert.equal(result.execution.quantity, 0.7)
    assert.match(result.execution.reason, /ATR/i)
    assert.match(result.execution.reason, /200\.00 USDT/i)
  })

  it('runBotCycle skips buys that are too correlated with open portfolio positions', async () => {
    const correlatedCandles = Array.from({ length: 20 }, (_, index) => {
      const close = 100 + (index * 2)

      return {
        timestamp: `2026-04-13T${String(index).padStart(2, '0')}:00:00.000Z`,
        open: close - 1,
        high: close + 2,
        low: close - 2,
        close,
        volume: 1000 + (index * 20),
      }
    })

    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-risk-correlation-1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'Correlation Guard Bot',
      strategyType: 'momentum',
      description: 'Bot com bloqueio por correlação',
      executionMode: 'paper',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'ETH/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 81,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
        timeframe: '1h',
      }),
      template: {
        id: 'template-macd',
        name: 'MACD Momentum Specialist',
        defaultParameters: JSON.stringify({
          minCorrelationThreshold: 0.8,
          correlationLookbackCandles: 12,
        }),
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-risk-correlation-1',
      botName: 'Correlation Guard Bot',
      strategyId: 'template-macd',
      templateId: 'template-macd',
      templateName: 'MACD Momentum Specialist',
      primarySpecialist: 'macd_momentum',
      timeframe: '1h',
      generatedAt: '2026-04-13T10:00:00.000Z',
      analyzedPairs: ['ETH/USDT', 'BTC/USDT'],
      summary: {
        analyzedPairs: 2,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 1,
      },
      bestOpportunity: {
        pair: 'ETH/USDT',
        action: 'buy',
        confidence: 81,
        price: 100,
        reason: 'Momentum favorável',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      maxTradeAmount: 100,
      maxTradeAmountUnit: 'USDT',
      allowedPairs: JSON.stringify(['ETH/USDT', 'BTC/USDT']),
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
    stub(prisma.balanceHistory, 'findFirst', async () => ({
      totalBrl: 5000,
    }))
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async (args) => {
      if (args?.where?.botId) {
        return []
      }

      if (args?.where?.externalOrderId) {
        return []
      }

      if (args?.where?.userId === TEST_USER.id && args?.where?.status === 'executed' && args?.distinct?.includes('pair')) {
        return [{ pair: 'BTC/USDT' }]
      }

      if (args?.where?.pair === 'BTC/USDT' && args?.where?.status === 'executed') {
        return [
          {
            type: 'buy',
            quantity: 1,
            total: 100,
            fee: 0,
            date: new Date('2026-04-12T20:00:00.000Z'),
            createdAt: new Date('2026-04-12T20:00:00.000Z'),
          },
        ]
      }

      return []
    })
    stub(binanceService, 'getTickerPrice', async () => 100)
    stub(binanceService, 'getCandles', async (pair) => {
      if (pair === 'ETH/USDT' || pair === 'BTC/USDT') {
        return correlatedCandles
      }

      return []
    })
    stub(marketValuationService, 'getCurrencyRateToBrl', async (currency) => {
      if (currency === 'USDT') {
        return 5
      }

      return 1
    })

    const result = await botRunnerService.runBotCycle('bot-risk-correlation-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-risk-correlation-1')
    assert.equal(result.execution.status, 'skipped')
    assert.match(result.execution.reason, /Correlação/i)
    assert.match(result.execution.reason, /BTC\/USDT/i)
  })

  it('runBotCycle skips execution when the circuit breaker is active for the bot instance', async () => {
    const now = Date.now()

    stub(prisma.bot, 'findFirst', async () => ({
      id: 'bot-risk-1',
      userId: TEST_USER.id,
      templateId: 'template-macd',
      name: 'Risk Guard Bot',
      strategyType: 'momentum',
      description: 'Bot com guardrail',
      executionMode: 'paper',
      isSystemManaged: true,
      status: 'online',
      isPaused: false,
      currentPair: 'BTC/USDT',
      lastAnalysis: null,
      recommendedAction: 'buy',
      confidence: 84,
      modelVersion: 'v1.0.0',
      modelUrl: null,
      parameters: JSON.stringify({
        minConfidence: 60,
        maxConsecutiveLosses: 3,
        circuitBreakerCooldownMinutes: 120,
      }),
      template: {
        id: 'template-macd',
        name: 'MACD Momentum Specialist',
      },
    }))
    stub(prisma.trainingSession, 'findFirst', async () => null)
    stub(botAnalysisService, 'analyzeBotInstance', async () => ({
      botId: 'bot-risk-1',
      botName: 'Risk Guard Bot',
      strategyId: 'template-macd',
      templateId: 'template-macd',
      templateName: 'MACD Momentum Specialist',
      primarySpecialist: 'macd_momentum',
      timeframe: '1h',
      generatedAt: '2026-04-12T20:05:00.000Z',
      analyzedPairs: ['BTC/USDT'],
      summary: {
        analyzedPairs: 1,
        actionablePairs: 1,
        buySignals: 1,
        sellSignals: 0,
        holdSignals: 0,
      },
      bestOpportunity: {
        pair: 'BTC/USDT',
        action: 'buy',
        confidence: 84,
        price: 130,
        reason: 'Sinal comprador válido',
        specialists: [],
      },
      opportunities: [],
      socialSignals: [],
    }))
    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      allowedPairs: JSON.stringify(['BTC/USDT']),
    }))
    stub(prisma.balanceHistory, 'findFirst', async () => ({
      totalBrl: 10000,
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
    stub(prisma.transaction, 'findFirst', async () => null)
    stub(prisma.transaction, 'findMany', async ({ where }) => {
      if (where?.botId && where?.type === 'sell') {
        return [
          { date: new Date(now - (10 * 60 * 1000)), profitBrl: -300 },
          { date: new Date(now - (25 * 60 * 1000)), profitBrl: -180 },
          { date: new Date(now - (40 * 60 * 1000)), profitBrl: -90 },
        ]
      }

      return []
    })

    const result = await botRunnerService.runBotCycle('bot-risk-1', TEST_USER.id)

    assert.equal(result.botId, 'bot-risk-1')
    assert.equal(result.execution.mode, 'paper')
    assert.equal(result.execution.status, 'skipped')
    assert.match(result.execution.reason, /Circuit breaker/i)
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

  it('POST /api/orders/reconcile returns reconciled external orders with lifecycle metadata', async () => {
    stubAuthenticatedUser()

    const pendingOrder = {
      id: 'order-external-1',
      userId: TEST_USER.id,
      botId: 'bot-live-1',
      date: new Date('2026-04-12T19:00:00.000Z'),
      pair: 'BTC/USDT',
      origin: 'bot',
      type: 'buy',
      quantity: 0,
      requestedQuantity: 1,
      orderType: 'market',
      price: 127,
      total: 0,
      fee: 0,
      feeCurrency: 'USDT',
      feeRateApplied: 0,
      feeDiscountSource: null,
      status: 'pending',
      externalOrderId: '321',
      externalClientOrderId: 'client-order-1',
      externalStatus: 'NEW',
      syncedAt: new Date('2026-04-12T19:00:01.000Z'),
      profitBrl: null,
      profitPercent: null,
    }

    stub(prisma.configuration, 'findUnique', async () => buildPersistedConfiguration({
      apiKey: 'live-key',
      secretKey: 'live-secret',
    }))
    stub(prisma.transaction, 'findMany', async ({ where }) => {
      if (where?.externalOrderId) {
        return [pendingOrder]
      }

      return []
    })
    stub(prisma.transaction, 'findFirst', async ({ where }) => {
      if (where?.id === 'order-external-1') {
        return pendingOrder
      }

      return null
    })
    stub(prisma.transaction, 'update', async ({ data }) => ({
      ...pendingOrder,
      ...data,
    }))
    stub(binanceService, 'getSpotOrder', async () => ({
      symbol: 'BTCUSDT',
      orderId: 321,
      clientOrderId: 'client-order-1',
      price: '0',
      origQty: '1',
      executedQty: '0.4',
      cummulativeQuoteQty: '50.8',
      status: 'PARTIALLY_FILLED',
      type: 'MARKET',
      side: 'BUY',
      updateTime: Date.parse('2026-04-12T19:05:00.000Z'),
    }))
    stub(binanceService, 'getSpotOrderTrades', async () => ([
      {
        commission: '0.01',
        commissionAsset: 'USDT',
      },
    ]))
    stub(binanceService, 'getAccountBalances', async () => [])
    stub(portfolioService, 'recordBalanceHistorySnapshot', async () => undefined)

    const { response, body } = await requestJson('/api/orders/reconcile', {
      method: 'POST',
      headers: authHeaders(),
    })

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.length, 1)
    assert.equal(body.data[0].id, 'order-external-1')
    assert.equal(body.data[0].status, 'partially_filled')
    assert.equal(body.data[0].requestedQuantity, 1)
    assert.equal(body.data[0].quantity, 0.4)
    assert.equal(body.data[0].externalOrderId, '321')
    assert.equal(body.data[0].externalStatus, 'PARTIALLY_FILLED')
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
    assert.equal(typeof body.data.benchmark.totalProfit, 'number')
    assert.equal(Array.isArray(body.data.benchmarks), true)
    assert.equal(body.data.benchmarks.length >= 2, true)
    assert.equal(Array.isArray(body.data.pairBreakdown), true)
    assert.equal(body.data.validation.mode, 'walk_forward')
    assert.equal(typeof body.data.validation.folds, 'number')
    assert.equal(typeof body.data.validation.labeling.horizonCandles, 'number')
    assert.equal(Array.isArray(body.data.validation.windows), true)
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
    assert.equal(artifactContent.formatVersion, 4)
    assert.equal(artifactContent.summary.architecture, null)
    assert.equal(artifactContent.summary.totalEpochs, 1)
    assert.equal(artifactContent.summary.validationStrategy, 'walk_forward')
    assert.equal(artifactContent.evaluation.validationStrategy, 'walk_forward')
    assert.equal(typeof artifactContent.reproducibility.configFingerprint, 'string')
    assert.equal(typeof artifactContent.reproducibility.forecastHorizonCandles, 'number')
    assert.equal(Array.isArray(artifactContent.reproducibility.includedPairs), true)
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
