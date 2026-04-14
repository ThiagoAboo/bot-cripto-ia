import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Skeleton } from './shared/components/ui/Skeleton'

// Lazy loading das páginas
const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const BotsPage = lazy(() => import('./features/bots/BotsPage'))
const ConfiguracoesPage = lazy(() => import('./features/configurations/ConfiguracoesPage'))
const TreinamentoPage = lazy(() => import('./features/training/TreinamentoPage'))
const TransacoesPage = lazy(() => import('./features/transactions/TransacoesPage'))
const LogsPage = lazy(() => import('./features/logs/LogsPage'))
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'))

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

// Componente para proteger rotas
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = localStorage.getItem('auth_token') !== null
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/bots" element={
          <ProtectedRoute>
            <BotsPage />
          </ProtectedRoute>
        } />
        <Route path="/configuracoes" element={
          <ProtectedRoute>
            <ConfiguracoesPage />
          </ProtectedRoute>
        } />
        <Route path="/treinamento" element={
          <ProtectedRoute>
            <TreinamentoPage />
          </ProtectedRoute>
        } />
        <Route path="/transacoes" element={
          <ProtectedRoute>
            <TransacoesPage />
          </ProtectedRoute>
        } />
        <Route path="/logs" element={
          <ProtectedRoute>
            <LogsPage />
          </ProtectedRoute>
        } />
        <Route path="/perfil" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
