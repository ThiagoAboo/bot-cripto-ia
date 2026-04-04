import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    email: string
    name: string
  }
}

interface JwtPayload {
  userId: string
  email?: string
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      logger.warn('[auth] Requisição sem token', {
        module: 'auth',
        event: 'auth_missing_token',
        method: req.method,
        path: req.originalUrl,
      })

      return res.status(401).json({ success: false, error: 'Token não fornecido' })
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme !== 'Bearer' || !token) {
      logger.warn('[auth] Formato de token inválido', {
        module: 'auth',
        event: 'auth_invalid_token_format',
        method: req.method,
        path: req.originalUrl,
      })

      return res.status(401).json({ success: false, error: 'Token inválido' })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload

    if (!decoded.userId) {
      logger.warn('[auth] Token sem userId', {
        module: 'auth',
        event: 'auth_token_without_user',
        method: req.method,
        path: req.originalUrl,
      })

      return res.status(401).json({ success: false, error: 'Token inválido' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      logger.warn('[auth] Usuário do token não encontrado', {
        module: 'auth',
        event: 'auth_user_not_found',
        method: req.method,
        path: req.originalUrl,
        tokenUserId: decoded.userId,
      })

      return res.status(401).json({ success: false, error: 'Usuário não encontrado' })
    }

    req.userId = user.id
    req.user = user

    return next()
  } catch (error) {
    logger.warn('[auth] Token inválido ou expirado', {
      module: 'auth',
      event: 'auth_token_verification_failed',
      method: req.method,
      path: req.originalUrl,
      error,
    })

    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' })
  }
}
