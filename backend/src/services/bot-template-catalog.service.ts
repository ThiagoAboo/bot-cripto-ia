import { prisma } from '../config/database'

type CatalogTemplate = {
  id: string
  slug: string
  name: string
  strategyType: string
  indicatorType: string | null
  specialization: string | null
  description: string
  defaultParameters: Record<string, unknown>
}

const BOT_TEMPLATE_CATALOG: CatalogTemplate[] = [
  {
    id: 'template_scalper_core',
    slug: 'scalper-core',
    name: 'Scalper Core Bot',
    strategyType: 'scalper',
    indicatorType: 'OrderBook',
    specialization: 'scalper',
    description: 'Bot de microestrutura para spread curto, volume e imbalance do livro',
    defaultParameters: {
      timeframe: '1m',
      maxSpreadPercent: 0.1,
      minVolume: 100000,
      takeProfitTicks: 5,
      stopLossTicks: 3,
      maxTradeDurationSeconds: 300,
      microMomentumThresholdPercent: 0.1,
      orderImbalanceThreshold: 0.6,
      maxPositionSize: 300,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.02,
    },
  },
  {
    id: 'template_arbitrage_core',
    slug: 'arbitrage-core',
    name: 'Arbitrage Core Bot',
    strategyType: 'arbitrage',
    indicatorType: 'Dislocation',
    specialization: 'arbitrage',
    description: 'Bot de dislocacao relativa com filtros de liquidez e spread',
    defaultParameters: {
      timeframe: '5m',
      minSpreadPercent: 0.5,
      maxLatencyMs: 100,
      minLiquidity: 50000,
      maxTradeSize: 1000,
      maxPositionSize: 400,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_rsi_reversion',
    slug: 'rsi-reversion-specialist',
    name: 'RSI Reversion Specialist',
    strategyType: 'mean_reversion',
    indicatorType: 'RSI',
    specialization: 'rsi_reversion',
    description: 'Especialista em reversao a media usando RSI e sobrevenda/sobrecompra',
    defaultParameters: {
      timeframe: '1h',
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
    description: 'Especialista em aceleracao de momentum usando cruzamentos de MACD',
    defaultParameters: {
      timeframe: '1h',
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
      momentumThreshold: 2.5,
      lookbackPeriods: [6, 24],
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
    description: 'Especialista em tendencia usando cruzamento de medias exponenciais',
    defaultParameters: {
      timeframe: '4h',
      fastEma: 20,
      slowEma: 50,
      trendEma: 200,
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
    description: 'Especialista em retorno a media com Bandas de Bollinger',
    defaultParameters: {
      timeframe: '1h',
      bbPeriod: 20,
      bbStdDev: 2,
      zscoreThreshold: 2,
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
    description: 'Especialista em rompimentos confirmados por expansao de volume',
    defaultParameters: {
      timeframe: '15m',
      volumeMultiplier: 1.8,
      breakoutLookback: 20,
      atrFilter: true,
      maxPositionSize: 500,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.025,
    },
  },
  {
    id: 'template_social_discovery',
    slug: 'social-discovery-specialist',
    name: 'Social Discovery Specialist',
    strategyType: 'momentum',
    indicatorType: 'Social',
    specialization: 'social_discovery',
    description: 'Especialista em descoberta e priorizacao de ativos por tracao social',
    defaultParameters: {
      timeframe: '1h',
      minSocialScore: 70,
      minMentions: 20,
      maxPositionSize: 400,
      minCorrelationThreshold: 0.85,
      atrPeriod: 14,
      targetAtrPercent: 0.03,
    },
  },
]

let syncInFlight: Promise<void> | null = null

async function syncCatalogOnce(): Promise<void> {
  await Promise.all(BOT_TEMPLATE_CATALOG.map((template) => prisma.botTemplate.upsert({
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
  })))
}

export async function syncBotTemplateCatalog(): Promise<void> {
  if (!syncInFlight) {
    syncInFlight = syncCatalogOnce()
      .finally(() => {
        syncInFlight = null
      })
  }

  await syncInFlight
}
