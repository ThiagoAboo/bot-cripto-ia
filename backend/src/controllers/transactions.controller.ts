import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { getExchangeRate as getExternalExchangeRate } from '../services/awesomeapi.service'
import { ExternalApiError } from '../services/external-http.service'
import { getAccountBalances, getCandles as getBinanceCandles, getTickerPrice } from '../services/binance.service'
import { normalizeFeeSettings, type FeeSettings } from '../services/configuration.service'
import { getCurrencyRateToBrl } from '../services/market-valuation.service'
import { recordBalanceHistorySnapshot } from '../services/portfolio.service'
import { emitDashboardUpdate, emitOrderCreated, emitOrderUpdated } from '../services/socket.service'
import { sendWebhook } from '../services/webhook.service'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'

const createOrderSchema = z.object({
  pair: z.string().min(1, 'Par é obrigatório'),
  type: z.enum(['buy', 'sell']),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  orderType: z.enum(['market', 'limit']),
  price: z.number().positive().optional(),
}).refine((data) => {
  if (data.orderType === 'limit' && !data.price) {
    return false
  }

  return true
}, {
  message: 'Preço é obrigatório para ordens limit',
  path: ['price'],
})

const orderFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  pair: z.string().optional(),
  types: z.string().optional(),
  statuses: z.string().optional(),
  origins: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
})

const ORDER_FEE_RATE = 0.001
const BALANCE_EPSILON = 1e-8
const FIFO_EPSILON = 1e-8

interface FifoLot {
  remainingQuantity: number
  unitCostInQuote: number
}

interface BalanceState {
  id: string
  currency: string
  available: number
  reserved: number
  total: number
}

interface OrderFeePolicy {
  fee: number
  feeCurrency: string
  feeRateApplied: number
  feeDiscountSource: 'bnb' | 'usdt' | 'standard'
  feeInQuote: number
}

function getPairCurrencies(pair: string): { baseCurrency: string; quoteCurrency: string } {
  const [baseCurrency, quoteCurrency = 'USDT'] = pair
    .split('/')
    .map((value) => value.trim().toUpperCase())

  return {
    baseCurrency,
    quoteCurrency,
  }
}

function consumeFifoLots(lots: FifoLot[], quantityToConsume: number): number {
  let remainingQuantity = quantityToConsume

  while (remainingQuantity > FIFO_EPSILON) {
    const currentLot = lots[0]
    if (!currentLot) {
      break
    }

    const consumedQuantity = Math.min(currentLot.remainingQuantity, remainingQuantity)
    currentLot.remainingQuantity -= consumedQuantity
    remainingQuantity -= consumedQuantity

    if (currentLot.remainingQuantity <= FIFO_EPSILON) {
      lots.shift()
    }
  }

  return remainingQuantity
}

async function calculateSellProfitUsingFifo(
  userId: string,
  pair: string,
  sellQuantity: number,
  sellPrice: number,
  sellFee: number,
): Promise<{ profitBrl: number; profitPercent: number }> {
  const historicalTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      pair,
      status: 'executed',
    },
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      type: true,
      quantity: true,
      total: true,
      fee: true,
    },
  })

  const lots: FifoLot[] = []

  for (const transaction of historicalTransactions) {
    if (transaction.quantity <= FIFO_EPSILON) {
      continue
    }

    if (transaction.type === 'buy') {
      lots.push({
        remainingQuantity: transaction.quantity,
        unitCostInQuote: (transaction.total + transaction.fee) / transaction.quantity,
      })
      continue
    }

    const remainingFromHistoricalSell = consumeFifoLots(lots, transaction.quantity)
    if (remainingFromHistoricalSell > FIFO_EPSILON) {
      throw new Error('Histórico inconsistente para cálculo FIFO')
    }
  }

  let remainingSellQuantity = sellQuantity
  let costBasisInQuote = 0

  while (remainingSellQuantity > FIFO_EPSILON) {
    const currentLot = lots[0]
    if (!currentLot) {
      throw new Error('Não há compras suficientes no histórico para calcular o lucro da venda')
    }

    const allocatedQuantity = Math.min(currentLot.remainingQuantity, remainingSellQuantity)
    costBasisInQuote += allocatedQuantity * currentLot.unitCostInQuote
    currentLot.remainingQuantity -= allocatedQuantity
    remainingSellQuantity -= allocatedQuantity

    if (currentLot.remainingQuantity <= FIFO_EPSILON) {
      lots.shift()
    }
  }

  const { quoteCurrency } = getPairCurrencies(pair)
  const quoteToBrlRate = await getCurrencyRateToBrl(quoteCurrency)
  const netSellValueInQuote = (sellQuantity * sellPrice) - sellFee
  const profitInQuote = netSellValueInQuote - costBasisInQuote

  return {
    profitBrl: profitInQuote * quoteToBrlRate,
    profitPercent: costBasisInQuote > 0 ? (profitInQuote / costBasisInQuote) * 100 : 0,
  }
}

