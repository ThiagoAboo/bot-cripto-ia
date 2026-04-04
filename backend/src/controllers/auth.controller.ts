import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import {
  endTrace,
  setCurrentTraceUserId,
  startTrace,
  trace,
} from '../utils/tracer'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
  }),
})

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter no mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  }),
})

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
    name: z.string().min(1, 'Nome é obrigatório'),
  }),
})

function getValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ')
}

function safeParsePreferences(preferences: string | null | undefined): Record<string, unknown> {
  if (!preferences) {
    return {}
  }

  try {
    return JSON.parse(preferences)
  } catch {
    return {}
  }
}

export async function login(req: Request, res: Response) {
  startTrace(null, 'login', 'auth')

  try {
    const validation = loginSchema.safeParse(req)

    if (!validation.success) {
      const errorMessage = getValidationMessage(validation.error)

      trace('WARN', 'auth', 'login', 'Validação falhou', 0, {
        errorFlag: true,
      })
      endTrace('login', { errorFlag: true })

      return res.status(400).json({ success: false, error: errorMessage })
    }

    const { email, password } = validation.data.body
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      trace('WARN', 'auth', 'login', 'Usuário não encontrado', 0, {
        errorFlag: true,
      })
      logger.warn('[auth] Tentativa de login com email inexistente', {
        module: 'auth',
        email,
      })
      endTrace('login', { errorFlag: true })

      return res.status(401).json({ success: false, error: 'Email ou senha inválidos' })
    }

    setCurrentTraceUserId(user.id)

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
      trace('WARN', 'auth', 'login', 'Senha inválida', 0, {
        userId: user.id,
        errorFlag: true,
      })
      logger.warn('[auth] Tentativa de login com senha inválida', {
        module: 'auth',
        userId: user.id,
        email,
      })
      endTrace('login', { userId: user.id, errorFlag: true })

      return res.status(401).json({ success: false, error: 'Email ou senha inválidos' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      },
    )

    logger.info('[auth] Usuário logado com sucesso', {
      module: 'auth',
      userId: user.id,
      email: user.email,
    })

    trace('INFO', 'auth', 'login', 'Login bem sucedido', 0, {
      userId: user.id,
    })
    endTrace('login', { userId: user.id })

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    logger.error('[auth] Erro no login', {
      module: 'auth',
      error,
    })
    trace('ERROR', 'auth', 'login', 'Erro interno durante login', 0, {
      errorFlag: true,
    })
    endTrace('login', { errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  startTrace(req.userId ?? null, 'getMe', 'auth')

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      trace('WARN', 'auth', 'getMe', 'Usuário não encontrado', 0, {
        userId: req.userId,
        errorFlag: true,
      })
      endTrace('getMe', { userId: req.userId, errorFlag: true })

      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    trace('DEBUG', 'auth', 'getMe', 'Dados do usuário recuperados', 0, {
      userId: req.userId,
    })
    endTrace('getMe', { userId: req.userId })

    return res.json({
      success: true,
      user: {
        ...user,
        preferences: safeParsePreferences(user.preferences),
      },
    })
  } catch (error) {
    logger.error('[auth] Erro ao buscar usuário', {
      module: 'auth',
      userId: req.userId,
      error,
    })
    trace('ERROR', 'auth', 'getMe', 'Erro ao buscar usuário', 0, {
      userId: req.userId,
      errorFlag: true,
    })
    endTrace('getMe', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function logout(req: AuthRequest, res: Response) {
  startTrace(req.userId ?? null, 'logout', 'auth')

  logger.info('[auth] Usuário fez logout', {
    module: 'auth',
    userId: req.userId,
  })

  trace('INFO', 'auth', 'logout', 'Logout realizado', 0, {
    userId: req.userId,
  })
  endTrace('logout', { userId: req.userId })

  return res.json({ success: true })
}

export async function changePassword(req: AuthRequest, res: Response) {
  startTrace(req.userId ?? null, 'changePassword', 'auth')

  try {
    const validation = changePasswordSchema.safeParse(req)

    if (!validation.success) {
      const errorMessage = getValidationMessage(validation.error)

      trace('WARN', 'auth', 'changePassword', 'Validação falhou', 0, {
        userId: req.userId,
        errorFlag: true,
      })
      endTrace('changePassword', { userId: req.userId, errorFlag: true })

      return res.status(400).json({ success: false, error: errorMessage })
    }

    const { currentPassword, newPassword } = validation.data.body

    const user = await prisma.user.findUnique({ where: { id: req.userId } })

    if (!user) {
      trace('WARN', 'auth', 'changePassword', 'Usuário não encontrado', 0, {
        userId: req.userId,
        errorFlag: true,
      })
      endTrace('changePassword', { userId: req.userId, errorFlag: true })

      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)

    if (!isValidPassword) {
      trace('WARN', 'auth', 'changePassword', 'Senha atual inválida', 0, {
        userId: req.userId,
        errorFlag: true,
      })
      endTrace('changePassword', { userId: req.userId, errorFlag: true })

      return res.status(401).json({ success: false, error: 'Senha atual incorreta' })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash: newPasswordHash },
    })

    logger.info('[auth] Senha alterada com sucesso', {
      module: 'auth',
      userId: req.userId,
    })

    trace('INFO', 'auth', 'changePassword', 'Senha alterada com sucesso', 0, {
      userId: req.userId,
    })
    endTrace('changePassword', { userId: req.userId })

    return res.json({ success: true, message: 'Senha alterada com sucesso' })
  } catch (error) {
    logger.error('[auth] Erro ao trocar senha', {
      module: 'auth',
      userId: req.userId,
      error,
    })
    trace('ERROR', 'auth', 'changePassword', 'Erro ao trocar senha', 0, {
      userId: req.userId,
      errorFlag: true,
    })
    endTrace('changePassword', { userId: req.userId, errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function register(req: Request, res: Response) {
  startTrace(null, 'register', 'auth')

  try {
    const validation = registerSchema.safeParse(req)

    if (!validation.success) {
      const errorMessage = getValidationMessage(validation.error)

      trace('WARN', 'auth', 'register', 'Validação falhou', 0, {
        errorFlag: true,
      })
      endTrace('register', { errorFlag: true })

      return res.status(400).json({ success: false, error: errorMessage })
    }

    const { email, password, name } = validation.data.body
    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      setCurrentTraceUserId(existingUser.id)
      trace('WARN', 'auth', 'register', 'Email já está em uso', 0, {
        userId: existingUser.id,
        errorFlag: true,
      })
      endTrace('register', { userId: existingUser.id, errorFlag: true })

      return res.status(409).json({ success: false, error: 'Email já está em uso' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        preferences: JSON.stringify({
          notificationsEnabled: true,
          theme: 'dark',
        }),
      },
    })

    setCurrentTraceUserId(user.id)

    logger.info('[auth] Novo usuário registrado', {
      module: 'auth',
      userId: user.id,
      email: user.email,
    })

    trace('INFO', 'auth', 'register', 'Usuário registrado com sucesso', 0, {
      userId: user.id,
    })
    endTrace('register', { userId: user.id })

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    logger.error('[auth] Erro no registro', {
      module: 'auth',
      error,
    })
    trace('ERROR', 'auth', 'register', 'Erro no registro', 0, {
      errorFlag: true,
    })
    endTrace('register', { errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
