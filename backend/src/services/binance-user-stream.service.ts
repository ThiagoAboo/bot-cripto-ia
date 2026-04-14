import { prisma } from '../config/database'
import * as transactionsController from '../controllers/transactions.controller'
import {
  closeUserDataStream,
  createUserDataStream,
  getAccountBalances,
  keepaliveUserDataStream,
} from './binance.service'
import { emitDashboardUpdate } from './socket.service'
import { logger } from '../utils/logger'

type StreamSocket = {
  close: () => void
  onopen?: (() => void) | null
  onmessage?: ((event: { data?: unknown }) => void) | null
  onerror?: ((event?: unknown) => void) | null
  onclose?: ((event?: { code?: number; reason?: string }) => void) | null
}

interface StreamConnectionState {
  userId: string
  apiKey: string
  secretKey: string
  listenKey: string
  socket: StreamSocket
  keepaliveTimer: NodeJS.Timeout | null
  reconnectTimer: NodeJS.Timeout | null
  reconnectAttempts: number
  shouldReconnect: boolean
}

interface ExecutionReportPayload {
  e?: string
  i?: number | string
  c?: string
}

const USER_STREAM_KEEPALIVE_MS = Math.max(60000, Number(process.env.BINANCE_USER_STREAM_KEEPALIVE_MS || 25 * 60 * 1000))
const USER_STREAM_REGISTRY_POLL_MS = Math.max(5000, Number(process.env.BINANCE_USER_STREAM_REGISTRY_POLL_MS || 30000))
const USER_STREAM_RECONNECT_BASE_MS = Math.max(1000, Number(process.env.BINANCE_USER_STREAM_RECONNECT_BASE_MS || 5000))
const USER_STREAM_RECONNECT_MAX_MS = Math.max(USER_STREAM_RECONNECT_BASE_MS, Number(process.env.BINANCE_USER_STREAM_RECONNECT_MAX_MS || 60000))
const BINANCE_STREAM_BASE_URL = process.env.BINANCE_TESTNET === 'true'
  ? 'wss://stream.testnet.binance.vision/ws'
  : (process.env.BINANCE_STREAM_BASE_URL || 'wss://stream.binance.com:9443/ws')

let registryInterval: NodeJS.Timeout | null = null
let isRegistrySyncRunning = false
const streamConnections = new Map<string, StreamConnectionState>()

function getWebSocketConstructor(): (new (url: string) => StreamSocket) | null {
  const ctor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => StreamSocket }).WebSocket
  return typeof ctor === 'function' ? ctor : null
}

function parseStreamPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>
    } catch {
      return null
    }
  }

  if (data && typeof data === 'object' && 'toString' in data && typeof (data as { toString: () => string }).toString === 'function') {
    try {
      return JSON.parse((data as { toString: () => string }).toString()) as Record<string, unknown>
    } catch {
      return null
    }
  }

  return null
}

function clearConnectionTimers(connection: StreamConnectionState): void {
  if (connection.keepaliveTimer) {
    clearInterval(connection.keepaliveTimer)
    connection.keepaliveTimer = null
  }

  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer)
    connection.reconnectTimer = null
  }
}

async function refreshBalancesAfterAccountEvent(connection: StreamConnectionState): Promise<void> {
  const balances = await getAccountBalances(connection.apiKey, connection.secretKey, { forceRefresh: true })
  await transactionsController.syncExternalBalances(connection.userId, balances)
  emitDashboardUpdate(connection.userId, {
    scope: 'portfolio',
    reason: 'binance_user_stream_balance_update',
    updatedAt: new Date().toISOString(),
  })
}

async function reconcileExecutionReport(connection: StreamConnectionState, payload: ExecutionReportPayload): Promise<void> {
  const externalOrderId = payload.i !== undefined ? String(payload.i) : null
  const externalClientOrderId = typeof payload.c === 'string' ? payload.c : null

  const transaction = await prisma.transaction.findFirst({
    where: {
      userId: connection.userId,
      OR: [
        ...(externalOrderId ? [{ externalOrderId }] : []),
        ...(externalClientOrderId ? [{ externalClientOrderId }] : []),
      ],
    },
    select: {
      id: true,
    },
  })

  if (transaction) {
    await transactionsController.reconcileExchangeOrderForUser({
      userId: connection.userId,
      transactionId: transaction.id,
    })
    return
  }

  await transactionsController.reconcileOpenExchangeOrdersForUser({ userId: connection.userId })
}

