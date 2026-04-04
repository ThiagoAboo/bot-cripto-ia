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
      <div>
        <h1 className="app-page-title text-3xl font-bold">Dashboard</h1>
        <p className="app-page-subtitle mt-2 text-sm">Visão geral do portfólio e status das estratégias</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <TotalBalanceCard data={totalBalance} isLoading={isLoadingTotal} />

        <div className="xl:col-span-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {isLoadingCurrencies
              ? [0, 1, 2].map((index) => <CurrencyBalanceCard key={index} isLoading />)
              : currenciesBalance?.map((currency) => (
                  <CurrencyBalanceCard key={currency.currency} data={currency} isLoading={false} />
                ))}
          </div>
        </div>
      </div>

      <PerformanceChart
        data={performanceData}
        isLoading={isLoadingPerformance}
        selectedPeriod={selectedPeriod}
        onPeriodChange={onPeriodChange}
      />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-3">
        <div className="2xl:col-span-2">
          <RecentTransactionsTable data={recentTransactions} isLoading={isLoadingTransactions} />
        </div>

        <div className="2xl:col-span-1">
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
