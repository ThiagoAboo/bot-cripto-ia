import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface WebSocketContextType {
  socket: Socket | null
  isConnected: boolean
  isEnabled: boolean
  connect: () => void
  disconnect: () => void
  emit: (event: string, data: any) => void
  on: (event: string, callback: (data: any) => void) => void
  off: (event: string, callback?: (data: any) => void) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const WS_ENABLED = true // Ativado para conectar ao backend real

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isEnabled] = useState(WS_ENABLED)
  const socketRef = useRef<Socket | null>(null)

  const connect = () => {
    if (!isEnabled) {
      console.log('WebSocket desabilitado')
      return
    }

    if (socketRef.current?.connected) return

    const token = localStorage.getItem('auth_token')
    
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
      auth: { token }
    })

    socket.on('connect', () => {
      console.log('WebSocket conectado')
      setIsConnected(true)
      
      // Inscrever para eventos padrão
      socket.emit('subscribe:dashboard')
      socket.emit('subscribe:orders')
      socket.emit('subscribe:logs')
      socket.emit('subscribe:traces')
    })

    socket.on('disconnect', () => {
      console.log('WebSocket desconectado')
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      console.warn('WebSocket connection error:', error.message)
      setIsConnected(false)
    })

    socketRef.current = socket
  }

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }

  const emit = (event: string, data: any) => {
    if (!isEnabled) return
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    }
  }

  const on = (event: string, callback: (data: any) => void) => {
    if (!isEnabled) return
    if (socketRef.current) {
      socketRef.current.on(event, callback)
    }
  }

  const off = (event: string, callback?: (data: any) => void) => {
    if (!isEnabled) return
    if (socketRef.current) {
      if (callback) {
        socketRef.current.off(event, callback)
      } else {
        socketRef.current.off(event)
      }
    }
  }

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [])

  return (
    <WebSocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        isEnabled,
        connect,
        disconnect,
        emit,
        on,
        off,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}