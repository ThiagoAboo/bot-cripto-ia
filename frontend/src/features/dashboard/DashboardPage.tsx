import { lazy, Suspense, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from '../../app/providers/WebSocketProvider'
import { useTotalBalance, useCurrenciesBalance, useRecentTransactions, useBotsStatus, usePauseBot, useResumeBot, useBotAnalysis, useRunBotCycle } from './hooks/useDashboardData'
import { DASHBOARD_QUERY_KEYS } from './hooks/useDashboardData'
import { usePerformanceData } from './hooks/usePerformanceData'
import { TotalBalanceCard } from './components/TotalBalanceCard'
import { CurrencyBalanceCard } from './components/CurrencyBalanceCard'
import { RecentTransactionsTable } from './components/RecentTransactionsTable'
import { BotsStatusList } from './components/BotsStatusList'
import { BotInsightsCard } from './components/BotInsightsCard'
import { Skeleton } from '../../shared/components/ui/Skeleton'

const PerformanceChart = lazy(async () => {
  const module = await import('./components/PerformanceChart')
  return { default: module.PerformanceChart }
})

function PerformanceChartFallback() {
  return (
    <div className="rounded-3xl border p-6" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}>
      <div className="mb-6">
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-[320px] w-full" />
    </div>
  )
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const { isConnected, on, off } = useWebSocket()
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const { data: totalBalance, isLoading: isLoadingTotal } = useTotalBalance()
  const { data: currenciesBalance, isLoading: isLoadingCurrencies } = useCurrenciesBalance()
  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: botsStatus, isLoading: isLoadingBots } = useBotsStatus()
  const { data: botAnalysis, isLoading: isLoadingBotAnalysis } = useBotAnalysis(selectedBotId)
  const { data: performanceData, isLoading: isLoadingPerformance, selectedPeriod, onPeriodChange } = usePerformanceData('7d')
  const { mutate: pauseBot, isPending: isPausing } = usePauseBot()
  const { mutate: resumeBot, isPending: isResuming } = useResumeBot()
  const { mutate: runBotCycle, isPending: isRunningBotCycle } = useRunBotCycle()

  const isMutating = isPausing || isResuming

  useEffect(() => {
    if (!botsStatus || botsStatus.length === 0) {
      if (selectedBotId) {
        setSelectedBotId('')
      }
      return
    }

    if (!selectedBotId || !botsStatus.some((bot) => bot.id === selectedBotId)) {
      setSelectedBotId(botsStatus[0].id)
    }
  }, [botsStatus, selectedBotId])

  useEffect(() => {
    if (!isConnected) {
      return
    }

    const invalidatePortfolio = () => {
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.totalBalance })
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.currenciesBalance })
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.recentTransactions })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'performance'] })
    }

    const handleDashboardUpdate = (payload: { scope: 'portfolio' | 'bots' }) => {
      if (payload.scope === 'bots') {
        void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.botsStatus })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bot-analysis'] })
        return
      }

      invalidatePortfolio()
    }

    const handleOrderCreated = () => {
      invalidatePortfolio()
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bot-analysis'] })
    }

    const handleOrderUpdated = () => {
      invalidatePortfolio()
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'bot-analysis'] })
    }

    on('dashboard:update', handleDashboardUpdate)
    on('order:created', handleOrderCreated)
    on('order:updated', handleOrderUpdated)

    return () => {
      off('dashboard:update', handleDashboardUpdate)
      off('order:created', handleOrderCreated)
      off('order:updated', handleOrderUpdated)
    }
  }, [isConnected, off, on, queryClient])

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

      <Suspense fallback={<PerformanceChartFallback />}>
        <PerformanceChart
          data={performanceData}
          isLoading={isLoadingPerformance}
          selectedPeriod={selectedPeriod}
          onPeriodChange={onPeriodChange}
        />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-4">
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

        <div className="2xl:col-span-1">
          <BotInsightsCard
            bots={botsStatus}
            selectedBotId={selectedBotId}
            onSelectBot={setSelectedBotId}
            data={botAnalysis}
            isLoading={isLoadingBotAnalysis || isLoadingBots}
            onRunCycle={() => selectedBotId && runBotCycle(selectedBotId)}
            isRunningCycle={isRunningBotCycle}
          />
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
