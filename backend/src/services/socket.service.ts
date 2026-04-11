import type { Server } from 'socket.io'

type RealtimeScope = 'dashboard' | 'orders' | 'logs' | 'traces'

let socketServer: Server | null = null

const SYSTEM_LOGS_ROOM = 'system:logs'

export interface DashboardUpdatePayload {
  scope: 'portfolio' | 'bots'
  reason: string
  updatedAt: string
  botId?: string
}

export function setSocketServer(io: Server): void {
  socketServer = io
}

export function getSocketServer(): Server | null {
  return socketServer
}

export function getUserRoom(userId: string): string {
  return `user:${userId}`
}

export function getScopedRoom(userId: string, scope: RealtimeScope): string {
  return `${getUserRoom(userId)}:${scope}`
}

export function getTrainingRoom(userId: string, sessionId: string): string {
  return `${getUserRoom(userId)}:training:${sessionId}`
}

export function getSystemLogsRoom(): string {
  return SYSTEM_LOGS_ROOM
}

function emitToRoom(room: string, event: string, payload: unknown): void {
  socketServer?.to(room).emit(event, payload)
}

export function emitDashboardUpdate(userId: string, payload: DashboardUpdatePayload): void {
  emitToRoom(getScopedRoom(userId, 'dashboard'), 'dashboard:update', payload)
}

export function emitOrderCreated(userId: string, payload: unknown): void {
  emitToRoom(getScopedRoom(userId, 'orders'), 'order:created', payload)
}

export function emitOrderUpdated(userId: string, payload: unknown): void {
  emitToRoom(getScopedRoom(userId, 'orders'), 'order:updated', payload)
}

export function emitLogNew(userId: string, payload: unknown): void {
  emitToRoom(getScopedRoom(userId, 'logs'), 'log:new', payload)
}

export function emitSystemLogNew(payload: unknown): void {
  emitToRoom(getSystemLogsRoom(), 'log:new', payload)
}

export function emitTraceNew(userId: string, payload: unknown): void {
  emitToRoom(getScopedRoom(userId, 'traces'), 'trace:new', payload)
}

export function emitTrainingStatus(userId: string, sessionId: string, status: string): void {
  emitToRoom(getTrainingRoom(userId, sessionId), 'training:status', { sessionId, status })
}

export function emitTrainingMetric(userId: string, sessionId: string, metrics: unknown): void {
  emitToRoom(getTrainingRoom(userId, sessionId), 'training:metrics', { sessionId, metrics })
}

export function emitTrainingLog(userId: string, sessionId: string, log: unknown): void {
  emitToRoom(getTrainingRoom(userId, sessionId), 'training:log', { sessionId, log })
}
