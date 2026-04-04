import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { startTrace, endTrace, trace } from '../utils/tracer'
import { z } from 'zod'

// Schema para criação de ordem
const createOrderSchema = z.object({
  pair: z.string().min(1, 'Par é obrigatório'),
  type: z.enum(['buy', 'sell']),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  orderType: z.enum(['market', 'limit']),
  price: z.number().positive().optional()
}).refine(data => {
  if (data.orderType === 'limit' && !data.price) {
    return false
  }
  return true
}, { message: 'Preço é obrigatório para ordens limit', path: ['price'] })

// Schema para filtros
const orderFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  pair: z.string().optional(),
  types: z.string().optional(),
  statuses: z.string().optional(),
  origins: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional()
})

// ==============================
// GET ORDERS (listagem com filtros)
// ==============================
export async function getOrders(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getOrders', 'transactions')
  
  try {
    const validation = orderFiltersSchema.safeParse(req.query)
    if (!validation.success) {
      endTrace('getOrders')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }
    
    const { page, limit, pair, types, statuses, origins, startDate, endDate, search } = validation.data
    const userId = req.userId!
    const skip = (page - 1) * limit
    
    // Construir where clause
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
        { id: { contains: search } }
      ]
    }
    
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          bot: {
            select: { name: true }
          }
        }
      }),
      prisma.transaction.count({ where })
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
      profitPercent: transaction.profitPercent
    }))
    
    endTrace('getOrders')
    
    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar ordens:', error)
    endTrace('getOrders')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// CREATE ORDER (ordem manual)
