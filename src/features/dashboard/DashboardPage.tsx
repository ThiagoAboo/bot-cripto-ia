import { useTotalBalance, useCurrenciesBalance, useRecentTransactions, useBotsStatus, usePauseBot, useResumeBot } from './hooks/useDashboardData'
import { usePerformanceData } from './hooks/usePerformanceData'
import { TotalBalanceCard } from './components/TotalBalanceCard'
import { CurrencyBalanceCard } from './components/CurrencyBalanceCard'
import { PerformanceChart } from './components/PerformanceChart'
import { RecentTransactionsTable } from './components/RecentTransactionsTable'
import { BotsStatusList } from './components/BotsStatusList'

export function DashboardPage() {
  // Dados do dashboard
  const { data: totalBalance, isLoading: isLoadingTotal } = useTotalBalance()
  const { data: currenciesBalance, isLoading: isLoadingCurrencies } = useCurrenciesBalance()
  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: botsStatus, isLoading: isLoadingBots } = useBotsStatus()
  
  // Performance chart
  const { data: performanceData, isLoading: isLoadingPerformance, selectedPeriod, onPeriodChange } = usePerformanceData('7d')
  
  // Mutations para controle dos bots
  const { mutate: pauseBot, isPending: isPausing } = usePauseBot()
  const { mutate: resumeBot, isPending: isResuming } = useResumeBot()
  
  const isMutating = isPausing || isResuming

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Visão geral do portfólio e status dos bots</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Sistema operacional</span>
        </div>
      </div>

      {/* Cards de Saldo */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <TotalBalanceCard data={totalBalance} isLoading={isLoadingTotal} />
        </div>
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingCurrencies ? (
              <>
                <CurrencyBalanceCard isLoading={true} />
                <CurrencyBalanceCard isLoading={true} />
                <CurrencyBalanceCard isLoading={true} />
              </>
            ) : (
              currenciesBalance?.map((currency) => (
                <CurrencyBalanceCard
                  key={currency.currency}
                  data={currency}
                  isLoading={false}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Gráfico de Performance */}
      <PerformanceChart
        data={performanceData}
        isLoading={isLoadingPerformance}
        selectedPeriod={selectedPeriod}
        onPeriodChange={onPeriodChange}
      />

      {/* Últimas Transações e Status dos Bots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentTransactionsTable
            data={recentTransactions}
            isLoading={isLoadingTransactions}
          />
        </div>
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