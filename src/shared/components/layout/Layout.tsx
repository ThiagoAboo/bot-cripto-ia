import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Footer } from './Footer'
import { cn } from '../../utils/formatters'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen transition-all duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className={cn(
        'transition-all duration-300 min-h-screen flex flex-col',
        sidebarCollapsed ? 'ml-20' : 'ml-64'
      )}>
        <Header />
        <main className="flex-1 p-6 transition-all duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}