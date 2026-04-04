import { AsyncLocalStorage } from 'async_hooks'

export interface ObservabilityContext {
  traceId: string
  parentTraceId?: string | null
  startTime: number
  userId?: string | null
  module: string
  functionName: string
  previousContext?: ObservabilityContext | null
}

const storage = new AsyncLocalStorage<ObservabilityContext | null>()

export function getObservabilityContext(): ObservabilityContext | null {
  return storage.getStore() ?? null
}

export function setObservabilityContext(
  context: ObservabilityContext | null,
): void {
  storage.enterWith(context)
}

export function updateObservabilityContext(
  patch: Partial<ObservabilityContext>,
): ObservabilityContext | null {
  const current = getObservabilityContext()

  if (!current) {
    return null
  }

  const updated: ObservabilityContext = {
    ...current,
    ...patch,
  }

  storage.enterWith(updated)

  return updated
}