async function getUserExchangeCredentials(userId: string): Promise<{ apiKey: string; secretKey: string } | null> {
  const configuration = await prisma.configuration.findUnique({
    where: { userId },
    select: { apiKey: true, secretKey: true, exchange: true },
  })

  if (!configuration || configuration.exchange !== 'binance' || !configuration.apiKey || !configuration.secretKey) {
    return null
  }

  return {
    apiKey: configuration.apiKey,
    secretKey: configuration.secretKey,
  }
}

function getProtectedBnbFloor(currentBnbAvailable: number, feeSettings: FeeSettings): number {
  if (!feeSettings.reserveBnbForFeesEnabled) {
    return 0
  }

  return Math.min(currentBnbAvailable, feeSettings.minBnbBalance)
}

function addBalanceDelta(deltas: Record<string, number>, currency: string, delta: number): void {
  if (Math.abs(delta) <= BALANCE_EPSILON) {
    return
  }

  const normalizedCurrency = currency.trim().toUpperCase()
  const nextValue = (deltas[normalizedCurrency] ?? 0) + delta

  if (Math.abs(nextValue) <= BALANCE_EPSILON) {
    delete deltas[normalizedCurrency]
    return
  }

  deltas[normalizedCurrency] = nextValue
}

function buildCoreOrderDeltas(
  type: 'buy' | 'sell',
  baseCurrency: string,
  quoteCurrency: string,
  quantity: number,
  totalValue: number,
): Record<string, number> {
  const deltas: Record<string, number> = {}

  if (type === 'buy') {
    addBalanceDelta(deltas, quoteCurrency, -totalValue)
    addBalanceDelta(deltas, baseCurrency, quantity)
    return deltas
  }

  addBalanceDelta(deltas, baseCurrency, -quantity)
  addBalanceDelta(deltas, quoteCurrency, totalValue)
  return deltas
}

async function getAssetPriceInQuote(asset: string, quoteCurrency: string): Promise<number> {
  const normalizedAsset = asset.trim().toUpperCase()
  const normalizedQuote = quoteCurrency.trim().toUpperCase()

  if (normalizedAsset === normalizedQuote) {
    return 1
  }

  const [assetToBrl, quoteToBrl] = await Promise.all([
    getCurrencyRateToBrl(normalizedAsset),
    getCurrencyRateToBrl(normalizedQuote),
  ])

  if (!Number.isFinite(assetToBrl) || assetToBrl <= 0 || !Number.isFinite(quoteToBrl) || quoteToBrl <= 0) {
    throw new Error(`Não foi possível calcular a conversão de ${normalizedAsset} para ${normalizedQuote}`)
  }

  return assetToBrl / quoteToBrl
}

