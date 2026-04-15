import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { getAvailablePairs, testBinanceConnection } from '../services/binance.service'
import {
  buildDefaultConfigurationData,
  normalizeFeeSettings,
  normalizePairDiscoveryConfig,
  parsePairDiscoveryConfig,
  serializePairDiscoveryConfig,
} from '../services/configuration.service'
import { ExternalApiError } from '../services/external-http.service'
import { generatePairDiscoveryPreview, getLatestSocialSignals } from '../services/pair-discovery.service'
import { getPairDiscoveryRunnerStatus, runPairDiscoveryForUser } from '../services/pair-discovery-runner.service'
import { executeConfigurationReset, type ConfigurationResetScope } from '../services/configuration-reset.service'
import { endTrace, startTrace, trace } from '../utils/tracer'

const feesSchema = z.object({
  useBnbForFees: z.boolean(),
  discountUsdtPercent: z.number().min(0).max(1),
  discountBnbPercent: z.number().min(0).max(1),
  minBnbBalance: z.number().min(0),
  reserveBnbForFeesEnabled: z.boolean(),
})

const pairDiscoverySourcesSchema = z.object({
  reddit: z.boolean(),
  rss: z.boolean(),
  x: z.boolean(),
  telegram: z.boolean(),
})

const pairDiscoverySchema = z.object({
  autoDiscoveryEnabled: z.boolean(),
  autoAddToAllowedPairs: z.boolean(),
  autoRemoveFromAllowedPairs: z.boolean(),
  reviewRequired: z.boolean(),
  autoSyncIntervalMinutes: z.number().min(5),
  sources: pairDiscoverySourcesSchema,
  minSocialScore: z.number().min(0).max(100),
  minMentions: z.number().min(0),
  maxPairs: z.number().positive(),
  excludedAssets: z.array(z.string()),
  managedPairs: z.array(z.string()).optional(),
  lastSyncAt: z.string().optional(),
  lastAppliedAt: z.string().optional(),
  lastSyncStatus: z.enum(['idle', 'previewed', 'applied', 'skipped', 'error']).optional(),
  lastSyncSummary: z.string().optional(),
})

const pairDiscoveryOverrideSchema = z.object({
  autoDiscoveryEnabled: z.boolean().optional(),
  autoAddToAllowedPairs: z.boolean().optional(),
  autoRemoveFromAllowedPairs: z.boolean().optional(),
  reviewRequired: z.boolean().optional(),
  autoSyncIntervalMinutes: z.number().min(5).optional(),
  sources: pairDiscoverySourcesSchema.partial().optional(),
  minSocialScore: z.number().min(0).max(100).optional(),
  minMentions: z.number().min(0).optional(),
  maxPairs: z.number().positive().optional(),
  excludedAssets: z.array(z.string()).optional(),
  managedPairs: z.array(z.string()).optional(),
  lastSyncAt: z.string().optional(),
  lastAppliedAt: z.string().optional(),
  lastSyncStatus: z.enum(['idle', 'previewed', 'applied', 'skipped', 'error']).optional(),
  lastSyncSummary: z.string().optional(),
})

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
    fees: feesSchema,
    pairDiscovery: pairDiscoverySchema,
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

const pairDiscoveryPreviewSchema = z.object({
  allowedPairs: z.array(z.string()).optional(),
  fees: feesSchema.partial().optional(),
  pairDiscovery: pairDiscoveryOverrideSchema.optional(),
})

const pairDiscoveryApplySchema = pairDiscoveryPreviewSchema.extend({
  force: z.boolean().optional(),
})

const configurationResetSchema = z.object({
  scope: z.enum([
    'logs_traces',
    'cash',
    'transactions',
    'trainings',
    'paper',
    'bots_runtime',
    'all_except_configurations',
    'configurations',
    'all',
  ] satisfies [ConfigurationResetScope, ...ConfigurationResetScope[]]),
})

type ConfigurationPayload = z.infer<typeof configurationsSchema>
type PairDiscoveryState = ReturnType<typeof parsePairDiscoveryConfig>
type PairDiscoveryOverride = Partial<Omit<PairDiscoveryState, 'sources'>> & {
  sources?: Partial<PairDiscoveryState['sources']>
}
type ConfigurationResponse = {
  exchangeApiKeys: {
    exchange: string
    apiKey: string
    secretKey: string
  }
  botParameters: {
    riskManagement: {
      stopLossPercent: number
      takeProfitPercent: number
      leverage: number
      maxTradeAmount: number
      maxTradeAmountUnit: string
    }
    allowedPairs: string[]
    fees: {
      useBnbForFees: boolean
      discountUsdtPercent: number
      discountBnbPercent: number
      minBnbBalance: number
      reserveBnbForFeesEnabled: boolean
    }
    pairDiscovery: ReturnType<typeof parsePairDiscoveryConfig>
    advanced: {
      mode: string
      orderType: string
      slippagePercent: number
    }
    strategies: Array<Record<string, unknown>>
  }
}

