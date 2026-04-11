import { prisma } from '../config/database'
import { getCurrencyRateToBrl } from './market-valuation.service'

interface BalanceForSnapshot {
  currency: string
  available: number
}

const SNAPSHOT_TOLERANCE_BRL = 0.01

async function persistBalanceHistorySnapshot(
  userId: string,
  totalBrl: number,
): Promise<{ created: boolean; totalBrl: number }> {
  const lastSnapshot = await prisma.balanceHistory.findFirst({
    where: { userId },
    orderBy: { timestamp: 'desc' },
  })

  if (lastSnapshot && Math.abs(lastSnapshot.totalBrl - totalBrl) < SNAPSHOT_TOLERANCE_BRL) {
    return { created: false, totalBrl }
  }

  await prisma.balanceHistory.create({
    data: {
      userId,
      totalBrl,
      timestamp: new Date(),
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
    const rate = await getCurrencyRateToBrl(currency).catch(() => 0)
    return [currency, rate] as const
  }))

  const rateMap = Object.fromEntries(rateEntries)

  return balances.reduce((sum, balance) => {
    const rate = rateMap[balance.currency] ?? 0
    return sum + (balance.available * rate)
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
    },
  })

  const totalBrl = await calculatePortfolioTotalBrl(effectiveBalances)
  return persistBalanceHistorySnapshot(userId, totalBrl)
}

export async function recordBalanceHistorySnapshotValue(
  userId: string,
  totalBrl: number,
): Promise<{ created: boolean; totalBrl: number }> {
  return persistBalanceHistorySnapshot(userId, totalBrl)
}