async function getUserFeeSettings(userId: string): Promise<FeeSettings> {
  const configuration = await prisma.configuration.findUnique({
    where: { userId },
    select: {
      useBnbForFees: true,
      discountUsdtPercent: true,
      discountBnbPercent: true,
      minBnbBalance: true,
      reserveBnbForFeesEnabled: true,
    },
  })

  return normalizeFeeSettings(configuration ?? undefined)
}

async function calculateOrderFeePolicy(params: {
  totalValue: number
  quoteCurrency: string
  currentBnbAvailable: number
  projectedBnbAvailableBeforeFee: number
  feeSettings: FeeSettings
}): Promise<OrderFeePolicy> {
  const { totalValue, quoteCurrency, currentBnbAvailable, projectedBnbAvailableBeforeFee, feeSettings } = params
  const quoteCurrencyUpper = quoteCurrency.trim().toUpperCase()
  const usdtDiscountRate = quoteCurrencyUpper === 'USDT'
    ? ORDER_FEE_RATE * (1 - feeSettings.discountUsdtPercent)
    : ORDER_FEE_RATE

  const fallbackPolicy: OrderFeePolicy = {
    fee: totalValue * usdtDiscountRate,
    feeCurrency: quoteCurrencyUpper,
    feeRateApplied: usdtDiscountRate,
    feeDiscountSource: quoteCurrencyUpper === 'USDT' && feeSettings.discountUsdtPercent > 0 ? 'usdt' : 'standard',
    feeInQuote: totalValue * usdtDiscountRate,
  }

  if (!feeSettings.useBnbForFees) {
    return fallbackPolicy
  }

  const protectedFloor = getProtectedBnbFloor(currentBnbAvailable, feeSettings)
  const usableBnb = projectedBnbAvailableBeforeFee - protectedFloor

  if (usableBnb <= BALANCE_EPSILON) {
    return fallbackPolicy
  }

  const feeRateApplied = ORDER_FEE_RATE * (1 - feeSettings.discountBnbPercent)
  const feeInQuote = totalValue * feeRateApplied
  const bnbPriceInQuote = await getAssetPriceInQuote('BNB', quoteCurrencyUpper)
  const feeInBnb = feeInQuote / bnbPriceInQuote

  if (!Number.isFinite(feeInBnb) || feeInBnb <= 0 || feeInBnb > usableBnb + BALANCE_EPSILON) {
    return fallbackPolicy
  }

  return {
    fee: feeInBnb,
    feeCurrency: 'BNB',
    feeRateApplied,
    feeDiscountSource: 'bnb',
    feeInQuote,
  }
}

async function persistBalanceDeltas(
  userId: string,
  balancesByCurrency: Map<string, BalanceState>,
  deltas: Record<string, number>,
): Promise<void> {
  const updates = Object.entries(deltas).map(async ([currency, delta]) => {
    if (Math.abs(delta) <= BALANCE_EPSILON) {
      return
    }

    const existingBalance = balancesByCurrency.get(currency)

    if (existingBalance) {
      await prisma.balance.update({
        where: { id: existingBalance.id },
        data: {
          available: { increment: delta },
          total: { increment: delta },
          updatedAt: new Date(),
        },
      })

      return
    }

    await prisma.balance.create({
      data: {
        userId,
        currency,
        available: delta,
        reserved: 0,
        total: delta,
      },
    })
  })

  await Promise.all(updates)
}

async function syncExternalBalances(userId: string, balances: Array<{ currency: string; available: number; reserved: number; total: number }>): Promise<void> {
  await Promise.all(
    balances.map((balance) => prisma.balance.upsert({
      where: {
        userId_currency: {
          userId,
          currency: balance.currency,
        },
      },
      update: {
        available: balance.available,
        reserved: balance.reserved,
        total: balance.total,
        updatedAt: new Date(),
      },
      create: {
        userId,
        currency: balance.currency,
        available: balance.available,
        reserved: balance.reserved,
        total: balance.total,
      },
    })),
  )
}

