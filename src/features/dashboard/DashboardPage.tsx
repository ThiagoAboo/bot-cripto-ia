import { useTotalBalance, useCurrenciesBalance, useRecentTransactions, useBotsStatus, usePauseBot, useResumeBot } from './hooks/useDashboardData'
import { usePerformanceData } from './hooks/usePerformanceData'
import { TotalBalanceCard } from './components/TotalBalanceCard'
import { CurrencyBalanceCard } from './components/CurrencyBalanceCard'
import { PerformanceChart } from './components/PerformanceChart'
import { RecentTransactionsTable } from './components/RecentTransactionsTable'
import { BotsStatusList } from './components/BotsStatusList'

export function DashboardPage() {
  const { data: totalBalance, isLoading: isLoadingTotal } = useTotalBalance()
  const { data: currenciesBalance, isLoading: isLoadingCurrencies } = useCurrenciesBalance()
  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: botsStatus, isLoading: isLoadingBots } = useBotsStatus()
  
  const { data: performanceData, isLoading: isLoadingPerformance, selectedPeriod, onPeriodChange } = usePerformanceData('7d')
  
  const { mutate: pauseBot, isPending: isPausing } = usePauseBot()
  const { mutate: resumeBot, isPending: isResuming } = useResumeBot()
  
  const isMutating = isPausing || isResuming

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Visão geral do portfólio e status das estratégias</p>
      </div>

      {/* Linha 1: Saldo Total + Cards de Moedas */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Card Saldo Total */}
        <TotalBalanceCard data={totalBalance} isLoading={isLoadingTotal} />
        
        {/* Cards de Moedas - Grid 3 colunas */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {isLoadingCurrencies ? (
              <>
                <CurrencyBalanceCard isLoading={true} />
                <CurrencyBalanceCard isLoading={true} />
                <CurrencyBalanceCard isLoading={true} />
              </>
            ) : (
              currenciesBalance?.map((currency) => (
                <CurrencyBalanceCard key={currency.currency} data={currency} isLoading={false} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Linha 2: Gráfico de Performance */}
      <PerformanceChart
        data={performanceData}
        isLoading={isLoadingPerformance}
        selectedPeriod={selectedPeriod}
        onPeriodChange={onPeriodChange}
      />

      {/* Linha 3: Últimas Transações + Status das Estratégias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Últimas Transações */}
        <div className="lg:col-span-2">
          <RecentTransactionsTable data={recentTransactions} isLoading={isLoadingTransactions} />
        </div>
        
        {/* Status das Estratégias */}
        <div className="lg:col-span-1">
          <BotsStatusList
            data={botsStatus}
            isLoading={isLoadingBots}
            onPause={pauseBot}
            onResume={resumeBot}
            isMutating={isMutating}
          />
        </div>
      </div>
    </div>
  )
}

export default DashboardPage