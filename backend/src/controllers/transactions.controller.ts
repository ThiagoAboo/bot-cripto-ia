import { Response } from 'express'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { getExchangeRate as getExternalExchangeRate } from '../services/awesomeapi.service'
import { ExternalApiError } from '../services/external-http.service'
import {
  cancelSpotOrder,
  getAccountBalances,
  getCandles as getBinanceCandles,
  getSpotOrder,
  getSpotOrderTrades,
  getTickerPrice,
  mapBinanceOrderStatusToLocalStatus,
  type BinanceTradeFill,
} from '../services/binance.service'
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
const OPEN_ORDER_STATUSES = ['pending', 'partially_filled'] as const

type LocalOrderLifecycleStatus = 'pending' | 'partially_filled' | 'executed' | 'cancelled' | 'rejected'

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

export interface ExecuteOrderInput {
  userId: string
  pair: string
  type: 'buy' | 'sell'
  quantity: number
  requestedQuantity?: number
  orderType: 'market' | 'limit'
  price?: number
  origin?: 'manual' | 'bot'
  botId?: string | null
  totalOverride?: number
  feeOverride?: number
  feeCurrencyOverride?: string
  feeRateAppliedOverride?: number
  feeDiscountSourceOverride?: 'bnb' | 'usdt' | 'standard'
  feeInQuoteOverride?: number
  statusOverride?: LocalOrderLifecycleStatus
  externalOrderId?: string | null
  externalClientOrderId?: string | null
  externalStatus?: string | null
  syncedAt?: Date
}

export interface ExecutedOrderPayload {
  id: string
  date: Date
  pair: string
  origin: string
  botId?: string | null
  type: string
  quantity: number
  requestedQuantity?: number
  price: number
  total: number
  fee: number
  feeCurrency: string
  feeRateApplied: number
  feeDiscountSource?: string
  status: string
  orderType?: string
  externalOrderId?: string
  externalClientOrderId?: string
  externalStatus?: string
  syncedAt?: Date
  profitBrl: number | null
  profitPercent: number | null
}

interface ExchangeOrderSnapshotInput {
  userId: string
  transactionId?: string
  pair: string
  type: 'buy' | 'sell'
  origin?: 'manual' | 'bot'
  botId?: string | null
  orderType: 'market' | 'limit'
  requestedQuantity: number
  executedQuantity: number
  price: number
  total: number
  fee: number
  feeInQuote?: number
  feeCurrency: string
  feeRateApplied: number
  feeDiscountSource?: 'bnb' | 'usdt' | 'standard'
  externalOrderId?: string | null
  externalClientOrderId?: string | null
  externalStatus?: string | null
  status: LocalOrderLifecycleStatus
  syncedAt?: Date
}

function isOrderBusinessError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message.startsWith('Saldo insuficiente')
    || error.message.includes('reserva mínima de BNB')
    || error.message.includes('compras suficientes no histórico')
    || error.message.includes('Histórico inconsistente')
  )
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