export async function getOrders(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getOrders', 'transactions')

  try {
    const validation = orderFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      logger.warn('[transactions] Filtros inválidos ao consultar ordens', {
        module: 'transactions',
        event: 'get_orders_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      endTrace('getOrders', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const { page, limit, pair, types, statuses, origins, startDate, endDate, search } = validation.data
    const userId = req.userId!
    const skip = (page - 1) * limit
    const where: any = { userId }

    if (pair) where.pair = pair
    if (types) where.type = { in: types.split(',') }
    if (statuses) where.status = { in: statuses.split(',') }
    if (origins) where.origin = { in: origins.split(',') }
    if (startDate) where.date = { ...where.date, gte: new Date(startDate) }
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) }
    if (search) {
      where.OR = [
        { pair: { contains: search } },
        { id: { contains: search } },
      ]
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: { bot: { select: { name: true } } },
      }),
      prisma.transaction.count({ where }),
    ])

    const items = transactions.map((transaction: any) => ({
      id: transaction.id,
      date: transaction.date,
      pair: transaction.pair,
      origin: transaction.origin,
      botId: transaction.botId,
      botName: transaction.bot?.name,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      feeRateApplied: transaction.feeRateApplied,
      feeDiscountSource: transaction.feeDiscountSource ?? undefined,
      status: transaction.status,
      profitBrl: transaction.profitBrl,
      profitPercent: transaction.profitPercent,
    }))

    endTrace('getOrders', { userId })
    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('[transactions] Erro ao buscar ordens', {
      module: 'transactions',
      event: 'get_orders_error',
      userId: req.userId,
      error,
    })

    endTrace('getOrders', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}


