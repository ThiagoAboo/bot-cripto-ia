import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Skeleton } from '../../../shared/components/ui/Skeleton'
import { Wallet, Lock } from 'lucide-react'
import { formatCurrency } from '../../../shared/utils/formatters'
import type { AvailableBalance as BalanceType } from '../types/transactions.types'

interface AvailableBalanceProps {
  data?: BalanceType[]
  isLoading: boolean
  displayCurrency: string
  exchangeRate?: number
}

export function AvailableBalance({ data, isLoading, displayCurrency, exchangeRate }: AvailableBalanceProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saldo da Carteira</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saldo da Carteira</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-center">Nenhum saldo disponível</p>
        </CardContent>
      </Card>
    )
  }

  const convertValue = (value: number, currency: string): number => {
    if (currency === 'USDT' && exchangeRate) {
      return value * exchangeRate
    }
    return value
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary-500" />
          Saldo da Carteira
        </CardTitle>
        <p className="text-sm text-gray-500">
          Visão por moeda com valores disponíveis, reservados e total em carteira.
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {data.map((balance) => {
          const convertedAvailable = convertValue(balance.available, balance.currency)
          const reservedAmount = balance.reserved ?? 0
          const totalAmount = balance.total ?? (balance.available + reservedAmount)
          const convertedTotal = convertValue(totalAmount, balance.currency)
          
          return (
            <div
              key={balance.currency}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-300/50 border border-dark-400"
            >
              <div>
                <p className="font-medium text-white">{balance.currency}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span>Disponível: {balance.available.toFixed(balance.currency === 'BTC' ? 8 : 2)}</span>
                  {reservedAmount > 0 && (
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Reservado: {reservedAmount.toFixed(balance.currency === 'BTC' ? 8 : 2)}
                    </span>
                  )}
                  <span>Total: {totalAmount.toFixed(balance.currency === 'BTC' ? 8 : 2)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  Total: {formatCurrency(convertedTotal, displayCurrency)}
                </p>
                <p className="text-xs text-success">
                  Livre: {formatCurrency(convertedAvailable, displayCurrency)}
                </p>
                {reservedAmount > 0 && (
                  <p className="text-xs text-gray-500">
                    Reservado em ordens pendentes
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
