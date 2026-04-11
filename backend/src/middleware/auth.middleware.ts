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

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
}

async function resolveUserById(userId: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })

  return user
}

export async function resolveAuthenticatedUserFromToken(token: string): Promise<AuthenticatedUser> {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload

  if (!decoded.userId) {
    throw new Error('Token inválido')
  }

  const user = await resolveUserById(decoded.userId)
  if (!user) {
    throw new Error('Usuário não encontrado')
  }

  return user
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

    let user: AuthenticatedUser
    try {
      user = await resolveAuthenticatedUserFromToken(token)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Falha ao resolver token'
      const isUserMissing = errorMessage === 'Usuário não encontrado'

      logger.warn('[auth] Falha ao resolver autenticação do token', {
        module: 'auth',
        event: isUserMissing ? 'auth_user_not_found' : 'auth_token_resolution_failed',
        method: req.method,
        path: req.originalUrl,
        error,
      })

      return res.status(401).json({
        success: false,
        error: isUserMissing ? 'Usuário não encontrado' : 'Token inválido ou expirado',
      })
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
