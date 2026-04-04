import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { DollarSign } from 'lucide-react'
import { CURRENCIES } from '../types/transactions.types'
import { useExchangeRate } from '../hooks/useTransactions'
import { formatCurrency } from '../../../shared/utils/formatters'
import { Skeleton } from '../../../shared/components/ui/Skeleton'

interface CurrencySelectorProps {
  selectedCurrency: string
  onCurrencyChange: (currency: string) => void
}

export function CurrencySelector({ selectedCurrency, onCurrencyChange }: CurrencySelectorProps) {
  const { data: rate, isLoading } = useExchangeRate('USDT', selectedCurrency)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary-500" />
          Moeda de Exibição
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Select value={selectedCurrency} onValueChange={onCurrencyChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a moeda" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {isLoading ? (
          <Skeleton className="h-4 w-full" />
        ) : (
          <p className="text-sm text-gray-500">
            1 USDT = {formatCurrency(rate?.rate || 0, selectedCurrency)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}