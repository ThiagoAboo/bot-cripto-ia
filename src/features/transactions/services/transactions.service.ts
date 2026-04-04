import type {
  Transaction,
  ManualOrderRequest,
  AvailableBalance,
  OrderFilters,
  CandleData,
  ExchangeRate,
} from '../types/transactions.types'

const MOCK_DELAY = 500

const mockTransactions: Transaction[] = [
  {
    id: '1',
    date: new Date().toISOString(),
    pair: 'BTC/USDT',
    origin: 'bot',
    botId: 'bot1',
    botName: 'Scalper V2',
    type: 'buy',
    quantity: 0.05,
    price: 62000,
    total: 3100,
    fee: 12.50,
    status: 'executed',
    profitBrl: 4387.50,
    profitPercent: 2.42,
  },
  {
    id: '2',
    date: new Date(Date.now() - 3600000).toISOString(),
    pair: 'ETH/USDT',
    origin: 'bot',
    botId: 'bot2',
    botName: 'Momentum Trader',
    type: 'sell',
    quantity: 1.2,
    price: 3150,
    total: 3780,
    fee: 8.20,
    status: 'executed',
    profitBrl: -351.00,
    profitPercent: -1.56,
  },
  {
    id: '3',
    date: new Date(Date.now() - 7200000).toISOString(),
    pair: 'SOL/USDT',
    origin: 'manual',
    type: 'buy',
    quantity: 10,
    price: 180,
    total: 1800,
    fee: 4.50,
    status: 'pending',
  },
]

const mockBalance: AvailableBalance[] = [
  { currency: 'USDT', available: 12500, reserved: 500, total: 13000 },
  { currency: 'BTC', available: 0.5, reserved: 0, total: 0.5 },
  { currency: 'ETH', available: 3.2, reserved: 0.2, total: 3.4 },
  { currency: 'SOL', available: 50, reserved: 10, total: 60 },
]

const generateMockCandles = (_pair: string, period: string): CandleData[] => {
  const count = period === '1d' ? 30 : period === '1w' ? 52 : 100
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    open: 50000 + Math.random() * 20000,
    high: 52000 + Math.random() * 20000,
    low: 48000 + Math.random() * 20000,
    close: 51000 + Math.random() * 20000,
    volume: 1000 + Math.random() * 5000,
  }))
}

export const transactionsService = {
  async getTransactions(filters: OrderFilters): Promise<{ items: Transaction[]; total: number }> {
    let filtered = [...mockTransactions]
    
    if (filters.pair) {
      filtered = filtered.filter(t => t.pair === filters.pair)
    }
    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter(t => filters.types!.includes(t.type))
    }
    if (filters.statuses && filters.statuses.length > 0) {
      filtered = filtered.filter(t => filters.statuses!.includes(t.status))
    }
    if (filters.origins && filters.origins.length > 0) {
      filtered = filtered.filter(t => filters.origins!.includes(t.origin))
    }
    if (filters.search) {
      filtered = filtered.filter(t => 
        t.pair.toLowerCase().includes(filters.search!.toLowerCase()) ||
        t.id.includes(filters.search!)
      )
    }
    
    const start = (filters.page - 1) * filters.limit
    const paginated = filtered.slice(start, start + filters.limit)
    
    return new Promise((resolve) => {
      setTimeout(() => resolve({ items: paginated, total: filtered.length }), MOCK_DELAY)
    })
  },

  async getTransaction(id: string): Promise<Transaction | null> {
    const transaction = mockTransactions.find(t => t.id === id)
    return new Promise((resolve) => {
      setTimeout(() => resolve(transaction || null), MOCK_DELAY)
    })
  },

  async createOrder(order: ManualOrderRequest): Promise<Transaction> {
    const newTransaction: Transaction = {
      id: `tx_${Date.now()}`,
      date: new Date().toISOString(),
      pair: order.pair,
      origin: 'manual',
      type: order.type,
      quantity: order.quantity,
      price: order.price || (order.type === 'buy' ? 50000 : 51000),
      total: order.quantity * (order.price || 50000),
      fee: order.quantity * (order.price || 50000) * 0.001,
      status: 'executed',
    }
    mockTransactions.unshift(newTransaction)
    return new Promise((resolve) => {
      setTimeout(() => resolve(newTransaction), MOCK_DELAY)
    })
  },

  async cancelOrder(orderId: string): Promise<void> {
    const order = mockTransactions.find(t => t.id === orderId)
    if (order && order.status === 'pending') {
      order.status = 'cancelled'
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(), MOCK_DELAY)
    })
  },

  async getBalance(): Promise<AvailableBalance[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve([...mockBalance]), MOCK_DELAY)
    })
  },

  async getCandles(pair: string, period: string, limit: number = 100): Promise<CandleData[]> {
    const candles = generateMockCandles(pair, period)
    return new Promise((resolve) => {
      setTimeout(() => resolve(candles.slice(-limit)), MOCK_DELAY)
    })
  },

  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    const rates: Record<string, number> = {
      'USDT-BRL': 5.85,
      'USDT-EUR': 0.92,
      'USDT-BTC': 0.000016,
      'USDT-ETH': 0.00027,
    }
    const key = `${from}-${to}`
    return new Promise((resolve) => {
      setTimeout(() => resolve({
        from,
        to,
        rate: rates[key] || 1,
        lastUpdate: new Date().toISOString(),
      }), MOCK_DELAY)
    })
  },

  async getAvailablePairs(): Promise<string[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve([
        'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
        'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
      ]), MOCK_DELAY)
    })
  },
}