import { prisma } from '../config/database'

const DEFAULT_HEARTBEAT_TTL_MS = 60_000
export const DEFAULT_BOT_RUNTIME_SERVICE_NAME = 'bots_runtime'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function resolveHeartbeatTtlMs(): number {
  const value = Number(process.env.BOT_RUNTIME_HEARTBEAT_TTL_MS || DEFAULT_HEARTBEAT_TTL_MS)
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_HEARTBEAT_TTL_MS
  }

  return Math.round(value)
}

export interface RuntimeHeartbeatStatus {
  running: boolean
  serviceName: string
  instanceId?: string
  lastHeartbeatAt?: string
  ttlMs: number
  metadata?: Record<string, unknown>
}

export async function touchRuntimeHeartbeat(params: {
  serviceName: string
  instanceId: string
  metadata?: Record<string, unknown>
}) {
  const heartbeatAt = new Date()
  const metadata = JSON.stringify(params.metadata ?? {})

  const entry = await prisma.runtimeHeartbeat.upsert({
    where: {
      serviceName_instanceId: {
        serviceName: params.serviceName,
        instanceId: params.instanceId,
      },
    },
    update: {
      metadata,
      heartbeatAt,
    },
    create: {
      serviceName: params.serviceName,
      instanceId: params.instanceId,
      metadata,
      heartbeatAt,
    },
  })

  return {
    serviceName: entry.serviceName,
    instanceId: entry.instanceId,
    heartbeatAt: entry.heartbeatAt.toISOString(),
  }
}

export async function getRuntimeHeartbeatStatus(
  serviceName: string,
  options?: { ttlMs?: number },
): Promise<RuntimeHeartbeatStatus> {
  const ttlMs = options?.ttlMs ?? resolveHeartbeatTtlMs()
  const entry = await prisma.runtimeHeartbeat.findFirst({
    where: { serviceName },
    orderBy: [
      { heartbeatAt: 'desc' },
      { updatedAt: 'desc' },
    ],
    select: {
      serviceName: true,
      instanceId: true,
      heartbeatAt: true,
      metadata: true,
    },
  })

  if (!entry) {
    return {
      running: false,
      serviceName,
      ttlMs,
    }
  }

  const now = Date.now()
  const heartbeatAt = entry.heartbeatAt.getTime()
  const running = (now - heartbeatAt) <= ttlMs

  return {
    running,
    serviceName,
    instanceId: entry.instanceId,
    lastHeartbeatAt: entry.heartbeatAt.toISOString(),
    ttlMs,
    metadata: safeJsonParse(entry.metadata, {}),
  }
}