// ==============================
export async function createOrder(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'createOrder', 'transactions')
  
  try {
    // Validações manuais antes do schema
    const { pair, type, quantity, orderType, price } = req.body
    
    if (!pair) {
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Par é obrigatório' })
    }
    
    if (!type || (type !== 'buy' && type !== 'sell')) {
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Tipo deve ser "buy" ou "sell"' })
    }
    
    if (!quantity || quantity <= 0) {
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Quantidade deve ser maior que zero' })
    }
    
    if (orderType === 'limit' && (!price || price <= 0)) {
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Preço é obrigatório para ordens limit' })
    }
    
    const validation = createOrderSchema.safeParse(req.body)
    if (!validation.success) {
      trace('DEBUG', 'transactions', 'createOrder', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('createOrder')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }
    
    const userId = req.userId!
    
    // Buscar saldo disponível
    const currency = type === 'buy' ? 'USDT' : pair.split('/')[0]
    const balance = await prisma.balance.findUnique({
      where: { userId_currency: { userId, currency } }
    })
    
    const estimatedPrice = price || 50000 // Mock: preço atual
    const totalValue = quantity * estimatedPrice
    const fee = totalValue * 0.001 // 0.1% de taxa
    
    // Validar saldo
    if (type === 'buy' && (!balance || balance.available < totalValue)) {
      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, { currency, required: totalValue, available: balance?.available })
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Saldo insuficiente' })
    }
    
    if (type === 'sell' && (!balance || balance.available < quantity)) {
      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, { currency, required: quantity, available: balance?.available })
      endTrace('createOrder')
      return res.status(400).json({ success: false, error: 'Saldo insuficiente' })
    }
    
    // Criar transação
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
        profitPercent: null
      }
    })
    
    // Atualizar saldos
    if (type === 'buy') {
      // Diminuir USDT
      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'USDT' } },
        data: { 
          available: { decrement: totalValue },
          total: { decrement: totalValue },
          updatedAt: new Date()
        }
      })
      
      // Aumentar moeda comprada
      const targetCurrency = pair.split('/')[0]
      await prisma.balance.upsert({
        where: { userId_currency: { userId, currency: targetCurrency } },
        update: { 
          available: { increment: quantity },
          total: { increment: quantity },
          updatedAt: new Date()
        },
        create: {
          userId,
          currency: targetCurrency,
          available: quantity,
          reserved: 0,
          total: quantity
        }
      })
    } else {
      // Diminuir moeda vendida
      const targetCurrency = pair.split('/')[0]
      await prisma.balance.update({
        where: { userId_currency: { userId, currency: targetCurrency } },
        data: { 
          available: { decrement: quantity },
          total: { decrement: quantity },
          updatedAt: new Date()
        }
      })
      
      // Aumentar USDT
      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'USDT' } },
        data: { 
          available: { increment: totalValue },
          total: { increment: totalValue },
          updatedAt: new Date()
        }
      })
    }
    
    logger.info(`Ordem manual criada: ${type} ${quantity} ${pair} por usuário ${userId}`)
    trace('DEBUG', 'transactions', 'createOrder', 'Ordem criada com sucesso', 0, { transactionId: transaction.id })
    endTrace('createOrder')
    
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
        status: transaction.status
      }
    })
  } catch (error) {
    logger.error('Erro ao criar ordem:', error)
    endTrace('createOrder')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// CANCEL ORDER
// ==============================
export async function cancelOrder(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'cancelOrder', 'transactions')
  
  try {
    const { id } = req.params
    const userId = req.userId!
    
    const order = await prisma.transaction.findFirst({
      where: { id, userId }
    })
    
    if (!order) {
      endTrace('cancelOrder')
      return res.status(404).json({ success: false, error: 'Ordem não encontrada' })
    }
    
    if (order.status !== 'pending') {
      endTrace('cancelOrder')
      return res.status(400).json({ success: false, error: 'Apenas ordens pendentes podem ser canceladas' })
    }
    
    await prisma.transaction.update({
      where: { id },
      data: { status: 'cancelled' }
    })
    
    logger.info(`Ordem cancelada: ${id}`)
    trace('DEBUG', 'transactions', 'cancelOrder', 'Ordem cancelada', 0, { orderId: id })
    endTrace('cancelOrder')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao cancelar ordem:', error)
    endTrace('cancelOrder')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET BALANCE
// ==============================
export async function getBalance(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getBalance', 'transactions')
  
  try {
    const userId = req.userId!
    
    const balances = await prisma.balance.findMany({
      where: { userId }
    })
    
    const result = balances.map((balance: any) => ({
      currency: balance.currency,
      available: balance.available,
      reserved: balance.reserved,
      total: balance.total
    }))
    
    endTrace('getBalance')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar saldo:', error)
    endTrace('getBalance')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET EXCHANGE RATE
// ==============================
export async function getExchangeRate(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getExchangeRate', 'transactions')
  
  try {
    const { from, to } = req.query
    
    // Mock de cotações
    const rates: Record<string, number> = {
      'USDT-BRL': 5.85,
      'USDT-EUR': 0.92,
      'USDT-BTC': 0.000016,
      'USDT-ETH': 0.00027,
      'BRL-USDT': 0.171,
      'EUR-USDT': 1.087
    }
    
    const key = `${from}-${to}`
    const rate = rates[key] || 1
    
    endTrace('getExchangeRate')
    
    return res.json({
      success: true,
      data: {
        from,
        to,
        rate,
        lastUpdate: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar cotação:', error)
    endTrace('getExchangeRate')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET CANDLES (gráfico)
// ==============================
export async function getCandles(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getCandles', 'transactions')
  
  try {
    const { pair, period, limit } = req.query
    const limitNum = parseInt(limit as string) || 100
    
    // Mock de dados de velas
    const candles = Array.from({ length: limitNum }, (_, i) => ({
      timestamp: new Date(Date.now() - (limitNum - i) * 3600000).toISOString(),
      open: 50000 + Math.random() * 10000,
      high: 52000 + Math.random() * 10000,
      low: 48000 + Math.random() * 10000,
      close: 51000 + Math.random() * 10000,
      volume: 1000 + Math.random() * 5000
    }))
    
    endTrace('getCandles')
    
    return res.json({
      success: true,
      data: candles
    })
  } catch (error) {
    logger.error('Erro ao buscar velas:', error)
    endTrace('getCandles')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}