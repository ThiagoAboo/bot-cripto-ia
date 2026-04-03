// Cache de taxas de câmbio
const rateCache = new Map<string, { rate: number; timestamp: number }>()
const CACHE_DURATION = 60000 // 1 minuto

// Converter valor entre moedas
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount

  const cacheKey = `${from}-${to}`
  const cached = rateCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return amount * cached.rate
  }

  try {
    const rate = await fetchExchangeRate(from, to)
    rateCache.set(cacheKey, { rate, timestamp: Date.now() })
    return amount * rate
  } catch (error) {
    console.error('Erro ao converter moeda:', error)
    return amount
  }
}

// Buscar taxa de câmbio da API
async function fetchExchangeRate(from: string, to: string): Promise<number> {
  const mockRates: Record<string, number> = {
    'USDT-BRL': 5.85,
    'USDT-EUR': 0.92,
    'USDT-BTC': 0.000016,
    'USDT-ETH': 0.00027,
    'BRL-USDT': 0.171,
    'EUR-USDT': 1.087,
    'BTC-USDT': 62500,
    'ETH-USDT': 3450,
  }

  const key = `${from}-${to}`
  const rate = mockRates[key]

  if (!rate) {
    console.warn(`Taxa não encontrada para ${key}, usando 1:1`)
    return 1
  }

  return rate
}

// Converter USDT para BRL
export async function usdtToBrl(amount: number): Promise<number> {
  return convertCurrency(amount, 'USDT', 'BRL')
}

// Converter BRL para USDT
export async function brlToUsdt(amount: number): Promise<number> {
  return convertCurrency(amount, 'BRL', 'USDT')
}

// Converter valor com base em cotação fornecida
export function convertWithRate(amount: number, rate: number): number {
  return amount * rate
}

// Formatar valor convertido para exibição
export function formatConvertedValue(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number
): string {
  const converted = amount * rate
  return `${amount} ${fromCurrency} = ${converted.toFixed(2)} ${toCurrency}`
}

// Obter símbolo da moeda
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    USDT: 'USDT',
    EUR: '€',
    BTC: '₿',
    ETH: 'Ξ',
  }
  return symbols[currency] || currency
}