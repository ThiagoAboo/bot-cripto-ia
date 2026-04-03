import { Routes, Route, Navigate } from 'react-router-dom'

// Lazy loading das páginas
import { lazy, Suspense } from 'react'
import { Skeleton } from './shared/components/ui/Skeleton'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const ConfiguracoesPage = lazy(() => import('./features/configurations/ConfiguracoesPage'))
const TreinamentoPage = lazy(() => import('./features/training/TreinamentoPage'))
const TransacoesPage = lazy(() => import('./features/transactions/TransacoesPage'))
const LogsPage = lazy(() => import('./features/logs/LogsPage'))

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/treinamento" element={<TreinamentoPage />} />
        <Route path="/transacoes" element={<TransacoesPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}