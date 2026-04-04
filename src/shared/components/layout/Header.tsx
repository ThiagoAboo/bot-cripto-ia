import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, User, LogOut, Moon, Sun, ChevronDown, X } from 'lucide-react'
import { useTheme } from '../../../app/providers/ThemeProvider'
import { useWebSocket } from '../../../app/providers/WebSocketProvider'
import { cn } from '../../utils/formatters'

export function Header() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { isConnected } = useWebSocket()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && 
          userMenuRef.current && 
          !userMenuRef.current.contains(event.target as Node) &&
          userButtonRef.current &&
          !userButtonRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
      
      if (showNotifications && 
          notificationsRef.current && 
          !notificationsRef.current.contains(event.target as Node) &&
          notificationsButtonRef.current &&
          !notificationsButtonRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu, showNotifications])

  const notifications = [
    { id: 1, message: 'Bot BTC finalizou treinamento', time: '5 min atrás', unread: true },
    { id: 2, message: 'Nova ordem executada: COMPRA ETH', time: '1 hora atrás', unread: true },
    { id: 3, message: 'Stop-loss ajustado para BTC', time: '3 horas atrás', unread: false },
  ]

  const handleViewAllNotifications = () => {
    setShowNotifications(false)
    navigate('/logs')
  }

  const handleProfileClick = () => {
    setShowUserMenu(false)
    navigate('/perfil')
  }

  const handleLogout = () => {
    setShowUserMenu(false)
    localStorage.removeItem('auth_token')
    navigate('/login')
  }

  return (
    <header className={`sticky top-0 z-30 border-b shadow-lg ${theme}`} style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Bot Crypto IA</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Trading Automatizado</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full animate-pulse', isConnected ? 'bg-green-500' : 'bg-red-500')} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>BTC/USDT</span>
            <span className="text-sm font-medium text-green-500">+2.4%</span>
          </div>
          <div className="w-px h-4" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>USDT/BRL</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>R$ 5,85</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
          </button>

          <div className="relative">
            <button
              ref={notificationsButtonRef}
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg relative"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Bell className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              {notifications.some(n => n.unread) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {showNotifications && (
              <div
                ref={notificationsRef}
                className="absolute right-0 mt-2 w-80 rounded-lg border shadow-xl z-50"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Notificações</h3>
                  <button onClick={() => setShowNotifications(false)} className="p-1">
                    <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map(notif => (
                    <div key={notif.id} className={cn('p-3 cursor-pointer', notif.unread && 'bg-blue-500/10')}>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{notif.message}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{notif.time}</p>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <button onClick={handleViewAllNotifications} className="w-full text-center text-sm text-blue-400 py-1">
                    Ver todas
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              ref={userButtonRef}
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>

            {showUserMenu && (
              <div
                ref={userMenuRef}
                className="absolute right-0 mt-2 w-48 rounded-lg border shadow-xl z-50"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <div className="p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Thiago Aboo</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>thiago@email.com</p>
                </div>
                <div className="py-1">
                  <button onClick={handleProfileClick} className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <User className="w-4 h-4" />
                    Perfil
                  </button>
                  <hr className="my-1" style={{ borderColor: 'var(--border-color)' }} />
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-500 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700">
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