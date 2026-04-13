import { logger } from '../utils/logger'
import {
  processTrainingQueueCycle,
  stopTrainingSessionProcessing,
} from './training-session.service'

const WORKER_POLL_MS = Math.max(100, Number(process.env.TRAINING_WORKER_POLL_MS || 250))

let workerInterval: NodeJS.Timeout | null = null
let isCycleRunning = false

async function runWorkerCycleSafely(): Promise<void> {
  if (isCycleRunning) {
    return
  }

  isCycleRunning = true

  try {
    await processTrainingQueueCycle()
  } catch (error) {
    logger.error('[training-worker] Erro ao executar ciclo do worker de treinamento', {
      module: 'training',
      event: 'training_worker_cycle_error',
      error,
    })
  } finally {
    isCycleRunning = false
  }
}

export function startTrainingWorker(): void {
  if (workerInterval) {
    return
  }

  workerInterval = setInterval(() => {
    void runWorkerCycleSafely()
  }, WORKER_POLL_MS)

  workerInterval.unref?.()

  logger.info('[training-worker] Worker de treinamento iniciado', {
    module: 'training',
    event: 'training_worker_started',
    pollIntervalMs: WORKER_POLL_MS,
  })

  void runWorkerCycleSafely()
}

export function stopTrainingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }

  stopTrainingSessionProcessing()
}

export function isTrainingWorkerRunning(): boolean {
  return Boolean(workerInterval)
}
