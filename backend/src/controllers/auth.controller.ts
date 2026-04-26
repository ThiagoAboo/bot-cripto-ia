import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { endTrace, setCurrentTraceUserId, startTrace, trace } from '../utils/tracer'
import { normalizeUserPreferences, serializeUserPreferences } from '../utils/user-preferences'

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

export async function login(req: Request, res: Response): Promise<Response> {
  startTrace(null, 'login', 'auth')

  try {
    const validation = loginSchema.safeParse(req)

    if (!validation.success) {
      logger.warn('[auth] Tentativa de login com payload inválido', {
        module: 'auth',
        event: 'login_validation_failed',
        errors: validation.error.errors,
      })

      trace('DEBUG', 'auth', 'login', 'Validação falhou', 0, {
        errors: validation.error.errors,
      })
      endTrace('login')
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const { email, password } = validation.data.body
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      logger.warn('[auth] Login com usuário inexistente', {
        module: 'auth',
        event: 'login_user_not_found',
        email,
      })

      trace('DEBUG', 'auth', 'login', 'Usuário não encontrado', 0, { email })
      endTrace('login')
      return res.status(401).json({ success: false, error: 'Email ou senha inválidos' })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      logger.warn('[auth] Login com senha inválida', {
        module: 'auth',
        event: 'login_invalid_password',
        userId: user.id,
        email,
      })

      setCurrentTraceUserId(user.id)
      trace('DEBUG', 'auth', 'login', 'Senha inválida', 0, {
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
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    )

    setCurrentTraceUserId(user.id)

    logger.info('[auth] Usuário logado com sucesso', {
      module: 'auth',
      event: 'user_login',
      userId: user.id,
      email: user.email,
      name: user.name,
    })

    trace('DEBUG', 'auth', 'login', 'Login bem sucedido', 0, {
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
      event: 'login_error',
      error,
    })

    trace('ERROR', 'auth', 'login', 'Erro interno durante login', 0, {
      errorFlag: true,
    })
    endTrace('login', { errorFlag: true })

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getMe', 'auth')

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
        preferences: normalizeUserPreferences(user.preferences),
      },
    })
  } catch (error) {
    logger.error('[auth] Erro ao buscar usuário atual', {
      module: 'auth',
      event: 'get_me_error',
      userId: req.userId,
      error,
    })

    endTrace('getMe', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'logout', 'auth')

  logger.info('[auth] Usuário fez logout', {
    module: 'auth',
    event: 'user_logout',
    userId: req.userId,
  })

  endTrace('logout', { userId: req.userId })
  return res.json({ success: true })
}

export async function changePassword(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'changePassword', 'auth')

  try {
    const validation = changePasswordSchema.safeParse(req)

    if (!validation.success) {
      logger.warn('[auth] Alteração de senha com payload inválido', {
        module: 'auth',
        event: 'change_password_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'auth', 'changePassword', 'Validação falhou', 0, {
        errors: validation.error.errors,
      })
      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const { currentPassword, newPassword } = validation.data.body
    const user = await prisma.user.findUnique({ where: { id: req.userId } })

    if (!user) {
      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      logger.warn('[auth] Tentativa de troca de senha com senha atual inválida', {
        module: 'auth',
        event: 'change_password_invalid_current_password',
        userId: req.userId,
      })

      trace('DEBUG', 'auth', 'changePassword', 'Senha atual inválida', 0, {
        userId: req.userId,
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
      event: 'change_password_success',
      userId: req.userId,
    })

    trace('DEBUG', 'auth', 'changePassword', 'Senha alterada com sucesso', 0, {
      userId: req.userId,
    })
    endTrace('changePassword', { userId: req.userId })

    return res.json({ success: true, message: 'Senha alterada com sucesso' })
  } catch (error) {
    logger.error('[auth] Erro ao trocar senha', {
      module: 'auth',
      event: 'change_password_error',
      userId: req.userId,
      error,
    })

    endTrace('changePassword', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function register(req: Request, res: Response): Promise<Response> {
  startTrace(null, 'register', 'auth')

  try {
    const validation = registerSchema.safeParse(req)

    if (!validation.success) {
      logger.warn('[auth] Registro com payload inválido', {
        module: 'auth',
        event: 'register_validation_failed',
        errors: validation.error.errors,
      })

      endTrace('register', { errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const { email, password, name } = validation.data.body
    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      logger.warn('[auth] Tentativa de registro com email já existente', {
        module: 'auth',
        event: 'register_email_conflict',
        email,
      })

      endTrace('register', { errorFlag: true })
      return res.status(409).json({ success: false, error: 'Email já está em uso' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        preferences: serializeUserPreferences({ theme: 'dark' }),
      },
    })

    setCurrentTraceUserId(user.id)

    logger.info('[auth] Novo usuário registrado', {
      module: 'auth',
      event: 'user_registered',
      userId: user.id,
      email: user.email,
      name: user.name,
    })

    trace('DEBUG', 'auth', 'register', 'Usuário registrado com sucesso', 0, {
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
      event: 'register_error',
      error,
    })

    endTrace('register', { errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
