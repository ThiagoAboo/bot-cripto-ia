import { useState, useEffect } from 'react'
import { useTransactions, useBalance, useExchangeRate } from './hooks/useTransactions'
import { CurrencySelector } from './components/CurrencySelector'
import { PairChart } from './components/PairChart'
import { AvailableBalance } from './components/AvailableBalance'
import { ManualOrderForm } from './components/ManualOrderForm'
import { TransactionFilters } from './components/TransactionFilters'
import { TransactionsTable } from './components/TransactionsTable'
import { Skeleton } from '../../shared/components/ui/Skeleton'
import type { OrderFilters } from './types/transactions.types'

export default function TransacoesPage() {
  const [displayCurrency, setDisplayCurrency] = useState('BRL')
  const [selectedPair, setSelectedPair] = useState('BTC/USDT')
  const [filters, setFilters] = useState<OrderFilters>({
    page: 1,
    limit: 20,
  })

  const { data: transactionsData, isLoading: isLoadingTransactions, refetch: refetchTransactions } = useTransactions(filters)
  const { data: balance, isLoading: isLoadingBalance } = useBalance()
  const { data: exchangeRate } = useExchangeRate('USDT', displayCurrency)

  useEffect(() => {
    setFilters(prev => ({ ...prev, pair: selectedPair, page: 1 }))
  }, [selectedPair])

  useEffect(() => {
    refetchTransactions()
  }, [filters, refetchTransactions])

  const handleExport = () => {
    console.log('Exportando transações...')
  }

  if (!balance) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transações</h1>
          <p className="text-gray-400 mt-1">Histórico e execução de ordens</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[450px]" />
            <Skeleton className="h-[400px]" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Transações</h1>
        <p className="text-gray-400 mt-1">Histórico e execução de ordens</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <CurrencySelector
            selectedCurrency={displayCurrency}
            onCurrencyChange={setDisplayCurrency}
          />

          <PairChart
            selectedPair={selectedPair}
            onPairChange={setSelectedPair}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />

          <div className="space-y-4">
            <TransactionFilters filters={filters} onFiltersChange={setFilters} />
            <TransactionsTable
              data={transactionsData}
              isLoading={isLoadingTransactions}
              filters={filters}
              onFiltersChange={setFilters}
              displayCurrency={displayCurrency}
              onExport={handleExport}
            />
          </div>
        </div>

        <div className="space-y-6">
          <AvailableBalance
            data={balance}
            isLoading={isLoadingBalance}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />

          <ManualOrderForm
            selectedPair={selectedPair}
            onPairChange={setSelectedPair}
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate?.rate}
          />
        </div>
      </div>
    </div>
  )
}