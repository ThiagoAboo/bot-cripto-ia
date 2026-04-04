import { BrowserRouter, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppRoutes } from './routes'
import { Layout } from './shared/components/layout/Layout'

function SharedToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#ffffff',
          },
        },
      }}
    />
  )
}

function AppContent() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  if (isLoginPage) {
    return (
      <>
        <AppRoutes />
        <SharedToaster />
      </>
    )
  }

  return (
    <Layout>
      <AppRoutes />
      <SharedToaster />
    </Layout>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
