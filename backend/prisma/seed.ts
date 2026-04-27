// backend/prisma/seed.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import path from 'path'
import { existsSync, promises as fs } from 'fs'

function normalizeDatabaseUrlForHostExecution(value: string | undefined): string | undefined {
  const runningInContainer = process.env.DOCKERIZED === 'true' || existsSync('/.dockerenv')

  if (runningInContainer || !value || !value.includes('@postgres:5432')) {
    return value
  }

  return value.replace('@postgres:5432', '@localhost:5432')
}

process.env.DATABASE_URL = normalizeDatabaseUrlForHostExecution(process.env.DATABASE_URL)

const prisma = new PrismaClient()

const DEFAULT_STRATEGIES = JSON.stringify([
  {
    id: "strategy_scalper",
    name: "Scalper V2",
    strategyType: "scalper",
    isActive: true,
    parameters: {
      timeframe: "1m",
      maxSpread: 0.1,
      minVolume: 100000,
      takeProfitTicks: 5,
      stopLossTicks: 3
    }
  },
  {
    id: "strategy_momentum",
    name: "Momentum Trader",
    strategyType: "momentum",
    isActive: true,
    parameters: {
      period: 14,
      threshold: 2.5,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30
    }
  },
  {
    id: "strategy_trend",
    name: "Trend Follower",
    strategyType: "trend_follower",
    isActive: true,
    parameters: {
      fastEma: 20,
      slowEma: 50,
      adxPeriod: 14,
      adxThreshold: 25
    }
  },
  {
    id: "strategy_reversion",
    name: "Mean Reversion",
    strategyType: "mean_reversion",
    isActive: true,
    parameters: {
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      rsiLower: 30,
      rsiUpper: 70
    }
  },
  {
    id: "strategy_arbitrage",
    name: "Arbitrage Hunter",
    strategyType: "arbitrage",
    isActive: false,
    parameters: {
      minSpreadPercent: 0.5,
      maxLatencyMs: 100,
      minLiquidity: 50000
    }
  }
])

const DEFAULT_ALLOWED_PAIRS = JSON.stringify([
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"
])

function normalizePairs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ))
}

