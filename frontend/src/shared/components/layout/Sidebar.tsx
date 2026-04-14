import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings,
  Brain,
  ArrowLeftRight,
  FileText,
  ChevronLeft,
  ChevronRight,
  Bot,
  User,
} from 'lucide-react'
import { cn } from '../../utils/formatters'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/bots', icon: Bot, label: 'Bots IA' },
  { path: '/transacoes', icon: ArrowLeftRight, label: 'Transações' },
  { path: '/treinamento', icon: Brain, label: 'Treinamento IA' },
  { path: '/configuracoes', icon: Settings, label: 'Configurações' },
  { path: '/logs', icon: FileText, label: 'Logs' },
  { path: '/perfil', icon: User, label: 'Perfil' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-300 lg:flex',
        collapsed ? 'w-20' : 'w-72',
      )}
      style={{
        backgroundColor: 'var(--surface-1)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div
        className={cn(
          'flex min-h-[88px] items-center border-b px-5',
          collapsed ? 'justify-center' : 'justify-between',
        )}
        style={{ borderColor: 'var(--border-color)' }}
      >
        {collapsed ? (
          <Bot className="h-7 w-7 text-primary-500" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-600/15">
              <Bot className="h-6 w-6 text-primary-500" />
            </div>
            <div>
              <p className="text-[1.05rem] font-bold" style={{ color: 'var(--text-primary)' }}>
                CryptoBot
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Trading automatizado
              </p>
            </div>
          </div>
        )}

        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-xl p-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute top-8 right-2 rounded-xl p-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-0',
                isActive && 'bg-primary-600 text-white shadow-lg shadow-primary-600/20',
              )
            }
            style={({ isActive }) =>
              isActive
                ? undefined
                : {
                    color: 'var(--text-secondary)',
                  }
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="mt-auto border-t px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
          <div className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>Versão 0.1.0</p>
            <p className="mt-1">IA Trading Bot</p>
          </div>
        </div>
      )}
    </aside>
  )
}
