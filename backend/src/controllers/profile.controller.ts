import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import { endTrace, startTrace, trace } from '../utils/tracer'
import { normalizeUserPreferences, serializeUserPreferences } from '../utils/user-preferences'

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
})

const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light']),
})

export async function getProfile(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'getProfile', 'profile')

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
      endTrace('getProfile', { userId: req.userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    endTrace('getProfile', { userId: req.userId })
    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        preferences: normalizeUserPreferences(user.preferences),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    })
  } catch (error) {
    logger.error('[profile] Erro ao buscar perfil', {
      module: 'profile',
      event: 'get_profile_error',
      userId: req.userId,
      error,
    })

    endTrace('getProfile', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'updateProfile', 'profile')

  try {
    const validation = updateProfileSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('[profile] Payload inválido ao atualizar perfil', {
        module: 'profile',
        event: 'update_profile_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'profile', 'updateProfile', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('updateProfile', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const { name, email } = validation.data
    const userId = req.userId!

    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: userId },
      },
    })

    if (existingUser) {
      logger.warn('[profile] Tentativa de atualizar perfil com email já utilizado', {
        module: 'profile',
        event: 'update_profile_email_conflict',
        userId,
        email,
      })

      endTrace('updateProfile', { userId, errorFlag: true })
      return res.status(409).json({ success: false, error: 'Email já está em uso' })
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        updatedAt: new Date(),
      },
    })

    logger.info('[profile] Perfil atualizado com sucesso', {
      module: 'profile',
      event: 'profile_updated',
      userId,
      profile: { name, email },
    })

    trace('DEBUG', 'profile', 'updateProfile', 'Perfil atualizado', 0, { userId })
    endTrace('updateProfile', { userId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[profile] Erro ao atualizar perfil', {
      module: 'profile',
      event: 'update_profile_error',
      userId: req.userId,
      error,
    })

    endTrace('updateProfile', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function updatePreferences(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'updatePreferences', 'profile')

  try {
    const validation = preferencesSchema.safeParse(req.body)
    if (!validation.success) {
      logger.warn('[profile] Payload inválido ao atualizar preferências', {
        module: 'profile',
        event: 'update_preferences_validation_failed',
        userId: req.userId,
        errors: validation.error.errors,
      })

      trace('DEBUG', 'profile', 'updatePreferences', 'Validação falhou', 0, { errors: validation.error.errors })
      endTrace('updatePreferences', { userId: req.userId, errorFlag: true })
      return res.status(400).json({
        success: false,
        error: validation.error.errors.map((entry) => entry.message).join(', '),
      })
    }

    const userId = req.userId!

    await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: serializeUserPreferences(validation.data),
        updatedAt: new Date(),
      },
    })

    logger.info('[profile] Preferências atualizadas com sucesso', {
      module: 'profile',
      event: 'preferences_updated',
      userId,
      preferences: validation.data,
    })

    trace('DEBUG', 'profile', 'updatePreferences', 'Preferências atualizadas', 0, { userId })
    endTrace('updatePreferences', { userId })
    return res.json({ success: true })
  } catch (error) {
    logger.error('[profile] Erro ao atualizar preferências', {
      module: 'profile',
      event: 'update_preferences_error',
      userId: req.userId,
      error,
    })

    endTrace('updatePreferences', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<Response> {
  startTrace(req.userId!, 'changePassword', 'profile')

  try {
    const { currentPassword, newPassword, confirmPassword } = req.body

    if (!currentPassword || !newPassword || !confirmPassword) {
      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' })
    }

    if (newPassword !== confirmPassword) {
      logger.warn('[profile] Nova senha não confere com confirmação', {
        module: 'profile',
        event: 'profile_change_password_confirmation_mismatch',
        userId: req.userId,
      })

      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'As senhas não coincidem' })
    }

    if (newPassword.length < 8) {
      logger.warn('[profile] Nova senha abaixo do tamanho mínimo', {
        module: 'profile',
        event: 'profile_change_password_too_short',
        userId: req.userId,
      })

      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 8 caracteres' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) {
      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' })
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      logger.warn('[profile] Senha atual inválida para troca de senha', {
        module: 'profile',
        event: 'profile_change_password_invalid_current_password',
        userId: req.userId,
      })

      trace('DEBUG', 'profile', 'changePassword', 'Senha atual inválida', 0, { userId: req.userId })
      endTrace('changePassword', { userId: req.userId, errorFlag: true })
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      },
    })

    logger.info('[profile] Senha alterada com sucesso', {
      module: 'profile',
      event: 'profile_password_changed',
      userId: req.userId,
    })

    trace('DEBUG', 'profile', 'changePassword', 'Senha alterada com sucesso', 0, { userId: req.userId })
    endTrace('changePassword', { userId: req.userId })
    return res.json({ success: true, message: 'Senha alterada com sucesso' })
  } catch (error) {
    logger.error('[profile] Erro ao trocar senha', {
      module: 'profile',
      event: 'profile_change_password_error',
      userId: req.userId,
      error,
    })

    endTrace('changePassword', { userId: req.userId, errorFlag: true })
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
}
