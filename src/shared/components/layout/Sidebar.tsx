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
        'fixed left-0 top-0 h-full bg-dark-200 border-r border-dark-300 transition-all duration-300 z-40',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-dark-300',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary-500" />
            <span className="font-bold text-white">CryptoBot</span>
          </div>
        )}
        {collapsed && (
          <Bot className="w-6 h-6 text-primary-500" />
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-dark-300 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>

      {/* Menu */}
      <nav className="p-3">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all duration-200',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-dark-300 hover:text-white',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-dark-300">
          <div className="text-xs text-gray-500 text-center">
            <p>Versão 0.1.0</p>
            <p className="mt-1">IA Trading Bot</p>
          </div>
        </div>
      )}
    </aside>
  )
}