import { prisma } from '../config/database'
import { getBinanceUserStreamStatus } from './binance-user-stream.service'
import { isBotWorkerRunning } from './bot-runner.service'
import { getPairDiscoveryRunnerStatus } from './pair-discovery-runner.service'
import { DEFAULT_BOT_RUNTIME_SERVICE_NAME, getRuntimeHeartbeatStatus } from './runtime-heartbeat.service'
import { isTrainingWorkerRunning } from './training-worker.service'

type HealthComponentState = 'up' | 'down' | 'disabled'

interface HealthComponent {
  status: HealthComponentState
  details?: Record<string, unknown>
}

export interface OperationalHealthReport {
  status: 'ok' | 'degraded'
  timestamp: string
  uptimeSeconds: number
  checks: {
    database: HealthComponent
    botWorker: HealthComponent
    trainingWorker: HealthComponent
    pairDiscoveryRunner: HealthComponent
    binanceUserStream: HealthComponent
  }
}

function resolveWorkerExpectation(envFlagName: string): boolean {
  return process.env.NODE_ENV !== 'test' && process.env[envFlagName] !== 'false'
}

function isExternalBotRuntimeExpected(): boolean {
  return process.env.NODE_ENV !== 'test' && process.env.BOT_RUNTIME_EXPECT_EXTERNAL_SERVICE === 'true'
}

function buildWorkerComponent(
  expected: boolean,
  running: boolean,
  details?: Record<string, unknown>,
): HealthComponent {
  if (!expected) {
    return {
      status: 'disabled',
      details: {
        ...(details ?? {}),
        expected: false,
      },
    }
  }

  return {
    status: running ? 'up' : 'down',
    details: {
      ...(details ?? {}),
      expected: true,
    },
  }
}

async function getDatabaseHealthComponent(): Promise<HealthComponent> {
  const startedAt = Date.now()

  try {
    await prisma.$queryRawUnsafe('SELECT 1')

    return {
      status: 'up',
      details: {
        latencyMs: Date.now() - startedAt,
      },
    }
  } catch (error) {
    return {
      status: 'down',
      details: {
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'database_check_failed',
      },
    }
  }
}

export async function getOperationalHealthReport(): Promise<OperationalHealthReport> {
  const database = await getDatabaseHealthComponent()
  const pairDiscoveryRunner = getPairDiscoveryRunnerStatus()
  const binanceUserStream = getBinanceUserStreamStatus()
  const externalBotRuntimeExpected = isExternalBotRuntimeExpected()
  const externalBotRuntimeHeartbeat = externalBotRuntimeExpected
    ? await getRuntimeHeartbeatStatus(DEFAULT_BOT_RUNTIME_SERVICE_NAME)
    : null

  const checks: OperationalHealthReport['checks'] = {
    database,
    botWorker: buildWorkerComponent(
      externalBotRuntimeExpected || resolveWorkerExpectation('BOT_WORKER_AUTOSTART'),
      externalBotRuntimeExpected
        ? Boolean(externalBotRuntimeHeartbeat?.running)
        : isBotWorkerRunning(),
      externalBotRuntimeExpected
        ? {
            mode: 'external',
            serviceName: externalBotRuntimeHeartbeat?.serviceName ?? DEFAULT_BOT_RUNTIME_SERVICE_NAME,
            instanceId: externalBotRuntimeHeartbeat?.instanceId,
            lastHeartbeatAt: externalBotRuntimeHeartbeat?.lastHeartbeatAt,
            ttlMs: externalBotRuntimeHeartbeat?.ttlMs,
            metadata: externalBotRuntimeHeartbeat?.metadata,
          }
        : {
            mode: 'internal',
          },
    ),
    trainingWorker: buildWorkerComponent(
      resolveWorkerExpectation('TRAINING_WORKER_AUTOSTART'),
      isTrainingWorkerRunning(),
    ),
    pairDiscoveryRunner: buildWorkerComponent(
      resolveWorkerExpectation('PAIR_DISCOVERY_AUTOSYNC_AUTOSTART'),
      pairDiscoveryRunner.running,
      {
        lastCycleAt: pairDiscoveryRunner.lastCycleAt,
      },
    ),
    binanceUserStream: buildWorkerComponent(
      resolveWorkerExpectation('BINANCE_USER_STREAM_AUTOSTART'),
      binanceUserStream.running,
      {
        activeUsers: binanceUserStream.activeUsers,
      },
    ),
  }

  const hasBlockingFailure = Object.values(checks).some((component) => component.status === 'down')

  return {
    status: hasBlockingFailure ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  }
}
