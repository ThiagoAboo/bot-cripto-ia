// backend/prisma/seed.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

function normalizeDatabaseUrlForHostExecution(value: string | undefined): string | undefined {
  if (!value || !value.includes('@postgres:5432')) {
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

const BOT_TEMPLATES = [
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
    },
  },
]

const BOT_INSTANCES = [
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
      preferences: JSON.stringify({ notificationsEnabled: true, theme: 'dark' })
    }
  })
  console.log(`✅ Usuário criado: ${user.email} (ID: ${user.id})`)

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
    await prisma.bot.upsert({
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
        status: 'online'
      }
    })
  }
  console.log(`✅ Instâncias de bots criadas`)

  // Criar saldos iniciais
  const balances = [
    { currency: 'USDT', available: 12500, reserved: 500, total: 13000 },
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