const BOT_TEMPLATES = [
  {
    id: 'template_micro_scalper_paper',
    slug: 'micro-scalper-paper',
    name: 'Micro Scalper Paper',
    strategyType: 'scalper',
    indicatorType: 'OrderBook',
    specialization: 'micro_scalping',
    description: 'Preset de micro trades para paper com foco em spread curto, liquidez e confirmacao rapida',
    defaultParameters: {
      timeframe: '1m',
      minConfidence: 60,
      allowedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      maxPairsToAnalyze: 3,
      maxExecutableOpportunitiesPerCycle: 1,
      stopLossPercent: 0.6,
      takeProfitPercent: 0.8,
      circuitBreakerDailyLossPercent: 1.5,
      circuitBreakerCooldownMinutes: 15,
      maxConsecutiveLosses: 4,
      maxPositionSize: 150,
      maxExposurePerCoin: 0.18,
      maxTotalExposure: 0.3,
      maxConcurrentTrades: 1,
      minCorrelationThreshold: 0.92,
      atrPeriod: 14,
      targetAtrPercent: 0.006,
      minAtrPositionFactor: 0.2,
      minVolume: 250000,
      maxSpreadPercent: 0.05,
      microMomentumThresholdPercent: 0.05,
      orderImbalanceThreshold: 0.58,
    },
  },
  {
    id: 'template_rsi_reversion',
    slug: 'rsi-reversion-specialist',
    name: 'RSI Reversion Specialist',
    strategyType: 'mean_reversion',
    indicatorType: 'RSI',
    specialization: 'rsi_reversion',
    description: 'Especialista em reversão à média usando RSI e sobrevenda/sobrecompra',
    defaultParameters: {
      rsiPeriod: 14,
      rsiLower: 30,
      rsiUpper: 70,
      confirmationCandles: 2,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_macd_momentum',
    slug: 'macd-momentum-specialist',
    name: 'MACD Momentum Specialist',
    strategyType: 'momentum',
    indicatorType: 'MACD',
    specialization: 'macd_momentum',
    description: 'Especialista em aceleração de momentum usando cruzamentos de MACD',
    defaultParameters: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      minHistogram: 0.2,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_ema_trend',
    slug: 'ema-trend-specialist',
    name: 'EMA Trend Specialist',
    strategyType: 'trend_follower',
    indicatorType: 'EMA',
    specialization: 'ema_trend',
    description: 'Especialista em tendência usando cruzamento de médias exponenciais',
    defaultParameters: {
      fastEma: 20,
      slowEma: 50,
      adxThreshold: 25,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_bbands_reversion',
    slug: 'bollinger-reversion-specialist',
    name: 'Bollinger Reversion Specialist',
    strategyType: 'mean_reversion',
    indicatorType: 'BB',
    specialization: 'bollinger_reversion',
    description: 'Especialista em retorno à média com Bandas de Bollinger',
    defaultParameters: {
      bbPeriod: 20,
      bbStdDev: 2,
      minBandWidth: 0.015,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_volume_breakout',
    slug: 'volume-breakout-specialist',
    name: 'Volume Breakout Specialist',
    strategyType: 'momentum',
    indicatorType: 'Volume',
    specialization: 'volume_breakout',
    description: 'Especialista em rompimentos confirmados por expansão de volume',
    defaultParameters: {
      volumeMultiplier: 1.8,
      breakoutLookback: 20,
      atrFilter: true,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
]

type SeedBotInstance = {
  id: string
  templateId: string
  name: string
  strategyType: string
  description: string
  parameters?: Record<string, unknown>
}

const BOT_INSTANCES: SeedBotInstance[] = [
  {
    id: 'bot0',
    templateId: 'template_micro_scalper_paper',
    name: 'Micro Scalper Paper Bot',
    strategyType: 'scalper',
    description: 'Bot operacional de micro trades em paper para capturar variacoes curtas com filtros de spread e imbalance',
  },
  {
    id: 'bot1',
    templateId: 'template_rsi_reversion',
    name: 'RSI Reversion Bot',
    strategyType: 'mean_reversion',
    description: 'Bot operacional focado em sinais de RSI para reversão',
  },
  {
    id: 'bot2',
    templateId: 'template_macd_momentum',
    name: 'MACD Momentum Bot',
    strategyType: 'momentum',
    description: 'Bot operacional focado em aceleração de momentum via MACD',
  },
  {
    id: 'bot3',
    templateId: 'template_ema_trend',
    name: 'EMA Trend Bot',
    strategyType: 'trend_follower',
    description: 'Bot operacional focado em tendência com cruzamento de EMAs',
  },
  {
    id: 'bot4',
    templateId: 'template_bbands_reversion',
    name: 'Bollinger Reversion Bot',
    strategyType: 'mean_reversion',
    description: 'Bot operacional focado em retorno à média com Bandas de Bollinger',
  },
  {
    id: 'bot5',
    templateId: 'template_volume_breakout',
    name: 'Volume Breakout Bot',
    strategyType: 'momentum',
    description: 'Bot operacional focado em rompimentos com confirmação de volume',
  },
]

const BOOTSTRAP_MODEL_SOURCE_FILENAME = 'model_bootstrap_bot1_bootstrap-e2e-v1.h5'
const BOT_TEMPLATE_BY_ID = new Map(BOT_TEMPLATES.map((template) => [template.id, template]))

function buildFingerprint(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

function resolveModelStorageDir(): string {
  return path.resolve(__dirname, '..', 'storage', 'models')
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'artifact'
}

async function loadBootstrapArtifactTemplate(): Promise<Record<string, any>> {
  const templatePath = path.join(resolveModelStorageDir(), BOOTSTRAP_MODEL_SOURCE_FILENAME)
  const raw = await fs.readFile(templatePath, 'utf-8')
  return JSON.parse(raw) as Record<string, any>
}

async function ensureBootstrapArtifact(params: {
  userId: string
  botId: string
  botName: string
  allowedPairs: string[]
}) {
  await fs.mkdir(resolveModelStorageDir(), { recursive: true })

  const template = await loadBootstrapArtifactTemplate()
  const modelVersion = `bootstrap-${sanitizeSegment(params.botId)}-v1`
  const filename = `model_bootstrap_${sanitizeSegment(params.botId)}_${sanitizeSegment(modelVersion)}.h5`
  const modelUrl = `/models/${filename}`
  const savedAt = new Date().toISOString()

  const fingerprint = buildFingerprint({
    sourceFingerprint: template.fingerprint,
    userId: params.userId,
    botId: params.botId,
    modelVersion,
    savedAt,
  })

  const artifact: Record<string, any> = {
    ...template,
    savedAt,
    sessionId: `bootstrap-${params.botId}-session`,
    userId: params.userId,
    botId: params.botId,
    modelVersion,
    fingerprint,
    summary: {
      ...(template.summary ?? {}),
      architecture: template.summary?.architecture ?? 'random_forest',
      dataSource: 'bootstrap_seed',
      timeframe: template.summary?.timeframe ?? '1h',
      bestEpoch: template.summary?.bestEpoch ?? 1,
      bestValLoss: template.summary?.bestValLoss ?? 0.01,
      totalEpochs: template.summary?.totalEpochs ?? 1,
      validationStrategy: template.summary?.validationStrategy ?? 'holdout',
    },
    evaluation: {
      ...(template.evaluation ?? {}),
      architecture: template.evaluation?.architecture ?? template.summary?.architecture ?? 'random_forest',
      architectureLabel: `${params.botName} Bootstrap Classifier`,
      validationStrategy: template.evaluation?.validationStrategy ?? 'holdout',
    },
    reproducibility: {
      ...(template.reproducibility ?? {}),
      includedPairs: params.allowedPairs,
      trainingPeriod: template.reproducibility?.trainingPeriod ?? {
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-04-18T00:00:00.000Z',
      },
    },
    config: {
      ...(template.config ?? {}),
      timeframe: template.config?.timeframe ?? '1h',
      dataSource: 'bootstrap_seed',
      includedPairs: params.allowedPairs,
    },
  }

  const absolutePath = path.join(resolveModelStorageDir(), filename)
  await fs.writeFile(absolutePath, JSON.stringify(artifact, null, 2), 'utf-8')

  return {
    modelUrl,
    artifact,
  }
}

function resolveSeedBotAllowedPairs(bot: SeedBotInstance, fallbackPairs: string[]): string[] {
  const instancePairs = normalizePairs(bot.parameters?.allowedPairs)
  if (instancePairs.length > 0) {
    return instancePairs
  }

  const templateParameters = BOT_TEMPLATE_BY_ID.get(bot.templateId)?.defaultParameters as Record<string, unknown> | undefined
  const templatePairs = normalizePairs(templateParameters?.allowedPairs)
  if (templatePairs.length > 0) {
    return templatePairs
  }

  return fallbackPairs.slice(0, 5)
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  // Criar usuário admin
  const hashedPassword = await bcrypt.hash('admin123', 10)
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@botcrypto.com' },
    update: {},
    create: {
      email: 'admin@botcrypto.com',
      passwordHash: hashedPassword,
      name: 'Administrador',
      preferences: JSON.stringify({ theme: 'dark' })
    }
  })
  console.log(`✅ Usuário criado: ${user.email} (ID: ${user.id})`)
  const defaultAllowedPairs = JSON.parse(DEFAULT_ALLOWED_PAIRS) as string[]

  // Criar configurações padrão
  await prisma.configuration.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      exchange: "binance",
      apiKey: "",
      secretKey: "",
      stopLossPercent: 5.0,
      takeProfitPercent: 10.0,
      leverage: 1,
      maxTradeAmount: 1000,
      maxTradeAmountUnit: "USDT",
      allowedPairs: DEFAULT_ALLOWED_PAIRS,
      discountUsdtPercent: 0.075,
      discountBnbPercent: 0.075,
      minBnbBalance: 0.01,
      mode: "spot",
      orderType: "market",
      slippagePercent: 0.5,
      strategies: DEFAULT_STRATEGIES
    }
  })
  console.log(`✅ Configurações criadas`)

  // Criar catálogo de templates especializados
  for (const template of BOT_TEMPLATES) {
    await prisma.botTemplate.upsert({
      where: { id: template.id },
      update: {
        slug: template.slug,
        name: template.name,
        strategyType: template.strategyType,
        indicatorType: template.indicatorType,
        specialization: template.specialization,
        description: template.description,
        defaultParameters: JSON.stringify(template.defaultParameters),
        isActive: true,
      },
      create: {
        id: template.id,
        slug: template.slug,
        name: template.name,
        strategyType: template.strategyType,
        indicatorType: template.indicatorType,
        specialization: template.specialization,
        description: template.description,
        defaultParameters: JSON.stringify(template.defaultParameters),
        isActive: true,
      },
    })
  }
  console.log(`✅ Templates de bots criados`)

  // Criar instâncias operacionais de bots
  for (const botData of BOT_INSTANCES) {
    const bot = await prisma.bot.upsert({
      where: { id: botData.id },
      update: {
        userId: user.id,
        templateId: botData.templateId,
        name: botData.name,
        strategyType: botData.strategyType,
        description: botData.description,
        executionMode: 'paper',
        isSystemManaged: true,
        status: 'online',
        parameters: JSON.stringify(botData.parameters ?? {}),
      },
      create: {
        id: botData.id,
        userId: user.id,
        templateId: botData.templateId,
        name: botData.name,
        strategyType: botData.strategyType,
        description: botData.description,
        executionMode: 'paper',
        isSystemManaged: true,
        status: 'online',
        parameters: JSON.stringify(botData.parameters ?? {}),
      }
    })

    const bootstrapArtifact = await ensureBootstrapArtifact({
      userId: user.id,
      botId: bot.id,
      botName: bot.name,
      allowedPairs: resolveSeedBotAllowedPairs(botData, defaultAllowedPairs),
    })

    await prisma.botModelArtifact.updateMany({
      where: {
        userId: user.id,
        botId: bot.id,
        modelUrl: { not: bootstrapArtifact.modelUrl },
        governanceRole: { not: 'archived' },
      },
      data: {
        isActive: false,
        governanceRole: 'challenger',
        updatedAt: new Date(),
      },
    })

    await prisma.botModelArtifact.upsert({
      where: {
        botId_modelUrl: {
          botId: bot.id,
          modelUrl: bootstrapArtifact.modelUrl,
        },
      },
      update: {
        userId: user.id,
        modelVersion: bootstrapArtifact.artifact.modelVersion,
        fingerprint: bootstrapArtifact.artifact.fingerprint,
        architecture: bootstrapArtifact.artifact.summary?.architecture ?? null,
        validationStrategy: bootstrapArtifact.artifact.summary?.validationStrategy ?? null,
        forecastHorizonCandles: bootstrapArtifact.artifact.reproducibility?.forecastHorizonCandles ?? 5,
        governanceRole: 'champion',
        isActive: true,
        notes: 'Bootstrap artifact seeded for operational readiness',
        evaluationSummary: JSON.stringify({
          bestEpoch: bootstrapArtifact.artifact.summary?.bestEpoch ?? 1,
          bestValLoss: bootstrapArtifact.artifact.summary?.bestValLoss ?? 0.01,
          accuracyPercent: bootstrapArtifact.artifact.evaluation?.bestAccuracy ?? 1,
          f1Score: bootstrapArtifact.artifact.evaluation?.bestF1Score ?? 1,
          logLoss: bootstrapArtifact.artifact.evaluation?.logLoss ?? 0.01,
          walkForwardFolds: bootstrapArtifact.artifact.evaluation?.walkForwardFolds ?? 0,
        }),
        reproducibilitySummary: JSON.stringify({
          configFingerprint: bootstrapArtifact.artifact.reproducibility?.configFingerprint,
          metricsFingerprint: bootstrapArtifact.artifact.reproducibility?.metricsFingerprint,
          datasetFingerprint: bootstrapArtifact.artifact.reproducibility?.datasetFingerprint,
          featureFingerprint: bootstrapArtifact.artifact.reproducibility?.featureFingerprint,
        }),
        promotedAt: new Date(),
        archivedAt: null,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        botId: bot.id,
        modelVersion: bootstrapArtifact.artifact.modelVersion,
        modelUrl: bootstrapArtifact.modelUrl,
        fingerprint: bootstrapArtifact.artifact.fingerprint,
        architecture: bootstrapArtifact.artifact.summary?.architecture ?? null,
        validationStrategy: bootstrapArtifact.artifact.summary?.validationStrategy ?? null,
        forecastHorizonCandles: bootstrapArtifact.artifact.reproducibility?.forecastHorizonCandles ?? 5,
        governanceRole: 'champion',
        isActive: true,
        notes: 'Bootstrap artifact seeded for operational readiness',
        evaluationSummary: JSON.stringify({
          bestEpoch: bootstrapArtifact.artifact.summary?.bestEpoch ?? 1,
          bestValLoss: bootstrapArtifact.artifact.summary?.bestValLoss ?? 0.01,
          accuracyPercent: bootstrapArtifact.artifact.evaluation?.bestAccuracy ?? 1,
          f1Score: bootstrapArtifact.artifact.evaluation?.bestF1Score ?? 1,
          logLoss: bootstrapArtifact.artifact.evaluation?.logLoss ?? 0.01,
          walkForwardFolds: bootstrapArtifact.artifact.evaluation?.walkForwardFolds ?? 0,
        }),
        reproducibilitySummary: JSON.stringify({
          configFingerprint: bootstrapArtifact.artifact.reproducibility?.configFingerprint,
          metricsFingerprint: bootstrapArtifact.artifact.reproducibility?.metricsFingerprint,
          datasetFingerprint: bootstrapArtifact.artifact.reproducibility?.datasetFingerprint,
          featureFingerprint: bootstrapArtifact.artifact.reproducibility?.featureFingerprint,
        }),
        promotedAt: new Date(),
      },
    })

    await prisma.bot.update({
      where: { id: bot.id },
      data: {
        modelVersion: bootstrapArtifact.artifact.modelVersion,
        modelUrl: bootstrapArtifact.modelUrl,
      },
    })
  }
  console.log(`✅ Instâncias de bots criadas`)

  // Criar saldos iniciais
  const balances = [
    { currency: 'USDT', available: 12500, reserved: 500, total: 13000 },
    { currency: 'BNB', available: 0.75, reserved: 0.05, total: 0.8 },
    { currency: 'BTC', available: 0.5, reserved: 0, total: 0.5 },
    { currency: 'ETH', available: 3.2, reserved: 0.2, total: 3.4 },
    { currency: 'SOL', available: 50, reserved: 10, total: 60 }
  ]

  for (const balance of balances) {
    await prisma.balance.upsert({
      where: { userId_currency: { userId: user.id, currency: balance.currency } },
      update: balance,
      create: { ...balance, userId: user.id }
    })
  }
  console.log(`✅ Saldos criados`)

  // Criar histórico de saldo inicial
  const totalBrl = balances.reduce((sum, b) => {
    if (b.currency === 'USDT') return sum + b.available * 5.85
    if (b.currency === 'BNB') return sum + b.available * 3200
    if (b.currency === 'BTC') return sum + b.available * 350000
    if (b.currency === 'ETH') return sum + b.available * 18000
    if (b.currency === 'SOL') return sum + b.available * 80
    return sum
  }, 0)

  await prisma.balanceHistory.create({
    data: {
      userId: user.id,
      totalBrl,
      timestamp: new Date()
    }
  })
  console.log(`✅ Histórico de saldo criado`)

  console.log('🎉 Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
