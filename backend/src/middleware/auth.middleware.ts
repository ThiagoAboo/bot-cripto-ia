import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'

export interface AuthRequest extends Request {
  userId?: string
  user?: any
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Token não fornecido' })
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token inválido' })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true }
    })

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' })
    }

    req.userId = user.id
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' })
  }
}