export async function processBinanceUserStreamMessage(userId: string, payload: Record<string, unknown>): Promise<void> {
  const connection = streamConnections.get(userId)
  if (!connection) {
    return
  }

  const eventType = typeof payload.e === 'string' ? payload.e : null
  if (!eventType) {
    return
  }

  if (eventType === 'executionReport') {
    await reconcileExecutionReport(connection, payload as ExecutionReportPayload)
    return
  }

  if (eventType === 'outboundAccountPosition') {
    await refreshBalancesAfterAccountEvent(connection).catch((error) => {
      logger.warn('[binance-stream] Falha ao sincronizar saldos após outboundAccountPosition', {
        module: 'binance-stream',
        event: 'binance_user_stream_balance_sync_failed',
        userId,
        error,
        skipPersistence: true,
      })
    })
    return
  }

  if (eventType === 'listenKeyExpired') {
    scheduleReconnect(connection, 'listen_key_expired')
  }
}

function scheduleReconnect(connection: StreamConnectionState, reason: string): void {
  if (!connection.shouldReconnect || connection.reconnectTimer) {
    return
  }

  const nextAttempt = connection.reconnectAttempts + 1
  const delayMs = Math.min(USER_STREAM_RECONNECT_MAX_MS, USER_STREAM_RECONNECT_BASE_MS * (2 ** Math.min(nextAttempt - 1, 4)))

  connection.reconnectTimer = setTimeout(() => {
    connection.reconnectTimer = null
    void connectUserStream({
      userId: connection.userId,
      apiKey: connection.apiKey,
      secretKey: connection.secretKey,
      reconnectAttempts: nextAttempt,
    })
  }, delayMs)

  connection.reconnectTimer.unref?.()

  logger.warn('[binance-stream] Reagendando conexão do user stream', {
    module: 'binance-stream',
    event: 'binance_user_stream_reconnect_scheduled',
    userId: connection.userId,
    reason,
    reconnectAttempts: nextAttempt,
    delayMs,
  })
}

async function disconnectUserStream(userId: string, options: { closeRemoteStream?: boolean } = {}): Promise<void> {
  const connection = streamConnections.get(userId)
  if (!connection) {
    return
  }

  streamConnections.delete(userId)
  connection.shouldReconnect = false
  clearConnectionTimers(connection)

  try {
    connection.socket.onclose = null
    connection.socket.close()
  } catch {
    // noop
  }

  if (options.closeRemoteStream !== false) {
    await closeUserDataStream(connection.apiKey, connection.listenKey).catch(() => undefined)
  }
}

async function connectUserStream(params: {
  userId: string
  apiKey: string
  secretKey: string
  reconnectAttempts?: number
}): Promise<void> {
  const WebSocketCtor = getWebSocketConstructor()
  if (!WebSocketCtor) {
    logger.warn('[binance-stream] WebSocket não disponível neste runtime; mantendo fallback por polling', {
      module: 'binance-stream',
      event: 'binance_user_stream_websocket_unavailable',
      userId: params.userId,
    })
    return
  }

  await disconnectUserStream(params.userId)

  const listenKey = await createUserDataStream(params.apiKey)
  const socket = new WebSocketCtor(`${BINANCE_STREAM_BASE_URL}/${listenKey}`)

  const connection: StreamConnectionState = {
    userId: params.userId,
    apiKey: params.apiKey,
    secretKey: params.secretKey,
    listenKey,
    socket,
    keepaliveTimer: null,
    reconnectTimer: null,
    reconnectAttempts: params.reconnectAttempts ?? 0,
    shouldReconnect: true,
  }

  streamConnections.set(params.userId, connection)

  socket.onopen = () => {
    connection.reconnectAttempts = 0
    connection.keepaliveTimer = setInterval(() => {
      void keepaliveUserDataStream(connection.apiKey, connection.listenKey).catch((error) => {
        logger.warn('[binance-stream] Falha no keepalive do listenKey', {
          module: 'binance-stream',
          event: 'binance_user_stream_keepalive_failed',
          userId: connection.userId,
          error,
          skipPersistence: true,
        })
        scheduleReconnect(connection, 'keepalive_failed')
      })
    }, USER_STREAM_KEEPALIVE_MS)

    connection.keepaliveTimer.unref?.()

    logger.info('[binance-stream] User stream conectado', {
      module: 'binance-stream',
      event: 'binance_user_stream_connected',
      userId: connection.userId,
    })
  }

  socket.onmessage = (event) => {
    const payload = parseStreamPayload(event.data)
    if (!payload) {
      return
    }

    void processBinanceUserStreamMessage(connection.userId, payload).catch((error) => {
      logger.warn('[binance-stream] Falha ao processar mensagem do user stream', {
        module: 'binance-stream',
        event: 'binance_user_stream_message_failed',
        userId: connection.userId,
        error,
        skipPersistence: true,
      })
    })
  }

  socket.onerror = (event) => {
    logger.warn('[binance-stream] Erro no socket do user stream', {
      module: 'binance-stream',
      event: 'binance_user_stream_socket_error',
      userId: connection.userId,
      error: event,
      skipPersistence: true,
    })
  }

  socket.onclose = (event) => {
    clearConnectionTimers(connection)
    if (streamConnections.get(connection.userId) === connection) {
      streamConnections.delete(connection.userId)
    }

    logger.warn('[binance-stream] User stream desconectado', {
      module: 'binance-stream',
      event: 'binance_user_stream_disconnected',
      userId: connection.userId,
      code: event?.code,
      reason: event?.reason,
    })

    if (connection.shouldReconnect) {
      scheduleReconnect(connection, 'socket_closed')
    }
  }
}

