import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { startTrace, endTrace } from '../utils/tracer'

// ==============================
// GET TOTAL BALANCE
// ==============================
export async function getTotalBalance(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getTotalBalance', 'dashboard')
  
  try {
    const userId = req.userId!
    
    const balances = await prisma.balance.findMany({
      where: { userId }
    })
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        status: 'executed',
        date: { gte: oneDayAgo }
      }
    })
    
    const allTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        status: 'executed'
      }
    })
    
    const last100Transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
      orderBy: { date: 'desc' },
      take: 100
    })
    
    const totalBrl = balances.reduce((sum: number, b: any) => {
      if (b.currency === 'USDT') return sum + b.available * 5.85
      if (b.currency === 'BTC') return sum + b.available * 350000
      if (b.currency === 'ETH') return sum + b.available * 18000
      if (b.currency === 'SOL') return sum + b.available * 80
      return sum
    }, 0)
    
    const dailyProfitBrl = recentTransactions.reduce((sum: number, t: any) => sum + (t.profitBrl || 0), 0)
    const totalPnlBrl = allTransactions.reduce((sum: number, t: any) => sum + (t.profitBrl || 0), 0)
    const winningTrades = last100Transactions.filter((t: any) => (t.profitBrl || 0) > 0).length
    const hitRate = last100Transactions.length > 0 ? (winningTrades / last100Transactions.length) * 100 : 0
    
    const previousTotalBrl = totalBrl - dailyProfitBrl
    const dailyProfitPercent = previousTotalBrl > 0 ? (dailyProfitBrl / previousTotalBrl) * 100 : 0
    const initialTotalBrl = totalBrl - totalPnlBrl
    const totalPnlPercent = initialTotalBrl > 0 ? (totalPnlBrl / initialTotalBrl) * 100 : 0
    
    endTrace('getTotalBalance')
    
    return res.json({
      success: true,
      data: {
        totalBrl,
        dailyProfitBrl,
        dailyProfitPercent,
        totalPnlBrl,
        totalPnlPercent,
        hitRate,
        usdtBrlRate: 5.85,
        lastUpdate: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar saldo total:', error)
    endTrace('getTotalBalance')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET CURRENCIES BALANCE
// ==============================
export async function getCurrenciesBalance(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getCurrenciesBalance', 'dashboard')
  
  try {
    const userId = req.userId!
    
    const balances = await prisma.balance.findMany({
      where: { userId }
    })
    
    const currencies = ['BTC', 'ETH', 'SOL', 'USDT']
    const result = []
    
    for (const currency of currencies) {
      const balance = balances.find((b: any) => b.currency === currency)
      if (!balance || balance.available === 0) continue
      
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const dailyTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          date: { gte: oneDayAgo },
          pair: { contains: currency }
        }
      })
      
      const allTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          pair: { contains: currency }
        }
      })
      
      const last100Transactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          pair: { contains: currency }
        },
        orderBy: { date: 'desc' },
        take: 100
      })
      
      const dailyProfitBrl = dailyTransactions.reduce((sum: number, t: any) => sum + (t.profitBrl || 0), 0)
      const totalPnlBrl = allTransactions.reduce((sum: number, t: any) => sum + (t.profitBrl || 0), 0)
      const winningTrades = last100Transactions.filter((t: any) => (t.profitBrl || 0) > 0).length
      const hitRate = last100Transactions.length > 0 ? (winningTrades / last100Transactions.length) * 100 : 0
      
      let balanceBrl = 0
      if (currency === 'USDT') balanceBrl = balance.available * 5.85
      else if (currency === 'BTC') balanceBrl = balance.available * 350000
      else if (currency === 'ETH') balanceBrl = balance.available * 18000
      else if (currency === 'SOL') balanceBrl = balance.available * 80
      
      const previousBalanceBrl = balanceBrl - dailyProfitBrl
      const dailyProfitPercent = previousBalanceBrl > 0 ? (dailyProfitBrl / previousBalanceBrl) * 100 : 0
      const initialBalanceBrl = balanceBrl - totalPnlBrl
      const totalPnlPercent = initialBalanceBrl > 0 ? (totalPnlBrl / initialBalanceBrl) * 100 : 0
      
      result.push({
        currency,
        balanceBrl,
        dailyProfitBrl,
        dailyProfitPercent,
        totalPnlBrl,
        totalPnlPercent,
        hitRate,
        usdtBrlRate: 5.85
      })
    }
    
    endTrace('getCurrenciesBalance')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar saldo por moeda:', error)
    endTrace('getCurrenciesBalance')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET RECENT TRANSACTIONS
// ==============================
export async function getRecentTransactions(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getRecentTransactions', 'dashboard')
  
  try {
    const userId = req.userId!
    const limit = parseInt(req.query.limit as string) || 5
    
    const transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
      orderBy: { date: 'desc' },
      take: limit
    })
    
    const result = transactions.map((t: any) => ({
      id: t.id,
      date: t.date,
      pair: t.pair,
      type: t.type,
      entryPrice: t.type === 'buy' ? t.price : null,
      exitPrice: t.type === 'sell' ? t.price : null,
      amount: t.quantity,
      fee: t.fee,
      profitBrl: t.profitBrl,
      profitPercent: t.profitPercent
    }))
    
    endTrace('getRecentTransactions')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar transações recentes:', error)
    endTrace('getRecentTransactions')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET BOTS STATUS
// ==============================
export async function getBotsStatus(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getBotsStatus', 'dashboard')
  
  try {
    const bots = await prisma.bot.findMany()
    
    const result = bots.map((bot: any) => ({
      id: bot.id,
      name: bot.name,
      strategy: bot.strategyType,
      description: bot.description,
      currentPair: bot.currentPair,
      status: bot.status,
      isPaused: bot.isPaused,
      recommendedAction: bot.recommendedAction,
      confidence: bot.confidence,
      lastAnalysis: bot.lastAnalysis
    }))
    
    endTrace('getBotsStatus')
    
    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Erro ao buscar status dos bots:', error)
    endTrace('getBotsStatus')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// PAUSE BOT
// ==============================
export async function pauseBot(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'pauseBot', 'dashboard')
  
  try {
    const { id } = req.params
    
    await prisma.bot.update({
      where: { id },
      data: { isPaused: true, updatedAt: new Date() }
    })
    
    logger.info(`Bot pausado: ${id}`)
    endTrace('pauseBot')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao pausar bot:', error)
    endTrace('pauseBot')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// RESUME BOT
// ==============================
export async function resumeBot(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'resumeBot', 'dashboard')
  
  try {
    const { id } = req.params
    
    await prisma.bot.update({
      where: { id },
      data: { isPaused: false, updatedAt: new Date() }
    })
    
    logger.info(`Bot retomado: ${id}`)
    endTrace('resumeBot')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao retomar bot:', error)
    endTrace('resumeBot')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET PERFORMANCE
// ==============================
export async function getPerformance(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getPerformance', 'dashboard')
  
  try {
    const userId = req.userId!
    const period = req.query.period as string || '7d'
    
    let startDate: Date
    
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(0)
        break
    }
    
    const history = await prisma.balanceHistory.findMany({
      where: {
        userId,
        timestamp: { gte: startDate }
      },
      orderBy: { timestamp: 'asc' }
    })
    
    const data = history.map((h: any) => ({
      timestamp: h.timestamp,
      balance: h.totalBrl
    }))
    
    endTrace('getPerformance')
    
    return res.json({
      success: true,
      data: {
        period,
        data
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar dados de performance:', error)
    endTrace('getPerformance')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}