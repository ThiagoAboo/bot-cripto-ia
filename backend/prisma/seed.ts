// backend/prisma/seed.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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

  // Criar bots (estratégias)
  const bots = [
    { id: "bot1", name: "Scalper V2", strategyType: "scalper", description: "Operações rápidas com pequenos lucros" },
    { id: "bot2", name: "Momentum Trader", strategyType: "momentum", description: "Identifica moedas com forte momentum" },
    { id: "bot3", name: "Trend Follower", strategyType: "trend_follower", description: "Segue tendências de médio/longo prazo" },
    { id: "bot4", name: "Mean Reversion", strategyType: "mean_reversion", description: "Identifica moedas sobrecompradas/sobrevendidas" },
    { id: "bot5", name: "Arbitrage Hunter", strategyType: "arbitrage", description: "Identifica oportunidades de arbitragem" }
  ]

  for (const botData of bots) {
    await prisma.bot.upsert({
      where: { id: botData.id },
      update: {},
      create: {
        id: botData.id,
        name: botData.name,
        strategyType: botData.strategyType,
        description: botData.description,
        status: 'online'
      }
    })
  }
  console.log(`✅ Bots criados`)

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