import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Importando providers globais
import { QueryProvider } from './app/providers/QueryProvider'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { WebSocketProvider } from './app/providers/WebSocketProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <WebSocketProvider>
          <App />
        </WebSocketProvider>
      </ThemeProvider>
    </QueryProvider>
  </React.StrictMode>,
)