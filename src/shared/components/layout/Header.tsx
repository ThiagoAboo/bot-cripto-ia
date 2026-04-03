import { useState } from 'react'
import { Bell, Settings, User, LogOut, Moon, Sun, ChevronDown } from 'lucide-react'
import { useTheme } from '../../../app/providers/ThemeProvider'
import { useWebSocket } from '../../../app/providers/WebSocketProvider'
import { cn } from '../../utils/formatters'

export function Header() {
  const { theme, toggleTheme } = useTheme()
  const { isConnected } = useWebSocket()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const notifications = [
    { id: 1, message: 'Bot BTC finalizou treinamento', time: '5 min atrás', unread: true },
    { id: 2, message: 'Nova ordem executada: COMPRA ETH', time: '1 hora atrás', unread: true },
    { id: 3, message: 'Stop-loss ajustado para BTC', time: '3 horas atrás', unread: false },
  ]

  return (
    <header className="sticky top-0 z-30 bg-dark-200 border-b border-dark-300 shadow-lg">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo / Título */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Bot Crypto IA</h1>
            <p className="text-xs text-gray-400">Trading Automatizado</p>
          </div>
        </div>

        {/* Centro - Status do Bot */}
        <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-dark-300 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              isConnected ? 'bg-success' : 'bg-error'
            )} />
            <span className="text-sm text-gray-300">
              {isConnected ? 'WebSocket Conectado' : 'Desconectado'}
            </span>
          </div>
          <div className="w-px h-4 bg-dark-400" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">BTC/USDT</span>
            <span className="text-sm font-medium text-success">+2.4%</span>
          </div>
          <div className="w-px h-4 bg-dark-400" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">USDT/BRL</span>
            <span className="text-sm font-medium text-white">R$ 5,85</span>
          </div>
        </div>

        {/* Direita - Ações */}
        <div className="flex items-center gap-2">
          {/* Botão de tema */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-dark-300 transition-colors"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-gray-400" /> : <Moon className="w-5 h-5 text-gray-400" />}
          </button>

          {/* Notificações */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg hover:bg-dark-300 transition-colors relative"
            >
              <Bell className="w-5 h-5 text-gray-400" />
              {notifications.some(n => n.unread) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
              )}
            </button>

            {/* Dropdown de notificações */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-dark-200 border border-dark-300 rounded-lg shadow-xl z-50">
                <div className="p-3 border-b border-dark-300">
                  <h3 className="font-semibold text-white">Notificações</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map(notif => (
                    <div
                      key={notif.id}
                      className={cn(
                        'p-3 hover:bg-dark-300 cursor-pointer transition-colors',
                        notif.unread && 'bg-primary-500/10'
                      )}
                    >
                      <p className="text-sm text-gray-200">{notif.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-dark-300">
                  <button className="w-full text-center text-sm text-primary-400 hover:text-primary-300">
                    Ver todas
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Menu do usuário */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-300 transition-colors"
            >
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-dark-200 border border-dark-300 rounded-lg shadow-xl z-50">
                <div className="p-3 border-b border-dark-300">
                  <p className="text-sm font-medium text-white">Thiago Aboo</p>
                  <p className="text-xs text-gray-500">thiago@email.com</p>
                </div>
                <div className="py-1">
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-300 transition-colors flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Perfil
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-300 transition-colors flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Configurações
                  </button>
                  <hr className="my-1 border-dark-300" />
                  <button className="w-full text-left px-4 py-2 text-sm text-error hover:bg-dark-300 transition-colors flex items-center gap-2">
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}