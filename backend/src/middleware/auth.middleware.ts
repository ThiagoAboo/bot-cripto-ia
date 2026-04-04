import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'

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
) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Token não fornecido' })
    }

    const [scheme, token] = authHeader.split(' ')

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, error: 'Token inválido' })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload

    if (!decoded.userId) {
      return res.status(401).json({ success: false, error: 'Token inválido' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' })
    }

    req.userId = user.id
    req.user = user

    return next()
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' })
  }
}