function redactKey(value: string): string {
  if (!value) {
    return ''
  }

  if (value.length <= 8) {
    return '[REDACTED]'
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`
}

function sanitizeConfigurationForLogging(payload: ConfigurationPayload | ConfigurationResponse) {
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
      pairDiscovery: payload.botParameters.pairDiscovery,
      advanced: payload.botParameters.advanced,
      strategies: payload.botParameters.strategies,
    },
  }
}

function buildConfigurationResponse(config: {
  exchange: string
  apiKey: string
  secretKey: string
  stopLossPercent: number
  takeProfitPercent: number
  leverage: number
  maxTradeAmount: number
  maxTradeAmountUnit: string
  allowedPairs: string
  useBnbForFees: boolean
  discountUsdtPercent: number
  discountBnbPercent: number
  minBnbBalance: number
  reserveBnbForFeesEnabled: boolean
  pairDiscovery: string
  mode: string
  orderType: string
  slippagePercent: number
  strategies: string
}) {
  return {
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
        useBnbForFees: config.useBnbForFees,
        discountUsdtPercent: config.discountUsdtPercent,
        discountBnbPercent: config.discountBnbPercent,
        minBnbBalance: config.minBnbBalance,
        reserveBnbForFeesEnabled: config.reserveBnbForFeesEnabled,
      },
      pairDiscovery: parsePairDiscoveryConfig(config.pairDiscovery),
      advanced: {
        mode: config.mode,
        orderType: config.orderType,
        slippagePercent: config.slippagePercent,
      },
      strategies: JSON.parse(config.strategies),
    },
  }
}

async function findOrCreateConfiguration(userId: string) {
  let config = await prisma.configuration.findUnique({
    where: { userId },
  })

  if (config) {
    return config
  }

  config = await prisma.configuration.create({
    data: {
      userId,
      ...buildDefaultConfigurationData(),
    },
  })

  logger.info('[configurations] Configurações padrão criadas', {
    module: 'configurations',
    event: 'default_configuration_created',
    userId,
    configuration: sanitizeConfigurationForLogging(buildConfigurationResponse(config)),
  })

  return config
}

function mergePairDiscoveryState(
  currentSerializedValue: string,
  incoming?: PairDiscoveryOverride,
) {
  const current = parsePairDiscoveryConfig(currentSerializedValue)
  return normalizePairDiscoveryConfig({
    ...current,
    ...incoming,
    sources: {
      ...current.sources,
      ...(incoming?.sources ?? {}),
    },
    excludedAssets: incoming?.excludedAssets ?? current.excludedAssets,
    managedPairs: incoming?.managedPairs ?? current.managedPairs,
  })
}

function parseAllowedPairs(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

export async function getConfigurations(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getConfigurations', 'configurations')

  try {
    trace('DEBUG', 'configurations', 'getConfigurations', 'Buscando configurações do usuário', 0)

    const userId = req.userId!
    const config = await findOrCreateConfiguration(userId)
    trace('DEBUG', 'configurations', 'getConfigurations', 'Configurações carregadas', 0)

    const response = buildConfigurationResponse(config)

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
    const existingConfig = await prisma.configuration.findUnique({
      where: { userId },
      select: { pairDiscovery: true },
    })
    const pairDiscoveryConfig = mergePairDiscoveryState(existingConfig?.pairDiscovery ?? serializePairDiscoveryConfig(), botParameters.pairDiscovery)

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
        useBnbForFees: botParameters.fees.useBnbForFees,
        discountUsdtPercent: botParameters.fees.discountUsdtPercent,
        discountBnbPercent: botParameters.fees.discountBnbPercent,
        minBnbBalance: botParameters.fees.minBnbBalance,
        reserveBnbForFeesEnabled: botParameters.fees.reserveBnbForFeesEnabled,
        pairDiscovery: serializePairDiscoveryConfig(pairDiscoveryConfig),
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
        useBnbForFees: botParameters.fees.useBnbForFees,
        discountUsdtPercent: botParameters.fees.discountUsdtPercent,
        discountBnbPercent: botParameters.fees.discountBnbPercent,
        minBnbBalance: botParameters.fees.minBnbBalance,
        reserveBnbForFeesEnabled: botParameters.fees.reserveBnbForFeesEnabled,
        pairDiscovery: serializePairDiscoveryConfig(pairDiscoveryConfig),
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

export async function getSocialLatest(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getSocialLatest', 'configurations')

  try {
    const config = await findOrCreateConfiguration(req.userId!)
    const pairDiscovery = parsePairDiscoveryConfig(config.pairDiscovery)
    const signals = await getLatestSocialSignals(pairDiscovery)

    endTrace('getSocialLatest', { userId: req.userId })
    return res.json({
      success: true,
      data: signals,
    })
  } catch (error) {
    logger.error('[configurations] Erro ao buscar sinais sociais', {
      module: 'configurations',
      event: 'get_social_latest_error',
      userId: req.userId,
      error,
    })

    endTrace('getSocialLatest', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro ao buscar sinais sociais' })
  }
}

export async function previewPairDiscovery(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'previewPairDiscovery', 'configurations')

  try {
    const validation = pairDiscoveryPreviewSchema.safeParse(req.body ?? {})
    if (!validation.success) {
      endTrace('previewPairDiscovery', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const config = await findOrCreateConfiguration(req.userId!)
    const currentPairDiscovery = parsePairDiscoveryConfig(config.pairDiscovery)
    const pairDiscovery = mergePairDiscoveryState(config.pairDiscovery, validation.data.pairDiscovery)
    const fees = normalizeFeeSettings({
      useBnbForFees: config.useBnbForFees,
      discountUsdtPercent: config.discountUsdtPercent,
      discountBnbPercent: config.discountBnbPercent,
      minBnbBalance: config.minBnbBalance,
      reserveBnbForFeesEnabled: config.reserveBnbForFeesEnabled,
      ...(validation.data.fees ?? {}),
    })
    const allowedPairs = validation.data.allowedPairs ?? parseAllowedPairs(config.allowedPairs)
    const preview = await generatePairDiscoveryPreview({
      allowedPairs,
      fees,
      pairDiscovery,
    })

    logger.info('[configurations] Preview de pair discovery gerado', {
      module: 'configurations',
      event: 'pair_discovery_preview_generated',
      userId: req.userId,
      reviewRequired: currentPairDiscovery.reviewRequired,
      additions: preview.summary.additions,
      removals: preview.summary.removals,
    })

    endTrace('previewPairDiscovery', { userId: req.userId })
    return res.json({
      success: true,
      data: preview,
    })
  } catch (error) {
    logger.error('[configurations] Erro ao gerar preview de pair discovery', {
      module: 'configurations',
      event: 'pair_discovery_preview_error',
      userId: req.userId,
      error,
    })

    endTrace('previewPairDiscovery', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro ao gerar preview de pair discovery' })
  }
}

export async function applyPairDiscovery(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'applyPairDiscovery', 'configurations')

  try {
    const validation = pairDiscoveryApplySchema.safeParse(req.body ?? {})
    if (!validation.success) {
      endTrace('applyPairDiscovery', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const config = await findOrCreateConfiguration(req.userId!)
    const pairDiscovery = mergePairDiscoveryState(config.pairDiscovery, validation.data.pairDiscovery)
    const fees = normalizeFeeSettings({
      useBnbForFees: config.useBnbForFees,
      discountUsdtPercent: config.discountUsdtPercent,
      discountBnbPercent: config.discountBnbPercent,
      minBnbBalance: config.minBnbBalance,
      reserveBnbForFeesEnabled: config.reserveBnbForFeesEnabled,
      ...(validation.data.fees ?? {}),
    })
    const allowedPairs = validation.data.allowedPairs ?? parseAllowedPairs(config.allowedPairs)
    const preview = await generatePairDiscoveryPreview({
      allowedPairs,
      fees,
      pairDiscovery,
    })

    if (preview.reviewRequired && !validation.data.force) {
      endTrace('applyPairDiscovery', { userId: req.userId })
      return res.json({
        success: true,
        data: {
          applied: false,
          requiresConfirmation: true,
          preview,
        },
      })
    }

    const updatedPairDiscovery = normalizePairDiscoveryConfig({
      ...pairDiscovery,
      managedPairs: preview.managedPairs,
    })

    const updatedConfig = await prisma.configuration.update({
      where: { userId: req.userId! },
      data: {
        allowedPairs: JSON.stringify(preview.nextAllowedPairs),
        pairDiscovery: serializePairDiscoveryConfig(updatedPairDiscovery),
        updatedAt: new Date(),
      },
    })

    logger.info('[configurations] Sugestões de pair discovery aplicadas', {
      module: 'configurations',
      event: 'pair_discovery_applied',
      userId: req.userId,
      additions: preview.summary.additions,
      removals: preview.summary.removals,
      reviewRequired: preview.reviewRequired,
    })

    endTrace('applyPairDiscovery', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        applied: true,
        requiresConfirmation: false,
        preview,
        configuration: buildConfigurationResponse(updatedConfig),
      },
    })
  } catch (error) {
    logger.error('[configurations] Erro ao aplicar sugestões de pair discovery', {
      module: 'configurations',
      event: 'pair_discovery_apply_error',
      userId: req.userId,
      error,
    })

    endTrace('applyPairDiscovery', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro ao aplicar sugestões de pair discovery' })
  }
}

export async function runPairDiscoveryNow(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'runPairDiscoveryNow', 'configurations')

  try {
    const result = await runPairDiscoveryForUser(req.userId!)
    const runnerStatus = getPairDiscoveryRunnerStatus()
    const refreshedConfig = await findOrCreateConfiguration(req.userId!)

    logger.info('[configurations] Execução manual de pair discovery concluída', {
      module: 'configurations',
      event: 'pair_discovery_manual_run',
      userId: req.userId,
      applied: result.applied,
      previewRequired: result.previewRequired,
      status: result.status,
      additions: result.preview.summary.additions,
      removals: result.preview.summary.removals,
    })

    endTrace('runPairDiscoveryNow', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        ...result,
        runner: runnerStatus,
        configuration: buildConfigurationResponse(refreshedConfig),
      },
    })
  } catch (error) {
    logger.error('[configurations] Erro ao executar pair discovery manualmente', {
      module: 'configurations',
      event: 'pair_discovery_manual_run_error',
      userId: req.userId,
      error,
    })

    endTrace('runPairDiscoveryNow', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro ao executar descoberta automática' })
  }
}

export async function runConfigurationReset(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'runConfigurationReset', 'configurations')

  try {
    const validation = configurationResetSchema.safeParse(req.body ?? {})
    if (!validation.success) {
      endTrace('runConfigurationReset', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const result = await executeConfigurationReset(userId, validation.data.scope)
    const refreshedConfig = await findOrCreateConfiguration(userId)

    logger.warn('[configurations] Operação de reset executada', {
      module: 'configurations',
      event: 'configuration_reset_executed',
      userId,
      scope: validation.data.scope,
      deletedRecords: result.deletedRecords,
      deletedFiles: result.deletedFiles,
      preservedApiKeys: result.preservedApiKeys,
      paperBalance: result.paperBalance,
    })

    endTrace('runConfigurationReset', { userId })
    return res.json({
      success: true,
      data: {
        ...result,
        configuration: buildConfigurationResponse(refreshedConfig),
      },
    })
  } catch (error) {
    logger.error('[configurations] Erro ao executar reset de configuração', {
      module: 'configurations',
      event: 'configuration_reset_error',
      userId: req.userId,
      error,
    })

    endTrace('runConfigurationReset', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro ao executar limpeza solicitada' })
  }
}

export async function testConnection(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'testConnection', 'configurations')

  try {
    const { exchange, apiKey, secretKey } = req.body as { exchange?: string; apiKey?: string; secretKey?: string }
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

    if ((exchange ?? 'binance') !== 'binance') {
      endTrace('testConnection', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        message: 'Apenas Binance está suportada nesta integração externa',
      })
    }

    const connection = await testBinanceConnection(apiKey, secretKey)

    logger.info('[configurations] Teste de conexão bem sucedido', {
      module: 'configurations',
      event: 'configuration_test_connection_success',
      userId: req.userId,
      exchange,
      apiKey: redactKey(apiKey),
      secretKey: redactKey(secretKey),
      connection,
    })

    trace('DEBUG', 'configurations', 'testConnection', 'Conexão bem sucedida', 0, { exchange })
    endTrace('testConnection', { userId: req.userId })
    return res.json({
      success: true,
      message: 'Conexão estabelecida com sucesso!',
      data: connection,
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

    if (error instanceof ExternalApiError) {
      const status = error.status === 401 || error.code === -2014 ? 401 : 502
      return res.status(status).json({ success: false, message: error.message, code: error.code })
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getExchangePairs(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getExchangePairs', 'configurations')

  try {
    trace('DEBUG', 'configurations', 'getExchangePairs', 'Buscando pares disponíveis', 0)

    const pairs = await getAvailablePairs()

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

    if (error instanceof ExternalApiError) {
      return res.status(502).json({ success: false, error: error.message, code: error.code })
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
