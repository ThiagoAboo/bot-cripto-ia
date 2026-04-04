import type { 
    LogEntry, 
    TraceEntry, 
    TraceGroup, 
    LogFilters, 
    TraceFilters 
  } from '../types/logs.types'
  
  const MOCK_DELAY = 500
  
  // Mock de logs
  const mockLogs: LogEntry[] = [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      level: 'INFO',
      module: 'bot',
      message: 'Bot Scalper V2 iniciou análise de mercado',
      details: { strategy: 'scalper', pairs: ['BTC/USDT', 'ETH/USDT'] },
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: 'INFO',
      module: 'transactions',
      message: 'Ordem executada: COMPRA 0.05 BTC/USDT',
      details: { orderId: 'ord_123', price: 62000 },
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      level: 'WARN',
      module: 'api',
      message: 'Timeout na chamada da API da Binance, tentando novamente',
      details: { endpoint: '/api/v3/ticker/price', retry: 1 },
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      level: 'ERROR',
      module: 'bot',
      message: 'Falha ao obter preço para ETH/USDT',
      details: { error: 'Connection refused', botId: 'bot2' },
    },
  ]
  
  // Mock de traces
  const mockTraces: TraceEntry[] = [
    {
      id: 't1',
      timestamp: new Date().toISOString(),
      level: 'TRACE',
      module: 'bot',
      traceId: 'trace_001',
      functionName: 'BotScalper.executeAnalysis()',
      message: 'Iniciando análise de mercado',
      durationMs: 0,
      botId: 'bot1',
      botName: 'Scalper V2',
      currentPair: 'BTC/USDT',
    },
    {
      id: 't2',
      timestamp: new Date(Date.now() - 100).toISOString(),
      level: 'DEBUG',
      module: 'bot',
      traceId: 'trace_001',
      parentTraceId: 'trace_001',
      functionName: 'BotScalper.getCurrentPrice()',
      message: 'Chamando API para obter preço do BTC/USDT',
      durationMs: 50,
      botId: 'bot1',
      botName: 'Scalper V2',
      currentPair: 'BTC/USDT',
    },
    {
      id: 't3',
      timestamp: new Date(Date.now() - 50).toISOString(),
      level: 'DEBUG',
      module: 'bot',
      traceId: 'trace_001',
      parentTraceId: 'trace_001',
      functionName: 'BotScalper.calculateIndicators()',
      message: 'RSI: 65, MACD: positivo, Volume: alto',
      durationMs: 120,
      botId: 'bot1',
      botName: 'Scalper V2',
      currentPair: 'BTC/USDT',
      recommendedAction: 'buy',
      confidence: 78,
    },
    {
      id: 't4',
      timestamp: new Date().toISOString(),
      level: 'TRACE',
      module: 'bot',
      traceId: 'trace_001',
      functionName: 'BotScalper.executeAnalysis()',
      message: 'Análise concluída. Recomendação: COMPRA',
      durationMs: 250,
      botId: 'bot1',
      botName: 'Scalper V2',
      currentPair: 'BTC/USDT',
      recommendedAction: 'buy',
      confidence: 78,
    },
  ]
  
  export const logsService = {
    async getLogs(filters: LogFilters): Promise<{ items: LogEntry[]; total: number }> {
      let filtered = [...mockLogs]
      
      if (filters.levels && filters.levels.length > 0) {
        filtered = filtered.filter(l => filters.levels!.includes(l.level))
      }
      if (filters.modules && filters.modules.length > 0) {
        filtered = filtered.filter(l => filters.modules!.includes(l.module))
      }
      if (filters.search) {
        filtered = filtered.filter(l => 
          l.message.toLowerCase().includes(filters.search!.toLowerCase()) ||
          l.id.includes(filters.search!)
        )
      }
      
      const paginated = filtered.slice(filters.offset, filters.offset + filters.limit)
      
      return new Promise((resolve) => {
        setTimeout(() => resolve({ items: paginated, total: filtered.length }), MOCK_DELAY)
      })
    },
  
    async getTraces(filters: TraceFilters): Promise<{ items: TraceEntry[]; total: number }> {
      let filtered = [...mockTraces]
      
      if (filters.levels && filters.levels.length > 0) {
        filtered = filtered.filter(t => filters.levels!.includes(t.level))
      }
      if (filters.modules && filters.modules.length > 0) {
        filtered = filtered.filter(t => filters.modules!.includes(t.module))
      }
      if (filters.traceId) {
        filtered = filtered.filter(t => t.traceId === filters.traceId)
      }
      if (filters.botId) {
        filtered = filtered.filter(t => t.botId === filters.botId)
      }
      if (filters.functionName) {
        filtered = filtered.filter(t => 
          t.functionName.toLowerCase().includes(filters.functionName!.toLowerCase())
        )
      }
      if (filters.minDurationMs) {
        filtered = filtered.filter(t => t.durationMs >= filters.minDurationMs!)
      }
      if (filters.onlyErrors) {
        filtered = filtered.filter(t => t.errorFlag === true)
      }
      if (filters.search) {
        filtered = filtered.filter(t => 
          t.message.toLowerCase().includes(filters.search!.toLowerCase()) ||
          t.functionName.toLowerCase().includes(filters.search!.toLowerCase())
        )
      }
      
      const paginated = filtered.slice(filters.offset, filters.offset + filters.limit)
      
      return new Promise((resolve) => {
        setTimeout(() => resolve({ items: paginated, total: filtered.length }), MOCK_DELAY)
      })
    },
  
    async getTraceGroup(traceId: string): Promise<TraceGroup | null> {
      const entries = mockTraces.filter(t => t.traceId === traceId)
      if (entries.length === 0) return null
      
      const sorted = entries.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      return {
        traceId,
        entries: sorted,
        startTime: sorted[0].timestamp,
        endTime: sorted[sorted.length - 1].timestamp,
        totalDurationMs: sorted[sorted.length - 1].durationMs,
        hasError: sorted.some(e => e.errorFlag),
        botId: sorted[0].botId,
        botName: sorted[0].botName,
      }
    },
  
    async exportLogs(filters: LogFilters): Promise<Blob> {
      const data = await this.getLogs(filters)
      const csv = this.convertToCSV(data.items)
      return new Blob([csv], { type: 'text/csv' })
    },
  
    async exportTraces(filters: TraceFilters): Promise<Blob> {
      const data = await this.getTraces(filters)
      const csv = this.convertToCSV(data.items)
      return new Blob([csv], { type: 'text/csv' })
    },
  
    convertToCSV(items: any[]): string {
      if (items.length === 0) return ''
      const headers = Object.keys(items[0])
      const rows = items.map(item => headers.map(h => JSON.stringify(item[h])).join(','))
      return [headers.join(','), ...rows].join('\n')
    },
  
    async getAvailableBots(): Promise<{ id: string; name: string }[]> {
      return new Promise((resolve) => {
        setTimeout(() => resolve([
          { id: 'bot1', name: 'Scalper V2' },
          { id: 'bot2', name: 'Momentum Trader' },
          { id: 'bot3', name: 'Trend Follower' },
          { id: 'bot4', name: 'Arbitrage Hunter' },
          { id: 'bot5', name: 'Mean Reversion' },
        ]), MOCK_DELAY)
      })
    },
  }