import { apiClient } from '../services/api.client'

interface ExchangeRateResponse {
  from: string
  to: string
  rate: number
  pctChange?: number
  lastUpdate?: string
}

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
  const source = from.trim().toUpperCase()
  const target = to.trim().toUpperCase()
  const params = new URLSearchParams({
    from: source,
    to: target,
  })
  const response = await apiClient.getData<ExchangeRateResponse>(`/exchange/rate?${params.toString()}`)
  if (!Number.isFinite(response.rate) || response.rate <= 0) {
    throw new Error(`Cotação inválida retornada para ${source}/${target}`)
  }

  return response.rate
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