export async function getUserExchangeCredentials(userId: string): Promise<{ apiKey: string; secretKey: string } | null> {
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

export async function getAssetPriceInQuote(asset: string, quoteCurrency: string): Promise<number> {
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

export async function syncExternalBalances(userId: string, balances: Array<{ currency: string; available: number; reserved: number; total: number }>): Promise<void> {
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

function buildTransactionPayload(transaction: any): ExecutedOrderPayload {
  return {
    id: transaction.id,
    date: transaction.date,
    pair: transaction.pair,
    origin: transaction.origin,
    botId: transaction.botId ?? undefined,
    type: transaction.type,
    quantity: transaction.quantity,
    requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
    price: transaction.price,
    total: transaction.total,
    fee: transaction.fee,
    feeCurrency: transaction.feeCurrency,
    feeRateApplied: transaction.feeRateApplied,
    feeDiscountSource: transaction.feeDiscountSource ?? undefined,
    status: transaction.status,
    orderType: transaction.orderType,
    externalOrderId: transaction.externalOrderId ?? undefined,
    externalClientOrderId: transaction.externalClientOrderId ?? undefined,
    externalStatus: transaction.externalStatus ?? undefined,
    syncedAt: transaction.syncedAt ?? undefined,
    profitBrl: transaction.profitBrl,
    profitPercent: transaction.profitPercent,
  }
}

function normalizeLocalOrderStatus(status: string): LocalOrderLifecycleStatus {
  if (status === 'executed' || status === 'pending' || status === 'partially_filled' || status === 'cancelled' || status === 'rejected') {
    return status
  }

  return 'pending'
}

async function calculateTradeFeeSummary(
  trades: BinanceTradeFill[],
  quoteCurrency: string,
  fallbackTotal: number,
): Promise<{
  fee: number
  feeInQuote: number
  feeCurrency: string
  feeRateApplied: number
  feeDiscountSource?: 'bnb' | 'usdt' | 'standard'
}> {
  if (trades.length === 0) {
    return {
      fee: 0,
      feeInQuote: 0,
      feeCurrency: quoteCurrency,
      feeRateApplied: 0,
      feeDiscountSource: undefined,
    }
  }

  const commissionByAsset = new Map<string, number>()
  for (const trade of trades) {
    const asset = trade.commissionAsset?.trim().toUpperCase()
    const commission = Number(trade.commission)

    if (!asset || !Number.isFinite(commission) || commission <= 0) {
      continue
    }

    commissionByAsset.set(asset, (commissionByAsset.get(asset) ?? 0) + commission)
  }

  if (commissionByAsset.size === 0) {
    return {
      fee: 0,
      feeInQuote: 0,
      feeCurrency: quoteCurrency,
      feeRateApplied: 0,
      feeDiscountSource: undefined,
    }
  }

  if (commissionByAsset.size === 1) {
    const [feeCurrency, fee] = Array.from(commissionByAsset.entries())[0]
    const feeInQuote = feeCurrency === quoteCurrency
      ? fee
      : fee * await getAssetPriceInQuote(feeCurrency, quoteCurrency)

    return {
      fee,
      feeInQuote,
      feeCurrency,
      feeRateApplied: fallbackTotal > BALANCE_EPSILON ? (feeInQuote / fallbackTotal) : 0,
      feeDiscountSource: feeCurrency === 'BNB' ? 'bnb' : (feeCurrency === 'USDT' ? 'usdt' : 'standard'),
    }
  }

  let feeInQuote = 0
  for (const [asset, commission] of commissionByAsset.entries()) {
    feeInQuote += asset === quoteCurrency
      ? commission
      : commission * await getAssetPriceInQuote(asset, quoteCurrency)
  }

  return {
    fee: feeInQuote,
    feeInQuote,
    feeCurrency: quoteCurrency,
    feeRateApplied: fallbackTotal > BALANCE_EPSILON ? (feeInQuote / fallbackTotal) : 0,
    feeDiscountSource: commissionByAsset.has('BNB') ? 'bnb' : (quoteCurrency === 'USDT' ? 'usdt' : 'standard'),
  }
}

async function syncExchangeBalancesAndSnapshots(userId: string): Promise<void> {
  const credentials = await getUserExchangeCredentials(userId)
  if (!credentials) {
    return
  }

  const balances = await getAccountBalances(credentials.apiKey, credentials.secretKey, { forceRefresh: true })
  await syncExternalBalances(userId, balances)
  await recordBalanceHistorySnapshot(userId, balances.map((balance) => ({
    currency: balance.currency,
    available: balance.available,
  }))).catch((snapshotError) => {
    logger.warn('[transactions] Falha ao registrar snapshot após sincronização de ordem real', {
      module: 'transactions',
      event: 'exchange_order_snapshot_sync_failed',
      userId,
      error: snapshotError,
      skipPersistence: true,
    })
  })
}

export async function upsertExchangeOrderSnapshot(input: ExchangeOrderSnapshotInput): Promise<ExecutedOrderPayload> {
  const {
    userId,
    transactionId,
    pair,
    type,
    origin = 'bot',
    botId = null,
    orderType,
    requestedQuantity,
    executedQuantity,
    price,
    total,
    fee,
    feeInQuote,
    feeCurrency,
    feeRateApplied,
    feeDiscountSource,
    externalOrderId,
    externalClientOrderId,
    externalStatus,
    status,
    syncedAt = new Date(),
  } = input

  let profitBrl: number | null = null
  let profitPercent: number | null = null

  if (status === 'executed' && type === 'sell' && executedQuantity > BALANCE_EPSILON) {
    const sellProfit = await calculateSellProfitUsingFifo(
      userId,
      pair,
      executedQuantity,
      price,
      feeInQuote ?? (feeCurrency.toUpperCase() === getPairCurrencies(pair).quoteCurrency ? fee : 0),
    )
    profitBrl = sellProfit.profitBrl
    profitPercent = sellProfit.profitPercent
  }

  const payload = {
    pair,
    origin,
    botId,
    type,
    quantity: executedQuantity,
    requestedQuantity,
    orderType,
    price,
    total,
    fee,
    feeCurrency,
    feeRateApplied,
    feeDiscountSource: feeDiscountSource ?? null,
    status,
    externalOrderId: externalOrderId ?? null,
    externalClientOrderId: externalClientOrderId ?? null,
    externalStatus: externalStatus ?? null,
    syncedAt,
    profitBrl,
    profitPercent,
  }

  const transaction = transactionId
    ? await prisma.transaction.update({
        where: { id: transactionId },
        data: payload,
      })
    : await prisma.transaction.create({
        data: {
          userId,
          ...payload,
        },
      })

  const transactionPayload = buildTransactionPayload(transaction)

  if (transactionId) {
    emitOrderUpdated(userId, {
      ...transactionPayload,
      updatedAt: new Date().toISOString(),
    })
  } else {
    emitOrderCreated(userId, transactionPayload)
  }

  emitDashboardUpdate(userId, {
    scope: 'portfolio',
    reason: status === 'executed' ? 'exchange_order_executed' : 'exchange_order_updated',
    updatedAt: new Date().toISOString(),
    botId: botId ?? undefined,
  })

  return transactionPayload
}

export async function reconcileExchangeOrderForUser(params: {
  userId: string
  transactionId: string
}): Promise<ExecutedOrderPayload | null> {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: params.transactionId,
      userId: params.userId,
    },
  })

  if (!transaction || !transaction.externalOrderId) {
    return null
  }

  const credentials = await getUserExchangeCredentials(params.userId)
  if (!credentials) {
    return buildTransactionPayload(transaction)
  }

  const remoteOrder = await getSpotOrder(credentials.apiKey, credentials.secretKey, {
    pair: transaction.pair,
    orderId: transaction.externalOrderId,
  })
  const trades = await getSpotOrderTrades(credentials.apiKey, credentials.secretKey, {
    pair: transaction.pair,
    orderId: transaction.externalOrderId,
  }).catch(() => [] as BinanceTradeFill[])

  const executedQuantity = Number(remoteOrder.executedQty || transaction.quantity || 0)
  const cumulativeQuoteQty = Number(remoteOrder.cummulativeQuoteQty || transaction.total || 0)
  const effectivePrice = executedQuantity > BALANCE_EPSILON && cumulativeQuoteQty > BALANCE_EPSILON
    ? (cumulativeQuoteQty / executedQuantity)
    : transaction.price
  const { quoteCurrency } = getPairCurrencies(transaction.pair)
  const feeSummary = await calculateTradeFeeSummary(trades, quoteCurrency, cumulativeQuoteQty)
  const localStatus = mapBinanceOrderStatusToLocalStatus(remoteOrder.status, executedQuantity)

  const updated = await upsertExchangeOrderSnapshot({
    userId: params.userId,
    transactionId: transaction.id,
    pair: transaction.pair,
    type: transaction.type as 'buy' | 'sell',
    origin: transaction.origin as 'manual' | 'bot',
    botId: transaction.botId,
    orderType: (transaction.orderType as 'market' | 'limit') || 'market',
    requestedQuantity: transaction.requestedQuantity || transaction.quantity,
    executedQuantity,
    price: effectivePrice,
    total: cumulativeQuoteQty,
    fee: feeSummary.fee,
    feeInQuote: feeSummary.feeInQuote,
    feeCurrency: feeSummary.feeCurrency,
    feeRateApplied: feeSummary.feeRateApplied,
    feeDiscountSource: feeSummary.feeDiscountSource,
    externalOrderId: String(remoteOrder.orderId),
    externalClientOrderId: remoteOrder.clientOrderId,
    externalStatus: remoteOrder.status,
    status: localStatus,
    syncedAt: new Date(remoteOrder.updateTime || Date.now()),
  })

  await syncExchangeBalancesAndSnapshots(params.userId)

  return updated
}

