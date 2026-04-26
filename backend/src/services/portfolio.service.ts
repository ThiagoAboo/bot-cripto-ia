import { prisma } from '../config/database'
import { getCurrencyRateToBrl } from './market-valuation.service'

interface BalanceForSnapshot {
  currency: string
  available?: number
  total?: number
}

const SNAPSHOT_TOLERANCE_BRL = 0.01
const SNAPSHOT_MAX_STALENESS_MS = 60 * 60 * 1000

async function persistBalanceHistorySnapshot(
  userId: string,
  totalBrl: number,
): Promise<{ created: boolean; totalBrl: number }> {
  const lastSnapshot = await prisma.balanceHistory.findFirst({
    where: { userId },
    orderBy: { timestamp: 'desc' },
  })

  const now = new Date()
  const snapshotIsFreshEnough = lastSnapshot
    ? (now.getTime() - lastSnapshot.timestamp.getTime()) < SNAPSHOT_MAX_STALENESS_MS
    : false

  if (
    lastSnapshot
    && Math.abs(lastSnapshot.totalBrl - totalBrl) < SNAPSHOT_TOLERANCE_BRL
    && snapshotIsFreshEnough
  ) {
    return { created: false, totalBrl }
  }

  await prisma.balanceHistory.create({
    data: {
      userId,
      totalBrl,
      timestamp: now,
    },
  })

  return { created: true, totalBrl }
}

export async function calculatePortfolioTotalBrl(balances: BalanceForSnapshot[]): Promise<number> {
  if (balances.length === 0) {
    return 0
  }

  const uniqueCurrencies = Array.from(new Set(balances.map((balance) => balance.currency)))
  const rateEntries = await Promise.all(uniqueCurrencies.map(async (currency) => {
    const rate = await getCurrencyRateToBrl(currency)
    return [currency, rate] as const
  }))

  const rateMap = Object.fromEntries(rateEntries)

  return balances.reduce((sum, balance) => {
    const rate = rateMap[balance.currency] ?? 0
    const quantity = typeof balance.total === 'number'
      ? balance.total
      : (balance.available ?? 0)
    return sum + (quantity * rate)
  }, 0)
}

export async function recordBalanceHistorySnapshot(
  userId: string,
  balances?: BalanceForSnapshot[],
): Promise<{ created: boolean; totalBrl: number }> {
  const effectiveBalances = balances ?? await prisma.balance.findMany({
    where: { userId },
    select: {
      currency: true,
      available: true,
      total: true,
    },
  })

  let totalBrl: number

  try {
    totalBrl = await calculatePortfolioTotalBrl(effectiveBalances)
  } catch {
    const lastSnapshot = await prisma.balanceHistory.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    })

    if (lastSnapshot) {
      return {
        created: false,
        totalBrl: lastSnapshot.totalBrl,
      }
    }

    throw new Error('Nao foi possivel calcular o valor da carteira em BRL sem um snapshot anterior valido')
  }

  return persistBalanceHistorySnapshot(userId, totalBrl)
}

export async function recordBalanceHistorySnapshotValue(
  userId: string,
  totalBrl: number,
): Promise<{ created: boolean; totalBrl: number }> {
  return persistBalanceHistorySnapshot(userId, totalBrl)
}
