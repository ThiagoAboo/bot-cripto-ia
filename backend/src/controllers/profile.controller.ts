import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { startTrace, endTrace, trace } from '../utils/tracer'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

// Schema para atualização de perfil
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido')
})

// Schema para preferências
const preferencesSchema = z.object({
  notificationsEnabled: z.boolean(),
  theme: z.enum(['dark', 'light'])
})

// ==============================
// GET PROFILE
// ==============================
export async function getProfile(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'getProfile', 'profile')
  
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
      endTrace('getProfile')
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }
    
    endTrace('getProfile')
    
    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        preferences: JSON.parse(user.preferences || '{"notificationsEnabled":true,"theme":"dark"}'),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    })
  } catch (error) {
    logger.error('Erro ao buscar perfil:', error)
    endTrace('getProfile')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// UPDATE PROFILE
// ==============================
export async function updateProfile(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'updateProfile', 'profile')
  
  try {
    const validation = updateProfileSchema.safeParse(req.body)
    if (!validation.success) {
      trace('DEBUG', 'profile', 'updateProfile', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('updateProfile')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }
    
    const { name, email } = validation.data
    const userId = req.userId!
    
    // Verificar se email já está em uso por outro usuário
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: userId }
      }
    })
    
    if (existingUser) {
      endTrace('updateProfile')
      return res.status(409).json({ success: false, error: 'Email já está em uso' })
    }
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        updatedAt: new Date()
      }
    })
    
    logger.info(`Perfil atualizado para usuário: ${userId}`)
    trace('DEBUG', 'profile', 'updateProfile', 'Perfil atualizado', 0)
    endTrace('updateProfile')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao atualizar perfil:', error)
    endTrace('updateProfile')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// UPDATE PREFERENCES
// ==============================
export async function updatePreferences(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'updatePreferences', 'profile')
  
  try {
    const validation = preferencesSchema.safeParse(req.body)
    if (!validation.success) {
      trace('DEBUG', 'profile', 'updatePreferences', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('updatePreferences')
      return res.status(400).json({ 
        success: false, 
        error: validation.error.errors.map(e => e.message).join(', ')
      })
    }
    
    const userId = req.userId!
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: JSON.stringify(validation.data),
        updatedAt: new Date()
      }
    })
    
    logger.info(`Preferências atualizadas para usuário: ${userId}`)
    trace('DEBUG', 'profile', 'updatePreferences', 'Preferências atualizadas', 0)
    endTrace('updatePreferences')
    
    return res.json({ success: true })
  } catch (error) {
    logger.error('Erro ao atualizar preferências:', error)
    endTrace('updatePreferences')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

// ==============================
// CHANGE PASSWORD (via profile)
// ==============================
export async function changePassword(req: AuthRequest, res: Response) {
  const traceId = startTrace(req.userId!, 'changePassword', 'profile')
  
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      endTrace('changePassword')
      return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' })
    }
    
    if (newPassword !== confirmPassword) {
      endTrace('changePassword')
      return res.status(400).json({ success: false, error: 'As senhas não coincidem' })
    }
    
    if (newPassword.length < 8) {
      endTrace('changePassword')
      return res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 8 caracteres' })
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    })
    
    if (!user) {
      endTrace('changePassword')
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }
    
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      trace('DEBUG', 'profile', 'changePassword', 'Senha atual inválida', 0)
      endTrace('changePassword')
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' })
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10)
    
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date()
      }
    })
    
    logger.info(`Senha alterada para usuário: ${req.userId}`)
    trace('DEBUG', 'profile', 'changePassword', 'Senha alterada com sucesso', 0)
    endTrace('changePassword')
    
    return res.json({ success: true, message: 'Senha alterada com sucesso' })
  } catch (error) {
    logger.error('Erro ao trocar senha:', error)
    endTrace('changePassword')
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}