export async function syncBinanceUserStreamRegistry(): Promise<void> {
  const usersWithFullAutoBots = await prisma.bot.findMany({
    where: {
      userId: { not: null },
      executionMode: 'full_auto',
      status: 'online',
      isPaused: false,
    },
    distinct: ['userId'],
    select: {
      userId: true,
    },
  })
  const usersWithOpenOrders = await prisma.transaction.findMany({
    where: {
      externalOrderId: { not: null },
      status: { in: ['pending', 'partially_filled'] },
    },
    distinct: ['userId'],
    select: {
      userId: true,
    },
  })

  const trackedUserIds = Array.from(new Set(
    [...usersWithFullAutoBots, ...usersWithOpenOrders]
      .map((entry) => entry.userId)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
  ))

  const configurations = trackedUserIds.length > 0
    ? await prisma.configuration.findMany({
        where: {
          userId: { in: trackedUserIds },
          apiKey: { not: '' },
          secretKey: { not: '' },
        },
        select: {
          userId: true,
          apiKey: true,
          secretKey: true,
        },
      })
    : []

  const eligibleUsers = new Map(configurations.map((entry) => [
    entry.userId,
    {
      apiKey: entry.apiKey,
      secretKey: entry.secretKey,
    },
  ]))

  for (const [userId, connection] of streamConnections.entries()) {
    const nextCredentials = eligibleUsers.get(userId)
    if (!nextCredentials) {
      await disconnectUserStream(userId)
      continue
    }

    if (connection.apiKey !== nextCredentials.apiKey || connection.secretKey !== nextCredentials.secretKey) {
      await connectUserStream({
        userId,
        apiKey: nextCredentials.apiKey,
        secretKey: nextCredentials.secretKey,
      })
    }
  }

  for (const [userId, credentials] of eligibleUsers.entries()) {
    if (streamConnections.has(userId)) {
      continue
    }

    await connectUserStream({
      userId,
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
    }).catch((error) => {
      logger.warn('[binance-stream] Falha ao iniciar user stream para usuário elegível', {
        module: 'binance-stream',
        event: 'binance_user_stream_connect_failed',
        userId,
        error,
        skipPersistence: true,
      })
    })
  }
}

async function runRegistrySyncSafely(): Promise<void> {
  if (isRegistrySyncRunning) {
    return
  }

  isRegistrySyncRunning = true

  try {
    await syncBinanceUserStreamRegistry()
  } finally {
    isRegistrySyncRunning = false
  }
}

export function startBinanceUserStreamService(): void {
  if (registryInterval) {
    return
  }

  registryInterval = setInterval(() => {
    void runRegistrySyncSafely()
  }, USER_STREAM_REGISTRY_POLL_MS)

  registryInterval.unref?.()

  logger.info('[binance-stream] Serviço de user stream iniciado', {
    module: 'binance-stream',
    event: 'binance_user_stream_service_started',
    registryPollMs: USER_STREAM_REGISTRY_POLL_MS,
  })

  void runRegistrySyncSafely()
}

export function stopBinanceUserStreamService(): void {
  if (registryInterval) {
    clearInterval(registryInterval)
    registryInterval = null
  }

  const disconnectPromises = Array.from(streamConnections.keys()).map((userId) => disconnectUserStream(userId))
  streamConnections.clear()
  void Promise.allSettled(disconnectPromises)
}

export function isBinanceUserStreamServiceRunning(): boolean {
  return Boolean(registryInterval)
}

export function getBinanceUserStreamStatus(): { running: boolean; activeUsers: number } {
  return {
    running: isBinanceUserStreamServiceRunning(),
    activeUsers: streamConnections.size,
  }
}
