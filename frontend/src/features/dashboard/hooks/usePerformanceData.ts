import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '../services/dashboard.service'

export const PERFORMANCE_QUERY_KEYS = {
  performance: (period: string) => ['dashboard', 'performance', period],
}

export function usePerformanceData(initialPeriod: string = '7d') {
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: PERFORMANCE_QUERY_KEYS.performance(selectedPeriod),
    queryFn: () => dashboardService.getPerformanceData(selectedPeriod as any),
    refetchInterval: 10000,
    staleTime: 30000, // 30 segundos
    gcTime: 60000, // 1 minuto
  })

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period)
  }

  return {
    data,
    isLoading,
    error,
    selectedPeriod,
    onPeriodChange: handlePeriodChange,
    refetch,
  }
}
