import { logger } from '../utils/logger'
import { requestJson, sleep } from './external-http.service'

interface WebhookPayload {
  event: string
  timestamp: string
  environment: string
  data: unknown
}

export async function sendWebhook(event: string, data: unknown): Promise<void> {
  if (process.env.WEBHOOK_ENABLED !== 'true') {
    return
  }

  const url = process.env.WEBHOOK_URL
  if (!url) {
    return
  }

  const retries = Number(process.env.WEBHOOK_RETRY_ATTEMPTS ?? 3)
  const baseDelay = Number(process.env.WEBHOOK_RETRY_DELAY ?? 1000)

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    data,
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await requestJson<unknown>(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
        timeoutMs: 10000,
        retries: 0,
        module: 'webhook',
        requestName: event,
      })

      return
    } catch (error) {
      logger.warn('[webhook] Falha ao enviar webhook', {
        module: 'webhook',
        event: 'webhook_send_failed',
        webhookEvent: event,
        attempt: attempt + 1,
        retries,
        error,
        skipPersistence: true,
      })

      if (attempt === retries - 1) {
        throw error
      }

      await sleep(baseDelay * Math.pow(2, attempt))
    }
  }
}