export async function reconcileOpenExchangeOrdersForUser(params: {
  userId: string
  botId?: string
}): Promise<ExecutedOrderPayload[]> {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: params.userId,
      botId: params.botId,
      externalOrderId: { not: null },
      status: { in: [...OPEN_ORDER_STATUSES] },
    },
    orderBy: { date: 'asc' },
  })

  const results: ExecutedOrderPayload[] = []

  for (const transaction of transactions) {
    const updated = await reconcileExchangeOrderForUser({
      userId: params.userId,
      transactionId: transaction.id,
    }).catch((error) => {
      logger.warn('[transactions] Falha ao reconciliar ordem externa pendente', {
        module: 'transactions',
        event: 'reconcile_exchange_order_failed',
        userId: params.userId,
        transactionId: transaction.id,
        error,
        skipPersistence: true,
      })
      return null
    })

    if (updated) {
      results.push(updated)
    }
  }

  return results
}

export async function executeOrderForUser(input: ExecuteOrderInput): Promise<ExecutedOrderPayload> {
  const userId = input.userId
  const pair = input.pair
  const type = input.type
  const quantity = input.quantity
  const requestedQuantity = input.requestedQuantity ?? input.quantity
  const orderType = input.orderType
  const price = input.price
  const origin = input.origin ?? 'manual'
  const botId = input.botId ?? null
  const totalOverride = input.totalOverride
  const feeOverride = input.feeOverride
  const feeCurrencyOverride = input.feeCurrencyOverride?.trim().toUpperCase()
  const feeRateAppliedOverride = input.feeRateAppliedOverride
  const feeDiscountSourceOverride = input.feeDiscountSourceOverride
  const feeInQuoteOverride = input.feeInQuoteOverride
  const statusOverride = input.statusOverride
  const externalOrderId = input.externalOrderId ?? null
  const externalClientOrderId = input.externalClientOrderId ?? null
  const externalStatus = input.externalStatus ?? null
  const syncedAt = input.syncedAt

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
  const totalValue = typeof totalOverride === 'number' && Number.isFinite(totalOverride)
    ? totalOverride
    : quantity * estimatedPrice
  const feeSettings = await getUserFeeSettings(userId)
  const coreDeltas = buildCoreOrderDeltas(type, baseCurrency, quoteCurrency, quantity, totalValue)
  const currentBnbAvailable = balancesByCurrency.get('BNB')?.available ?? 0
  const projectedBnbAvailableBeforeFee = currentBnbAvailable + (coreDeltas.BNB ?? 0)
  const feePolicy = typeof feeOverride === 'number' && Number.isFinite(feeOverride)
    ? await (async (): Promise<OrderFeePolicy> => {
        const normalizedFeeCurrency = feeCurrencyOverride || quoteCurrency
        const normalizedFeeInQuote = typeof feeInQuoteOverride === 'number' && Number.isFinite(feeInQuoteOverride)
          ? feeInQuoteOverride
          : (normalizedFeeCurrency === quoteCurrency
            ? feeOverride
            : feeOverride * await getAssetPriceInQuote(normalizedFeeCurrency, quoteCurrency))

        return {
          fee: feeOverride,
          feeCurrency: normalizedFeeCurrency,
          feeRateApplied: typeof feeRateAppliedOverride === 'number' && Number.isFinite(feeRateAppliedOverride)
            ? feeRateAppliedOverride
            : (totalValue > BALANCE_EPSILON ? (normalizedFeeInQuote / totalValue) : ORDER_FEE_RATE),
          feeDiscountSource: feeDiscountSourceOverride
            ?? (normalizedFeeCurrency === 'BNB' ? 'bnb' : 'standard'),
          feeInQuote: normalizedFeeInQuote,
        }
      })()
    : await calculateOrderFeePolicy({
        totalValue,
        quoteCurrency,
        currentBnbAvailable,
        projectedBnbAvailableBeforeFee,
        feeSettings,
      })
  const deltas = { ...coreDeltas }
  addBalanceDelta(deltas, feePolicy.feeCurrency, -feePolicy.fee)

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

  let profitBrl: number | null = null
  let profitPercent: number | null = null

  if (type === 'sell') {
    const sellProfit = await calculateSellProfitUsingFifo(userId, pair, quantity, estimatedPrice, feePolicy.feeInQuote)
    profitBrl = sellProfit.profitBrl
    profitPercent = sellProfit.profitPercent
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      pair,
      origin,
      botId,
      type,
      quantity,
      requestedQuantity,
      orderType,
      price: estimatedPrice,
      total: totalValue,
      fee: feePolicy.fee,
      feeCurrency: feePolicy.feeCurrency,
      feeRateApplied: feePolicy.feeRateApplied,
      feeDiscountSource: feePolicy.feeDiscountSource,
      status: statusOverride ?? 'executed',
      externalOrderId,
      externalClientOrderId,
      externalStatus,
      syncedAt,
      profitBrl,
      profitPercent,
    },
  })

  const transactionPayload: ExecutedOrderPayload = {
    id: transaction.id,
    date: transaction.date,
    pair: transaction.pair,
    origin: transaction.origin,
    botId: transaction.botId ?? undefined,
    type: transaction.type,
    quantity: transaction.quantity,
    requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
    price: transaction.price,
    total: transaction.total,
    fee: transaction.fee,
    feeCurrency: transaction.feeCurrency,
    feeRateApplied: transaction.feeRateApplied,
    feeDiscountSource: transaction.feeDiscountSource ?? undefined,
    status: transaction.status,
    orderType: transaction.orderType,
    externalOrderId: transaction.externalOrderId ?? undefined,
    externalClientOrderId: transaction.externalClientOrderId ?? undefined,
    externalStatus: transaction.externalStatus ?? undefined,
    syncedAt: transaction.syncedAt ?? undefined,
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
    botId: botId ?? undefined,
  })

  await sendWebhook('order.executed', {
    pair,
    origin,
    botId,
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

  logger.info(`[transactions] Ordem ${origin === 'bot' ? 'automatizada' : 'manual'} criada com sucesso`, {
    module: 'transactions',
    event: origin === 'bot' ? 'bot_order_created' : 'manual_order_created',
    userId,
    transactionId: transaction.id,
    botId,
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

  return transactionPayload
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
      requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
      orderType: transaction.orderType,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      feeRateApplied: transaction.feeRateApplied,
      feeDiscountSource: transaction.feeDiscountSource ?? undefined,
      status: transaction.status,
      externalOrderId: transaction.externalOrderId ?? undefined,
      externalClientOrderId: transaction.externalClientOrderId ?? undefined,
      externalStatus: transaction.externalStatus ?? undefined,
      syncedAt: transaction.syncedAt ?? undefined,
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
      requestedQuantity: transaction.requestedQuantity ?? transaction.quantity,
      orderType: transaction.orderType,
      price: transaction.price,
      total: transaction.total,
      fee: transaction.fee,
      feeCurrency: transaction.feeCurrency,
      feeRateApplied: transaction.feeRateApplied,
      feeDiscountSource: transaction.feeDiscountSource ?? undefined,
      status: transaction.status,
      externalOrderId: transaction.externalOrderId ?? undefined,
      externalClientOrderId: transaction.externalClientOrderId ?? undefined,
      externalStatus: transaction.externalStatus ?? undefined,
      syncedAt: transaction.syncedAt ?? undefined,
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

    try {
      const transactionPayload = await executeOrderForUser({
        userId,
        pair,
        type,
        quantity,
        orderType,
        price,
        origin: 'manual',
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Ordem criada com sucesso', 0, {
        transactionId: transactionPayload.id,
        userId,
      })
      endTrace('createOrder', { userId })
      return res.json({
        success: true,
        data: transactionPayload,
      })
    } catch (balanceError) {
      if (!isOrderBusinessError(balanceError)) {
        throw balanceError
      }

      logger.warn('[transactions] Saldo insuficiente para ordem', {
        module: 'transactions',
        event: 'create_order_insufficient_balance',
        userId,
        pair,
        type,
        error: balanceError,
      })

      trace('DEBUG', 'transactions', 'createOrder', 'Saldo insuficiente', 0, {
        pair,
        type,
        error: balanceError instanceof Error ? balanceError.message : balanceError,
      })
      endTrace('createOrder', { userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: balanceError instanceof Error ? balanceError.message : 'Saldo insuficiente',
      })
    }
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

export async function reconcileOrder(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'reconcileOrder', 'transactions')

  try {
    const userId = req.userId!
    const { id } = req.params
    const updated = await reconcileExchangeOrderForUser({
      userId,
      transactionId: id,
    })

    if (!updated) {
      endTrace('reconcileOrder', { userId, orderId: id, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Ordem não encontrada' })
    }

    endTrace('reconcileOrder', { userId, orderId: id })
    return res.json({ success: true, data: updated })
  } catch (error) {
    logger.error('[transactions] Erro ao reconciliar ordem', {
      module: 'transactions',
      event: 'reconcile_order_error',
      userId: req.userId,
      orderId: req.params.id,
      error,
    })

    endTrace('reconcileOrder', { userId: req.userId, orderId: req.params.id, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function reconcileOrders(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'reconcileOrders', 'transactions')

  try {
    const userId = req.userId!
    const items = await reconcileOpenExchangeOrdersForUser({ userId })

    endTrace('reconcileOrders', { userId })
    return res.json({ success: true, data: items })
  } catch (error) {
    logger.error('[transactions] Erro ao reconciliar ordens em aberto', {
      module: 'transactions',
      event: 'reconcile_open_orders_error',
      userId: req.userId,
      error,
    })

    endTrace('reconcileOrders', { userId: req.userId, errorFlag: true })
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

    const normalizedOrderStatus = normalizeLocalOrderStatus(order.status)
    if (normalizedOrderStatus !== 'pending' && normalizedOrderStatus !== 'partially_filled') {
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

    if (order.externalOrderId) {
      const credentials = await getUserExchangeCredentials(userId)
      if (!credentials) {
        endTrace('cancelOrder', { userId, errorFlag: true })
        return res.status(400).json({ success: false, error: 'Credenciais da exchange são obrigatórias para cancelar a ordem real' })
      }

      await cancelSpotOrder(credentials.apiKey, credentials.secretKey, {
        pair: order.pair,
        orderId: order.externalOrderId,
      })

      const updated = await reconcileExchangeOrderForUser({
        userId,
        transactionId: id,
      })

      logger.info('[transactions] Ordem real cancelada com sucesso', {
        module: 'transactions',
        event: 'exchange_order_cancelled',
        userId,
        orderId: id,
        externalOrderId: order.externalOrderId,
      })

      endTrace('cancelOrder', { userId })
      return res.json({ success: true, data: updated })
    }

    await prisma.transaction.update({
      where: { id },
      data: {
        status: 'cancelled',
        syncedAt: new Date(),
      },
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
