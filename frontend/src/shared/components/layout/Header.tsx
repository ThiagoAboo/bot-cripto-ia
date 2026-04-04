import { useEffect, useRef, useState } from 'react'
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
      if (
        showUserMenu &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false)
      }

      if (
        showNotifications &&
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node) &&
        notificationsButtonRef.current &&
        !notificationsButtonRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifications, showUserMenu])

  const notifications = [
    { id: 1, message: 'Bot BTC finalizou treinamento', time: '5 min atrás', unread: true },
    { id: 2, message: 'Nova ordem executada: COMPRA ETH', time: '1 hora atrás', unread: true },
    { id: 3, message: 'Stop-loss ajustado para BTC', time: '3 horas atrás', unread: false },
  ]

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{
        backgroundColor: 'var(--surface-overlay)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex min-h-[88px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-600/15">
            <span className="text-sm font-bold text-primary-500">AI</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Bot Crypto IA
            </h1>
            <p className="truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
              Trading Automatizado
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-center">
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-2.5"
            style={{
              backgroundColor: 'var(--surface-2)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', isConnected ? 'bg-green-500' : 'bg-red-500')} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div className="h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>BTC/USDT</span>
              <span className="font-semibold text-green-500">+2.4%</span>
            </div>
            <div className="h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>USDT/BRL</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                R$ 5,85
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-2xl border p-3"
            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
          </button>

          <div className="relative">
            <button
              type="button"
              ref={notificationsButtonRef}
              onClick={() => setShowNotifications((value) => !value)}
              className="relative rounded-2xl border p-3"
              style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
            >
              <Bell className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
              {notifications.some((item) => item.unread) && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </button>

            {showNotifications && (
              <div
                ref={notificationsRef}
                className="absolute right-0 mt-2 w-80 rounded-2xl border shadow-2xl"
                style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
              >
                <div
                  className="flex items-center justify-between border-b px-4 py-3"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Notificações
                  </h3>
                  <button type="button" onClick={() => setShowNotifications(false)}>
                    <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className="border-b px-4 py-3 last:border-b-0"
                      style={{
                        borderColor: 'var(--border-color)',
                        backgroundColor: item.unread ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      }}
                    >
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {item.message}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {item.time}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false)
                      navigate('/logs')
                    }}
                    className="w-full rounded-xl px-3 py-2 text-sm font-medium text-primary-500 hover:bg-primary-500/10"
                  >
                    Ver todas
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              ref={userButtonRef}
              onClick={() => setShowUserMenu((value) => !value)}
              className="flex items-center gap-2 rounded-2xl border p-2.5 pr-3"
              style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
                TA
              </div>
              <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            </button>

            {showUserMenu && (
              <div
                ref={userMenuRef}
                className="absolute right-0 mt-2 w-56 rounded-2xl border shadow-2xl"
                style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-color)' }}
              >
                <div
                  className="border-b px-4 py-3"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Thiago Aboo
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    thiago@email.com
                  </p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      navigate('/perfil')
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <User className="h-4 w-4" />
                    Perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      localStorage.removeItem('auth_token')
                      navigate('/login')
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500"
                  >
                    <LogOut className="h-4 w-4" />
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
