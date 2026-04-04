import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { startTrace, endTrace, trace } from '../utils/tracer'
import { AuthRequest } from '../middleware/auth.middleware'
import { z } from 'zod'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

// Schemas de validação
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Senha é obrigatória')
  })
})

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter no mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória')
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword']
  })
})

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
    name: z.string().min(1, 'Nome é obrigatório')
  })
})

// ==============================
// LOGIN
// ==============================
export async function login(req: Request, res: Response) {
  const traceId = startTrace('system', 'login', 'auth')
  
  try {
    const validation = loginSchema.safeParse(req)
    if (!validation.success) {
      trace('DEBUG', 'auth', 'login', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('login')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }

    const { email, password } = validation.data.body

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      trace('DEBUG', 'auth', 'login', 'Usuário não encontrado', 0, { email })
      endTrace('login')
      return res.status(401).json({ success: false, error: 'Email ou senha inválidos' })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      trace('DEBUG', 'auth', 'login', 'Senha inválida', 0, { email })
      endTrace('login')
      return res.status(401).json({ success: false, error: 'Email ou senha inválidos' })
    }

    // Atualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    })

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    )

    logger.info(`Usuário logado: ${user.email}`)
    trace('DEBUG', 'auth', 'login', 'Login bem sucedido', 0, { userId: user.id })
    endTrace('login')

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  } catch (error) {
    logger.error('Erro no login:', error)
    endTrace('login')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// GET ME (usuário atual)
// ==============================
export async function getMe(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getMe', 'auth')
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        preferences: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      endTrace('getMe')
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    trace('DEBUG', 'auth', 'getMe', 'Dados do usuário recuperados', 0)
    endTrace('getMe')

    return res.json({
      success: true,
      user: {
        ...user,
        preferences: JSON.parse(user.preferences || '{}')
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar usuário:', error)
    endTrace('getMe')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// LOGOUT
// ==============================
export async function logout(req: AuthRequest, res: Response) {
  logger.info(`Usuário fez logout: ${req.userId}`)
  return res.json({ success: true })
}

// ==============================
// TROCAR SENHA
// ==============================
export async function changePassword(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'changePassword', 'auth')
  
  try {
    const validation = changePasswordSchema.safeParse(req)
    if (!validation.success) {
      trace('DEBUG', 'auth', 'changePassword', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('changePassword')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }

    const { currentPassword, newPassword } = validation.data.body

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    })

    if (!user) {
      endTrace('changePassword')
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      trace('DEBUG', 'auth', 'changePassword', 'Senha atual inválida', 0)
      endTrace('changePassword')
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash: newPasswordHash }
    })

    logger.info(`Senha alterada para usuário: ${req.userId}`)
    trace('DEBUG', 'auth', 'changePassword', 'Senha alterada com sucesso', 0)
    endTrace('changePassword')

    return res.json({ success: true, message: 'Senha alterada com sucesso' })
  } catch (error) {
    logger.error('Erro ao trocar senha:', error)
    endTrace('changePassword')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// REGISTRAR
// ==============================
export async function register(req: Request, res: Response) {
  const traceId = startTrace('system', 'register', 'auth')
  
  try {
    const validation = registerSchema.safeParse(req)
    if (!validation.success) {
      endTrace('register')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }

    const { email, password, name } = validation.data.body

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      endTrace('register')
      return res.status(409).json({ success: false, error: 'Email já está em uso' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        preferences: JSON.stringify({ notificationsEnabled: true, theme: 'dark' })
      }
    })

    logger.info(`Novo usuário registrado: ${email}`)
    trace('DEBUG', 'auth', 'register', 'Usuário registrado com sucesso', 0, { userId: user.id })
    endTrace('register')

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  } catch (error) {
    logger.error('Erro no registro:', error)
    endTrace('register')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}