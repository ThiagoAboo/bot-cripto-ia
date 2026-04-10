import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { getExchangeRate as getExternalExchangeRate } from '../services/awesomeapi.service'
import { ExternalApiError } from '../services/external-http.service'
import { getAccountBalances, getCandles as getBinanceCandles, getTickerPrice } from '../services/binance.service'
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
    const currency = type === 'buy' ? 'USDT' : pair.split('/')[0]
    const balance = await prisma.balance.findUnique({
      where: {
        userId_currency: {
          userId,
          currency,
        },
      },
    })

    const marketPrice = !price ? await getTickerPrice(pair).catch(() => null) : null
    const estimatedPrice = price || marketPrice || 50000
    const totalValue = quantity * estimatedPrice
    const fee = totalValue * 0.001

    if (type === 'buy' && (!balance || balance.available < totalValue)) {
      logger.warn('[transactions] Saldo insuficiente para compra', {
        module: 'transactions',
        event: 'create_order_insufficient_balance_buy',
        userId,
        pair,
        required: totalValue,
        available: balance?.available,
        currency,
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, {
        currency,
        required: totalValue,
        available: balance?.available,
      })
      endTrace('createOrder', { userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Saldo insuficiente' })
    }

    if (type === 'sell' && (!balance || balance.available < quantity)) {
      logger.warn('[transactions] Saldo insuficiente para venda', {
        module: 'transactions',
        event: 'create_order_insufficient_balance_sell',
        userId,
        pair,
        required: quantity,
        available: balance?.available,
        currency,
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, {
        currency,
        required: quantity,
        available: balance?.available,
      })
      endTrace('createOrder', { userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Saldo insuficiente' })
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
        fee,
        status: 'executed',
        profitBrl: null,
        profitPercent: null,
      },
    })

    if (type === 'buy') {
      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'USDT' } },
        data: {
          available: { decrement: totalValue },
          total: { decrement: totalValue },
          updatedAt: new Date(),
        },
      })

      const targetCurrency = pair.split('/')[0]
      await prisma.balance.upsert({
        where: { userId_currency: { userId, currency: targetCurrency } },
        update: {
          available: { increment: quantity },
          total: { increment: quantity },
          updatedAt: new Date(),
        },
        create: {
          userId,
          currency: targetCurrency,
          available: quantity,
          reserved: 0,
          total: quantity,
        },
      })
    } else {
      const targetCurrency = pair.split('/')[0]
      await prisma.balance.update({
        where: { userId_currency: { userId, currency: targetCurrency } },
        data: {
          available: { decrement: quantity },
          total: { decrement: quantity },
          updatedAt: new Date(),
        },
      })

      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'USDT' } },
        data: {
          available: { increment: totalValue },
          total: { increment: totalValue },
          updatedAt: new Date(),
        },
      })
    }

    await sendWebhook('order.executed', {
      pair,
      type,
      quantity,
      price: estimatedPrice,
      total: totalValue,
      fee,
      status: 'executed',
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
        fee,
      },
    })

    trace('DEBUG', 'transactions', 'createOrder', 'Ordem criada com sucesso', 0, {
      transactionId: transaction.id,
      userId,
    })
    endTrace('createOrder', { userId })
    return res.json({
      success: true,
      data: {
        id: transaction.id,
        date: transaction.date,
        pair: transaction.pair,
        origin: transaction.origin,
        type: transaction.type,
        quantity: transaction.quantity,
        price: transaction.price,
        total: transaction.total,
        fee: transaction.fee,
        status: transaction.status,
      },
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
