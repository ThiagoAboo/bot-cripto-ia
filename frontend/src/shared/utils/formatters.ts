import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility para combinar classes CSS
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatar moeda (BRL, USD, EUR, etc.)
export function formatCurrency(value: number, currency: string = 'BRL'): string {
  const symbols: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
    BTC: '₿',
    ETH: 'Ξ',
  }

  const symbol = symbols[currency] || currency

  if (currency === 'BTC' || currency === 'ETH') {
    return `${symbol} ${value.toFixed(8)}`
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency === 'USDT' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace('US$', 'USDT')
}

// Formatar percentual
export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Formatar data
export function formatDate(date: string | Date, format: 'full' | 'date' | 'time' = 'full'): string {
  const d = new Date(date)

  if (format === 'date') {
    return d.toLocaleDateString('pt-BR')
  }

  if (format === 'time') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return d.toLocaleString('pt-BR')
}

// Formatar número com separadores
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Abreviar números grandes (1k, 1M, 1B)
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value)
}

// Formatar para cor (positivo/negativo)
export function getProfitColor(value: number): string {
  if (value > 0) return 'text-success'
  if (value < 0) return 'text-error'
  return 'text-gray-400'
}

// Formatar para sinal (+/-)
export function formatProfitSign(value: number): string {
  if (value > 0) return '+'
  if (value < 0) return '-'
  return ''
}