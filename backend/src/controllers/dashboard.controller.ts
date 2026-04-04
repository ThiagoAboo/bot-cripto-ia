import { Response } from 'express'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { endTrace, startTrace } from '../utils/tracer'

export async function getTotalBalance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getTotalBalance', 'dashboard')

  try {
    const userId = req.userId!
    const balances = await prisma.balance.findMany({ where: { userId } })
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const recentTransactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed', date: { gte: oneDayAgo } },
    })

    const allTransactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
    })

    const last100Transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
      orderBy: { date: 'desc' },
      take: 100,
    })

    const totalBrl = balances.reduce((sum: number, balance: any) => {
      if (balance.currency === 'USDT') return sum + balance.available * 5.85
      if (balance.currency === 'BTC') return sum + balance.available * 350000
      if (balance.currency === 'ETH') return sum + balance.available * 18000
      if (balance.currency === 'SOL') return sum + balance.available * 80
      return sum
    }, 0)

    const dailyProfitBrl = recentTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
    const totalPnlBrl = allTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
    const winningTrades = last100Transactions.filter((transaction: any) => (transaction.profitBrl || 0) > 0).length
    const hitRate = last100Transactions.length > 0 ? (winningTrades / last100Transactions.length) * 100 : 0
    const previousTotalBrl = totalBrl - dailyProfitBrl
    const dailyProfitPercent = previousTotalBrl > 0 ? (dailyProfitBrl / previousTotalBrl) * 100 : 0
    const initialTotalBrl = totalBrl - totalPnlBrl
    const totalPnlPercent = initialTotalBrl > 0 ? (totalPnlBrl / initialTotalBrl) * 100 : 0

    endTrace('getTotalBalance', { userId })
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
        lastUpdate: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar saldo total', {
      module: 'dashboard',
      event: 'dashboard_total_balance_error',
      userId: req.userId,
      error,
    })

    endTrace('getTotalBalance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getCurrenciesBalance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getCurrenciesBalance', 'dashboard')

  try {
    const userId = req.userId!
    const balances = await prisma.balance.findMany({ where: { userId } })
    const currencies = ['BTC', 'ETH', 'SOL', 'USDT']
    const result = []

    for (const currency of currencies) {
      const balance = balances.find((entry: any) => entry.currency === currency)
      if (!balance || balance.available === 0) {
        continue
      }

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const dailyTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          date: { gte: oneDayAgo },
          pair: { contains: currency },
        },
      })

      const allTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          pair: { contains: currency },
        },
      })

      const last100Transactions = await prisma.transaction.findMany({
        where: {
          userId,
          status: 'executed',
          pair: { contains: currency },
        },
        orderBy: { date: 'desc' },
        take: 100,
      })

      const dailyProfitBrl = dailyTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
      const totalPnlBrl = allTransactions.reduce((sum: number, transaction: any) => sum + (transaction.profitBrl || 0), 0)
      const winningTrades = last100Transactions.filter((transaction: any) => (transaction.profitBrl || 0) > 0).length
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
        usdtBrlRate: 5.85,
      })
    }

    endTrace('getCurrenciesBalance', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar saldo por moeda', {
      module: 'dashboard',
      event: 'dashboard_currencies_balance_error',
      userId: req.userId,
      error,
    })

    endTrace('getCurrenciesBalance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getRecentTransactions(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getRecentTransactions', 'dashboard')

  try {
    const userId = req.userId!
    const limit = parseInt(req.query.limit as string, 10) || 5

    const transactions = await prisma.transaction.findMany({
      where: { userId, status: 'executed' },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        bot: {
          select: { name: true },
        },
      },
    })

    const result = transactions.map((transaction: any) => ({
      id: transaction.id,
      date: transaction.date,
      pair: transaction.pair,
      type: transaction.type,
      entryPrice: Number(transaction.price ?? 0),
      exitPrice: Number(transaction.price ?? 0),
      amount: transaction.quantity,
      fee: transaction.fee,
      profitBrl: transaction.profitBrl ?? 0,
      profitPercent: transaction.profitPercent ?? 0,
      botId: transaction.botId ?? undefined,
      botName: transaction.bot?.name ?? undefined,
    }))

    endTrace('getRecentTransactions', { userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar transações recentes', {
      module: 'dashboard',
      event: 'dashboard_recent_transactions_error',
      userId: req.userId,
      error,
    })

    endTrace('getRecentTransactions', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getBotsStatus(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getBotsStatus', 'dashboard')

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
      lastAnalysis: bot.lastAnalysis,
    }))

    endTrace('getBotsStatus', { userId: req.userId })
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar status dos bots', {
      module: 'dashboard',
      event: 'dashboard_bots_status_error',
      userId: req.userId,
      error,
    })

    endTrace('getBotsStatus', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function pauseBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'pauseBot', 'dashboard')

  try {
    const { id } = req.params

    await prisma.bot.update({
      where: { id },
      data: { isPaused: true, updatedAt: new Date() },
    })

    logger.info('[dashboard] Bot pausado', {
      module: 'dashboard',
      event: 'bot_paused',
      userId: req.userId,
      botId: id,
    })

    endTrace('pauseBot', { userId: req.userId, botId: id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[dashboard] Erro ao pausar bot', {
      module: 'dashboard',
      event: 'pause_bot_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('pauseBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function resumeBot(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'resumeBot', 'dashboard')

  try {
    const { id } = req.params

    await prisma.bot.update({
      where: { id },
      data: { isPaused: false, updatedAt: new Date() },
    })

    logger.info('[dashboard] Bot retomado', {
      module: 'dashboard',
      event: 'bot_resumed',
      userId: req.userId,
      botId: id,
    })

    endTrace('resumeBot', { userId: req.userId, botId: id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[dashboard] Erro ao retomar bot', {
      module: 'dashboard',
      event: 'resume_bot_error',
      userId: req.userId,
      botId: req.params.id,
      error,
    })

    endTrace('resumeBot', { userId: req.userId, botId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getPerformance(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getPerformance', 'dashboard')

  try {
    const userId = req.userId!
    const period = (req.query.period as string) || '7d'

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
      where: { userId, timestamp: { gte: startDate } },
      orderBy: { timestamp: 'asc' },
    })

    const data = history.map((entry: any) => ({
      timestamp: entry.timestamp,
      balance: entry.totalBrl,
    }))

    endTrace('getPerformance', { userId })
    return res.json({ success: true, data: { period, data } })
  } catch (error) {
    logger.error('[dashboard] Erro ao buscar dados de performance', {
      module: 'dashboard',
      event: 'dashboard_performance_error',
      userId: req.userId,
      error,
    })

    endTrace('getPerformance', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