export async function getOrderById(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getOrderById', 'transactions')

  try {
    const { id } = req.params
    const userId = req.userId!

    const transaction = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { bot: { select: { name: true } } },
    })

    if (!transaction) {
      logger.warn('[transactions] Ordem não encontrada', {
        module: 'transactions',
        event: 'get_order_by_id_not_found',
        userId,
        orderId: id,
      })

      endTrace('getOrderById', { userId, orderId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Ordem não encontrada' })
    }

    const item = {
      id: transaction.id,
      date: transaction.date,
      pair: transaction.pair,
      origin: transaction.origin,
      botId: transaction.botId,
      botName: transaction.bot?.name,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      feeRateApplied: transaction.feeRateApplied,
      feeDiscountSource: transaction.feeDiscountSource ?? undefined,
      status: transaction.status,
      profitBrl: transaction.profitBrl,
      profitPercent: transaction.profitPercent,
    }

    trace('DEBUG', 'transactions', 'getOrderById', 'Ordem recuperada com sucesso', 0, {
      userId,
      orderId: id,
    })
    endTrace('getOrderById', { userId, orderId: id })
    return res.json({ success: true, data: item })
  } catch (error) {
    logger.error('[transactions] Erro ao buscar ordem por id', {
      module: 'transactions',
      event: 'get_order_by_id_error',
      userId: req.userId,
      orderId: req.params.id,
      error,
    })

    endTrace('getOrderById', { userId: req.userId, orderId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function createOrder(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'createOrder', 'transactions')

  try {
    const { pair, type, quantity, orderType, price } = req.body

    if (!pair) {
      endTrace('createOrder', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Par é obrigatório' })
    }

    if (!type || (type !== 'buy' && type !== 'sell')) {
      endTrace('createOrder', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Tipo deve ser "buy" ou "sell"' })
    }

    if (!quantity || quantity <= 0) {
      endTrace('createOrder', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Quantidade deve ser maior que zero' })
    }

    if (orderType === 'limit' && (!price || price <= 0)) {
      endTrace('createOrder', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Preço é obrigatório para ordens limit' })
    }

    const validation = createOrderSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('[transactions] Payload inválido ao criar ordem', {
        module: 'transactions',
        event: 'create_order_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Validação falhou', 0, {
        errors: validation.error.errors,
      })
      endTrace('createOrder', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!
    const { baseCurrency, quoteCurrency } = getPairCurrencies(pair)
    const trackedCurrencies = Array.from(new Set([baseCurrency, quoteCurrency, 'BNB']))
    const balances = await prisma.balance.findMany({
      where: {
        userId,
        currency: { in: trackedCurrencies },
      },
    })
    const balancesByCurrency = new Map(
      balances.map((balance) => [balance.currency.toUpperCase(), balance as BalanceState]),
    )

    const marketPrice = !price ? await getTickerPrice(pair).catch(() => null) : null
    const estimatedPrice = price || marketPrice || 50000
    const totalValue = quantity * estimatedPrice
    const feeSettings = await getUserFeeSettings(userId)
    const coreDeltas = buildCoreOrderDeltas(type, baseCurrency, quoteCurrency, quantity, totalValue)
    const currentBnbAvailable = balancesByCurrency.get('BNB')?.available ?? 0
    const projectedBnbAvailableBeforeFee = currentBnbAvailable + (coreDeltas.BNB ?? 0)
    const feePolicy = await calculateOrderFeePolicy({
      totalValue,
      quoteCurrency,
      currentBnbAvailable,
      projectedBnbAvailableBeforeFee,
      feeSettings,
    })
    const deltas = { ...coreDeltas }
    addBalanceDelta(deltas, feePolicy.feeCurrency, -feePolicy.fee)

    try {
      Object.entries(deltas).forEach(([currency, delta]) => {
        const currentAvailable = balancesByCurrency.get(currency)?.available ?? 0
        const finalAvailable = currentAvailable + delta

        if (finalAvailable < -BALANCE_EPSILON) {
          throw new Error(`Saldo insuficiente de ${currency}`)
        }

        if (currency === 'BNB' && feeSettings.reserveBnbForFeesEnabled) {
          const protectedFloor = getProtectedBnbFloor(currentAvailable, feeSettings)
          if (finalAvailable + BALANCE_EPSILON < protectedFloor) {
            throw new Error('A reserva mínima de BNB para taxas seria violada')
          }
        }
      })
    } catch (balanceError) {
      logger.warn('[transactions] Saldo insuficiente para ordem', {
        module: 'transactions',
        event: 'create_order_insufficient_balance',
        userId,
        pair,
        type,
        deltas,
        error: balanceError,
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, {
        pair,
        type,
        deltas,
        error: balanceError instanceof Error ? balanceError.message : balanceError,
      })
      endTrace('createOrder', { userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: balanceError instanceof Error ? balanceError.message : 'Saldo insuficiente',
      })
    }

    let profitBrl: number | null = null
    let profitPercent: number | null = null

    if (type === 'sell') {
      try {
        const sellProfit = await calculateSellProfitUsingFifo(userId, pair, quantity, estimatedPrice, feePolicy.feeInQuote)
        profitBrl = sellProfit.profitBrl
        profitPercent = sellProfit.profitPercent
      } catch (fifoError) {
        logger.warn('[transactions] Falha ao calcular lucro FIFO da venda', {
          module: 'transactions',
          event: 'create_order_fifo_failed',
          userId,
          pair,
          quantity,
          error: fifoError,
        })

        endTrace('createOrder', { userId, errorFlag: true })
        return res.status(400).json({
          success: false,
          error: fifoError instanceof Error ? fifoError.message : 'Não foi possível calcular o lucro da venda',
        })
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        pair,
        origin: 'manual',
        type,
        quantity,
        price: estimatedPrice,
        total: totalValue,
        fee: feePolicy.fee,
        feeCurrency: feePolicy.feeCurrency,
        feeRateApplied: feePolicy.feeRateApplied,
        feeDiscountSource: feePolicy.feeDiscountSource,
        status: 'executed',
        profitBrl,
        profitPercent,
      },
    })

    const transactionPayload = {
      id: transaction.id,
      date: transaction.date,
      pair: transaction.pair,
      origin: transaction.origin,
      type: transaction.type,
      quantity: transaction.quantity,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      feeRateApplied: transaction.feeRateApplied,
      feeDiscountSource: transaction.feeDiscountSource ?? undefined,
      status: transaction.status,
      profitBrl: transaction.profitBrl,
      profitPercent: transaction.profitPercent,
    }

    await persistBalanceDeltas(userId, balancesByCurrency, deltas)

    await recordBalanceHistorySnapshot(userId).catch((snapshotError) => {
      logger.warn('[transactions] Falha ao registrar snapshot após ordem', {
        module: 'transactions',
        event: 'balance_snapshot_order_failed',
        userId,
        transactionId: transaction.id,
        error: snapshotError,
        skipPersistence: true,
      })
    })

    emitOrderCreated(userId, transactionPayload)
    emitDashboardUpdate(userId, {
      scope: 'portfolio',
      reason: 'order_executed',
      updatedAt: new Date().toISOString(),
    })

    await sendWebhook('order.executed', {
      pair,
      type,
      quantity,
      price: estimatedPrice,
      total: totalValue,
      fee: feePolicy.fee,
      feeCurrency: feePolicy.feeCurrency,
      feeRateApplied: feePolicy.feeRateApplied,
      feeDiscountSource: feePolicy.feeDiscountSource,
      status: 'executed',
      profitBrl,
      profitPercent,
    }).catch((webhookError) => {
      logger.warn('[transactions] Falha ao enviar webhook de ordem executada', {
        module: 'transactions',
        event: 'create_order_webhook_failed',
        userId,
        transactionId: transaction.id,
        error: webhookError,
        skipPersistence: true,
      })
    })

    logger.info('[transactions] Ordem manual criada com sucesso', {
      module: 'transactions',
      event: 'manual_order_created',
      userId,
      transactionId: transaction.id,
      order: {
        pair,
        type,
        quantity,
        orderType,
        price: estimatedPrice,
        total: totalValue,
        fee: feePolicy.fee,
        feeCurrency: feePolicy.feeCurrency,
        feeRateApplied: feePolicy.feeRateApplied,
        feeDiscountSource: feePolicy.feeDiscountSource,
        profitBrl,
        profitPercent,
      },
    })

    trace('DEBUG', 'transactions', 'createOrder', 'Ordem criada com sucesso', 0, {
      transactionId: transaction.id,
      userId,
    })
    endTrace('createOrder', { userId })
    return res.json({
      success: true,
      data: transactionPayload,
    })
  } catch (error) {
    logger.error('[transactions] Erro ao criar ordem', {
      module: 'transactions',
      event: 'create_order_error',
      userId: req.userId,
      error,
    })

    endTrace('createOrder', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function cancelOrder(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'cancelOrder', 'transactions')

  try {
    const { id } = req.params
    const userId = req.userId!
    const order = await prisma.transaction.findFirst({ where: { id, userId } })

    if (!order) {
      endTrace('cancelOrder', { userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Ordem não encontrada' })
    }

    if (order.status !== 'pending') {
      logger.warn('[transactions] Tentativa de cancelar ordem não pendente', {
        module: 'transactions',
        event: 'cancel_order_invalid_status',
        userId,
        orderId: id,
        status: order.status,
      })

      endTrace('cancelOrder', { userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Apenas ordens pendentes podem ser canceladas' })
    }

    await prisma.transaction.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    emitOrderUpdated(userId, {
      id,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    })

    logger.info('[transactions] Ordem cancelada com sucesso', {
      module: 'transactions',
      event: 'order_cancelled',
      userId,
      orderId: id,
    })

    trace('DEBUG', 'transactions', 'cancelOrder', 'Ordem cancelada', 0, { orderId: id, userId })
    endTrace('cancelOrder', { userId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[transactions] Erro ao cancelar ordem', {
      module: 'transactions',
      event: 'cancel_order_error',
      userId: req.userId,
      orderId: req.params.id,
      error,
    })

    endTrace('cancelOrder', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBalance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBalance', 'transactions')

  try {
    const userId = req.userId!
    const credentials = await getUserExchangeCredentials(userId)

    if (credentials) {
      const balances = await getAccountBalances(credentials.apiKey, credentials.secretKey)
      await syncExternalBalances(userId, balances)
      await recordBalanceHistorySnapshot(userId, balances.map((balance) => ({
        currency: balance.currency,
        available: balance.available,
      }))).catch((snapshotError) => {
        logger.warn('[transactions] Falha ao registrar snapshot após sincronização externa', {
          module: 'transactions',
          event: 'balance_snapshot_sync_failed',
          userId,
          error: snapshotError,
          skipPersistence: true,
        })
      })

      emitDashboardUpdate(userId, {
        scope: 'portfolio',
        reason: 'balance_synced',
        updatedAt: new Date().toISOString(),
      })

      endTrace('getBalance', { userId })
      return res.json({ success: true, data: balances })
    }

    const balances = await prisma.balance.findMany({ where: { userId } })
    const result = balances.map((balance: any) => ({
      currency: balance.currency,
      available: balance.available,
      reserved: balance.reserved,
      total: balance.total,
    }))

    endTrace('getBalance', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[transactions] Erro ao buscar saldo', {
      module: 'transactions',
      event: 'get_balance_error',
      userId: req.userId,
      error,
    })

    endTrace('getBalance', { userId: req.userId, errorFlag: true })

    if (error instanceof ExternalApiError) {
      return res.status(502).json({ success: false, error: error.message, code: error.code })
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getExchangeRate(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getExchangeRate', 'transactions')

  try {
    const from = String(req.query.from || '').trim().toUpperCase()
    const to = String(req.query.to || '').trim().toUpperCase()

    if (!from || !to) {
      endTrace('getExchangeRate', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Parâmetros from e to são obrigatórios' })
    }

    const rate = await getExternalExchangeRate(from, to)

    endTrace('getExchangeRate', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        from: rate.from,
        to: rate.to,
        rate: rate.rate,
        pctChange: rate.pctChange,
        lastUpdate: rate.lastUpdate,
      },
    })
  } catch (error) {
    logger.error('[transactions] Erro ao buscar cotação', {
      module: 'transactions',
      event: 'get_exchange_rate_error',
      userId: req.userId,
      error,
    })

    endTrace('getExchangeRate', { userId: req.userId, errorFlag: true })

    if (error instanceof ExternalApiError) {
      return res.status(502).json({ success: false, error: error.message, code: error.code })
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getCandles(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getCandles', 'transactions')

  try {
    const pair = String(req.query.pair || '').trim().toUpperCase()
    const period = String(req.query.period || '').trim() || '1h'
    const limitNum = Math.max(1, Math.min(1000, parseInt(String(req.query.limit || '100'), 10) || 100))

    if (!pair) {
      endTrace('getCandles', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Parâmetro pair é obrigatório' })
    }

    const candles = await getBinanceCandles(pair, period, limitNum)

    endTrace('getCandles', { userId: req.userId })
    return res.json({ success: true, data: candles })
  } catch (error) {
    logger.error('[transactions] Erro ao buscar velas', {
      module: 'transactions',
      event: 'get_candles_error',
      userId: req.userId,
      error,
    })

    endTrace('getCandles', { userId: req.userId, errorFlag: true })

    if (error instanceof ExternalApiError) {
      const status = /intervalo inválido/i.test(error.message) ? 400 : 502
      return res.status(status).json({ success: false, error: error.message, code: error.code })
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
