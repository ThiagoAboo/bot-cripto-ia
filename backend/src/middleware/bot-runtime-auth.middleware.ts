import { NextFunction, Request, Response } from 'express'

import { logger } from '../utils/logger'

function resolveBotRuntimeSharedSecret(): string {
  return String(process.env.BOT_RUNTIME_SHARED_SECRET || '').trim()
}

function readProvidedSecret(req: Request): string {
  const headerSecret = req.header('x-bot-runtime-key')
  if (headerSecret) {
    return headerSecret.trim()
  }

  const authHeader = req.header('authorization')
  if (!authHeader) {
    return ''
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return ''
  }

  return token.trim()
}

export function botRuntimeAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  const configuredSecret = resolveBotRuntimeSharedSecret()
  if (!configuredSecret) {
    logger.error('[bot-runtime] Segredo compartilhado não configurado', {
      module: 'bot-runtime',
      event: 'bot_runtime_missing_shared_secret',
      method: req.method,
      path: req.originalUrl,
    })

    return res.status(503).json({
      success: false,
      error: 'Serviço de runtime dos bots indisponível',
    })
  }

  const providedSecret = readProvidedSecret(req)
  if (!providedSecret || providedSecret !== configuredSecret) {
    logger.warn('[bot-runtime] Acesso negado ao contrato interno do runtime', {
      module: 'bot-runtime',
      event: 'bot_runtime_forbidden',
      method: req.method,
      path: req.originalUrl,
    })

    return res.status(403).json({
      success: false,
      error: 'Acesso negado ao runtime interno dos bots',
    })
  }

  return next()
}
