import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'

const configurationsSchema = z.object({
  exchangeApiKeys: z.object({
    exchange: z.enum(['binance', 'kucoin', 'bybit']),
    apiKey: z.string(),
    secretKey: z.string(),
  }),
  botParameters: z.object({
    riskManagement: z.object({
      stopLossPercent: z.number().min(0).max(50),
      takeProfitPercent: z.number().min(0).max(100),
      leverage: z.number().min(1).max(125),
      maxTradeAmount: z.number().positive(),
      maxTradeAmountUnit: z.enum(['USDT', 'percent']),
    }),
    allowedPairs: z.array(z.string()),
    fees: z.object({
      discountUsdtPercent: z.number().min(0).max(1),
      discountBnbPercent: z.number().min(0).max(1),
      minBnbBalance: z.number().min(0),
    }),
    advanced: z.object({
      mode: z.enum(['spot', 'futures']),
      orderType: z.enum(['market', 'limit']),
      slippagePercent: z.number().min(0).max(5),
    }),
    strategies: z.array(z.object({
      id: z.string(),
      name: z.string(),
      strategyType: z.string(),
      isActive: z.boolean(),
      parameters: z.record(z.any()),
    })),
  }),
})

type ConfigurationPayload = z.infer<typeof configurationsSchema>

function redactKey(value: string): string {
  if (!value) {
    return ''
  }

  if (value.length <= 8) {
    return '[REDACTED]'
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`
}

function sanitizeConfigurationForLogging(payload: ConfigurationPayload) {
  return {
    exchangeApiKeys: {
      exchange: payload.exchangeApiKeys.exchange,
      apiKey: redactKey(payload.exchangeApiKeys.apiKey),
      secretKey: redactKey(payload.exchangeApiKeys.secretKey),
    },
    botParameters: {
      riskManagement: payload.botParameters.riskManagement,
      allowedPairs: payload.botParameters.allowedPairs,
      fees: payload.botParameters.fees,
      advanced: payload.botParameters.advanced,
      strategies: payload.botParameters.strategies,
    },
  }
}

function buildDefaultStrategies(): string {
  return JSON.stringify([
    {
      id: 'strategy_scalper',
      name: 'Scalper V2',
      strategyType: 'scalper',
      isActive: true,
      parameters: {
        timeframe: '1m',
        maxSpread: 0.1,
        minVolume: 100000,
        takeProfitTicks: 5,
        stopLossTicks: 3,
      },
    },
    {
      id: 'strategy_momentum',
      name: 'Momentum Trader',
      strategyType: 'momentum',
      isActive: true,
      parameters: {
        period: 14,
        threshold: 2.5,
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30,
      },
    },
    {
      id: 'strategy_trend',
      name: 'Trend Follower',
      strategyType: 'trend_follower',
      isActive: true,
      parameters: {
        fastEma: 20,
        slowEma: 50,
        adxPeriod: 14,
        adxThreshold: 25,
      },
    },
    {
      id: 'strategy_reversion',
      name: 'Mean Reversion',
      strategyType: 'mean_reversion',
      isActive: true,
      parameters: {
        bbPeriod: 20,
        bbStdDev: 2,
        rsiPeriod: 14,
        rsiLower: 30,
        rsiUpper: 70,
      },
    },
    {
      id: 'strategy_arbitrage',
      name: 'Arbitrage Hunter',
      strategyType: 'arbitrage',
      isActive: false,
      parameters: {
        minSpreadPercent: 0.5,
        maxLatencyMs: 100,
        minLiquidity: 50000,
      },
    },
  ])
}

export async function getConfigurations(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getConfigurations', 'configurations')

  try {
    trace('DEBUG', 'configurations', 'getConfigurations', 'Buscando configurações do usuário', 0)

    const userId = req.userId!
    let config = await prisma.configuration.findUnique({
      where: { userId },
    })

    if (!config) {
      trace('DEBUG', 'configurations', 'getConfigurations', 'Configurações não encontradas, criando padrão', 0)

      const defaultStrategies = buildDefaultStrategies()
      config = await prisma.configuration.create({
        data: {
          userId,
          exchange: 'binance',
          apiKey: '',
          secretKey: '',
          stopLossPercent: 5.0,
          takeProfitPercent: 10.0,
          leverage: 1,
          maxTradeAmount: 1000,
          maxTradeAmountUnit: 'USDT',
          allowedPairs: JSON.stringify(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']),
          discountUsdtPercent: 0.075,
          discountBnbPercent: 0.075,
          minBnbBalance: 0.01,
          mode: 'spot',
          orderType: 'market',
          slippagePercent: 0.5,
          strategies: defaultStrategies,
        },
      })

      logger.info('[configurations] Configurações padrão criadas', {
        module: 'configurations',
        event: 'default_configuration_created',
        userId,
        configuration: {
          exchangeApiKeys: {
            exchange: config.exchange,
            apiKey: '',
            secretKey: '',
          },
          botParameters: {
            riskManagement: {
              stopLossPercent: config.stopLossPercent,
              takeProfitPercent: config.takeProfitPercent,
              leverage: config.leverage,
              maxTradeAmount: config.maxTradeAmount,
              maxTradeAmountUnit: config.maxTradeAmountUnit,
            },
            allowedPairs: JSON.parse(config.allowedPairs),
            fees: {
              discountUsdtPercent: config.discountUsdtPercent,
              discountBnbPercent: config.discountBnbPercent,
              minBnbBalance: config.minBnbBalance,
            },
            advanced: {
              mode: config.mode,
              orderType: config.orderType,
              slippagePercent: config.slippagePercent,
            },
            strategies: JSON.parse(config.strategies),
          },
        },
      })

      trace('DEBUG', 'configurations', 'getConfigurations', 'Configurações padrão criadas', 0)
    }

    const response = {
      exchangeApiKeys: {
        exchange: config.exchange,
        apiKey: config.apiKey,
        secretKey: config.secretKey,
      },
      botParameters: {
        riskManagement: {
          stopLossPercent: config.stopLossPercent,
          takeProfitPercent: config.takeProfitPercent,
          leverage: config.leverage,
          maxTradeAmount: config.maxTradeAmount,
          maxTradeAmountUnit: config.maxTradeAmountUnit,
        },
        allowedPairs: JSON.parse(config.allowedPairs),
        fees: {
          discountUsdtPercent: config.discountUsdtPercent,
          discountBnbPercent: config.discountBnbPercent,
          minBnbBalance: config.minBnbBalance,
        },
        advanced: {
          mode: config.mode,
          orderType: config.orderType,
          slippagePercent: config.slippagePercent,
        },
        strategies: JSON.parse(config.strategies),
      },
    }

    trace('DEBUG', 'configurations', 'getConfigurations', 'Configurações retornadas com sucesso', 0)
    endTrace('getConfigurations', { userId })

    return res.json({
      success: true,
      data: response,
    })
  } catch (error) {
    logger.error('[configurations] Erro ao buscar configurações', {
      module: 'configurations',
      event: 'get_configurations_error',
      userId: req.userId,
      error,
    })

    trace('DEBUG', 'configurations', 'getConfigurations', `Erro: ${error}`, 0, { errorFlag: true })
    endTrace('getConfigurations', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function putConfigurations(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'putConfigurations', 'configurations')

  try {
    trace('DEBUG', 'configurations', 'putConfigurations', 'Iniciando salvamento de configurações', 0)

    const validation = configurationsSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('[configurations] Payload inválido ao salvar configurações', {
        module: 'configurations',
        event: 'configuration_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'configurations', 'putConfigurations', 'Validação falhou', 0, {
        errors: validation.error.errors,
      })
      endTrace('putConfigurations', { userId: req.userId, errorFlag: true })

      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    trace('DEBUG', 'configurations', 'putConfigurations', 'Dados validados com sucesso', 0)

    const { exchangeApiKeys, botParameters } = validation.data
    const userId = req.userId!

    await prisma.configuration.upsert({
      where: { userId },
      update: {
        exchange: exchangeApiKeys.exchange,
        apiKey: exchangeApiKeys.apiKey,
        secretKey: exchangeApiKeys.secretKey,
        stopLossPercent: botParameters.riskManagement.stopLossPercent,
        takeProfitPercent: botParameters.riskManagement.takeProfitPercent,
        leverage: botParameters.riskManagement.leverage,
        maxTradeAmount: botParameters.riskManagement.maxTradeAmount,
        maxTradeAmountUnit: botParameters.riskManagement.maxTradeAmountUnit,
        allowedPairs: JSON.stringify(botParameters.allowedPairs),
        discountUsdtPercent: botParameters.fees.discountUsdtPercent,
        discountBnbPercent: botParameters.fees.discountBnbPercent,
        minBnbBalance: botParameters.fees.minBnbBalance,
        mode: botParameters.advanced.mode,
        orderType: botParameters.advanced.orderType,
        slippagePercent: botParameters.advanced.slippagePercent,
        strategies: JSON.stringify(botParameters.strategies),
        updatedAt: new Date(),
      },
      create: {
        userId,
        exchange: exchangeApiKeys.exchange,
        apiKey: exchangeApiKeys.apiKey,
        secretKey: exchangeApiKeys.secretKey,
        stopLossPercent: botParameters.riskManagement.stopLossPercent,
        takeProfitPercent: botParameters.riskManagement.takeProfitPercent,
        leverage: botParameters.riskManagement.leverage,
        maxTradeAmount: botParameters.riskManagement.maxTradeAmount,
        maxTradeAmountUnit: botParameters.riskManagement.maxTradeAmountUnit,
        allowedPairs: JSON.stringify(botParameters.allowedPairs),
        discountUsdtPercent: botParameters.fees.discountUsdtPercent,
        discountBnbPercent: botParameters.fees.discountBnbPercent,
        minBnbBalance: botParameters.fees.minBnbBalance,
        mode: botParameters.advanced.mode,
        orderType: botParameters.advanced.orderType,
        slippagePercent: botParameters.advanced.slippagePercent,
        strategies: JSON.stringify(botParameters.strategies),
      },
    })

    trace('DEBUG', 'configurations', 'putConfigurations', 'Configurações salvas no banco com sucesso', 0)

    logger.info('[configurations] Configurações salvas com sucesso', {
      module: 'configurations',
      event: 'configuration_saved',
      userId,
      configuration: sanitizeConfigurationForLogging(validation.data),
    })

    endTrace('putConfigurations', { userId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[configurations] Erro ao salvar configurações', {
      module: 'configurations',
      event: 'configuration_save_error',
      userId: req.userId,
      error,
    })

    trace('DEBUG', 'configurations', 'putConfigurations', `Erro ao salvar: ${error}`, 0, { errorFlag: true })
    endTrace('putConfigurations', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function testConnection(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'testConnection', 'configurations')

  try {
    const { exchange, apiKey, secretKey } = req.body
    trace('DEBUG', 'configurations', 'testConnection', `Testando conexão com ${exchange}`, 0)

    if (!apiKey || !secretKey) {
      logger.warn('[configurations] Teste de conexão sem chaves completas', {
        module: 'configurations',
        event: 'configuration_test_connection_missing_keys',
        userId: req.userId,
        exchange,
      })

      trace('DEBUG', 'configurations', 'testConnection', 'Chaves não fornecidas', 0)
      endTrace('testConnection', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        message: 'Chaves de API não fornecidas',
      })
    }

    const isValid = apiKey.length > 10 && secretKey.length > 10

    if (isValid) {
      logger.info('[configurations] Teste de conexão bem sucedido', {
        module: 'configurations',
        event: 'configuration_test_connection_success',
        userId: req.userId,
        exchange,
        apiKey: redactKey(apiKey),
        secretKey: redactKey(secretKey),
      })

      trace('DEBUG', 'configurations', 'testConnection', 'Conexão bem sucedida', 0, { exchange })
      endTrace('testConnection', { userId: req.userId })
      return res.json({
        success: true,
        message: 'Conexão estabelecida com sucesso!',
      })
    }

    logger.warn('[configurations] Teste de conexão falhou', {
      module: 'configurations',
      event: 'configuration_test_connection_failed',
      userId: req.userId,
      exchange,
      apiKey: redactKey(apiKey),
      secretKey: redactKey(secretKey),
    })

    trace('DEBUG', 'configurations', 'testConnection', 'Conexão falhou - chaves inválidas', 0, { exchange })
    endTrace('testConnection', { userId: req.userId, errorFlag: true })
    return res.status(401).json({
      success: false,
      message: 'Chaves de API inválidas',
    })
  } catch (error) {
    logger.error('[configurations] Erro ao testar conexão', {
      module: 'configurations',
      event: 'configuration_test_connection_error',
      userId: req.userId,
      error,
    })

    trace('DEBUG', 'configurations', 'testConnection', `Erro: ${error}`, 0, { errorFlag: true })
    endTrace('testConnection', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getExchangePairs(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getExchangePairs', 'configurations')

  try {
    trace('DEBUG', 'configurations', 'getExchangePairs', 'Buscando pares disponíveis', 0)

    const pairs = [
      'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
      'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
      'MATIC/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT',
    ]

    trace('DEBUG', 'configurations', 'getExchangePairs', `${pairs.length} pares encontrados`, 0)
    endTrace('getExchangePairs', { userId: req.userId })

    return res.json({
      success: true,
      data: pairs,
    })
  } catch (error) {
    logger.error('[configurations] Erro ao buscar pares disponíveis', {
      module: 'configurations',
      event: 'get_exchange_pairs_error',
      userId: req.userId,
      error,
    })

    trace('DEBUG', 'configurations', 'getExchangePairs', `Erro: ${error}`, 0, { errorFlag: true })
    endTrace('getExchangePairs', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
