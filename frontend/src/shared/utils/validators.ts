import { z } from 'zod'

// Schema para validação de ordem manual
export const manualOrderSchema = z.object({
  pair: z.string().min(1, 'Par é obrigatório'),
  type: z.enum(['buy', 'sell']),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  orderType: z.enum(['market', 'limit']),
  price: z.number().positive('Preço deve ser maior que zero').optional(),
}).refine((data) => {
  if (data.orderType === 'limit' && !data.price) {
    return false
  }
  return true
}, {
  message: 'Preço é obrigatório para ordens limit',
  path: ['price'],
})

// Schema para validação de parâmetros do bot
export const botParametersSchema = z.object({
  riskManagement: z.object({
    stopLossPercent: z.number().min(0.1, 'Stop-loss mínimo é 0.1%').max(50, 'Stop-loss máximo é 50%'),
    takeProfitPercent: z.number().min(0.1, 'Take-profit mínimo é 0.1%').max(100, 'Take-profit máximo é 100%'),
    leverage: z.literal(1),
    maxTradeAmount: z.number().positive('Valor máximo deve ser positivo'),
    maxTradeAmountUnit: z.enum(['USDT', 'percent']),
  }),
  fees: z.object({
    useBnbForFees: z.boolean(),
    discountUsdtPercent: z.number().min(0).max(1),
    discountBnbPercent: z.number().min(0).max(1),
    minBnbBalance: z.number().min(0),
    reserveBnbForFeesEnabled: z.boolean(),
  }),
  pairDiscovery: z.object({
    autoDiscoveryEnabled: z.boolean(),
    autoAddToAllowedPairs: z.boolean(),
    autoRemoveFromAllowedPairs: z.boolean(),
    reviewRequired: z.boolean(),
    sources: z.object({
      reddit: z.boolean(),
      rss: z.boolean(),
      x: z.boolean(),
      telegram: z.boolean(),
    }),
    minSocialScore: z.number().min(0).max(100),
    minMentions: z.number().min(0),
    maxPairs: z.number().positive(),
    excludedAssets: z.array(z.string()),
  }),
  advanced: z.object({
    mode: z.literal('spot'),
    orderType: z.enum(['market', 'limit']),
    slippagePercent: z.number().min(0).max(5),
  }),
})

// Schema para validação de API keys
export const apiKeysSchema = z.object({
  exchange: z.literal('binance'),
  apiKey: z.string().min(10, 'API Key inválida'),
  secretKey: z.string().min(10, 'Secret Key inválida'),
})

// Schema para validação de treinamento
export const trainingConfigSchema = z.object({
  botId: z.string().min(1, 'Selecione um bot'),
  architecture: z.enum(['lstm', 'cnn', 'linear_regression', 'random_forest', 'xgboost', 'transformer']),
  modelVersion: z.string().min(1, 'Versão do modelo é obrigatória'),
  trainingPeriod: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  hyperparameters: z.object({
    epochs: z.number().min(1).max(1000),
    learningRate: z.number().min(0.0001).max(0.1),
    batchSize: z.number().min(8).max(512),
    validationSplit: z.number().min(0.1).max(0.5),
  }),
})

// Funções de validação
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePassword(password: string): boolean {
  return password.length >= 8
}

export function validatePositiveNumber(value: number): boolean {
  return !isNaN(value) && value > 0
}

export function validatePercentage(value: number): boolean {
  return !isNaN(value) && value >= 0 && value <= 100
}

export function validateQuantity(value: number, available: number): boolean {
  return !isNaN(value) && value > 0 && value <= available
}
