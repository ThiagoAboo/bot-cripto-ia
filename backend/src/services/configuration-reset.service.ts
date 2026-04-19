import path from 'path'
import { promises as fs } from 'fs'
import { Prisma } from '@prisma/client'

import { prisma } from '../config/database'
import {
  buildDefaultConfigurationData,
} from './configuration.service'
import { recordBalanceHistorySnapshot } from './portfolio.service'
import {
  emitDashboardUpdate,
  emitLogNew,
  emitOrderUpdated,
  emitTraceNew,
} from './socket.service'
import { buildTrainingCheckpointFilename, getTrainingCheckpointStorageDir } from './training-checkpoint.service'
import { getTrainingModelStorageDir } from './training-model.service'
import { getTrainingUploadStorageDir } from './training-upload.service'

export type ConfigurationResetScope =
  | 'logs_traces'
  | 'cash'
  | 'transactions'
  | 'trainings'
  | 'paper'
  | 'bots_runtime'
  | 'all_except_configurations'
  | 'configurations'
  | 'all'

export interface ConfigurationResetResult {
  scope: ConfigurationResetScope
  label: string
  summary: string
  executedAt: string
  deletedRecords: Record<string, number>
  deletedFiles: Record<string, number>
  preservedApiKeys: boolean
  paperBalance?: {
    currency: string
    amount: number
  }
}

type ResetPlan = {
  clearLogsTraces: boolean
  clearCash: boolean
  clearTransactions: boolean
  clearTrainings: boolean
  clearBotDecisions: boolean
  resetBotRuntime: boolean
  deleteUserBots: boolean
  resetConfigurations: boolean
  reinitializePaperWallet: boolean
}

type TrainingSessionAsset = {
  id: string
  modelUrl: string | null
  config: string
}

type UserBotAsset = {
  id: string
  modelUrl: string | null
}

const SCOPE_LABELS: Record<ConfigurationResetScope, string> = {
  logs_traces: 'Limpar traces e logs',
  cash: 'Limpar cash',
  transactions: 'Limpar ordens e transações',
  trainings: 'Limpar treinamentos',
  paper: 'Limpar paper',
  bots_runtime: 'Limpar bots e decisões',
  all_except_configurations: 'Limpar todos os dados mantendo configurações',
  configurations: 'Limpar configurações',
  all: 'Limpar tudo',
}

function resolveResetPlan(scope: ConfigurationResetScope): ResetPlan {
  switch (scope) {
    case 'logs_traces':
      return {
        clearLogsTraces: true,
        clearCash: false,
        clearTransactions: false,
        clearTrainings: false,
        clearBotDecisions: false,
        resetBotRuntime: false,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'cash':
      return {
        clearLogsTraces: false,
        clearCash: true,
        clearTransactions: false,
        clearTrainings: false,
        clearBotDecisions: false,
        resetBotRuntime: false,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'transactions':
      return {
        clearLogsTraces: false,
        clearCash: false,
        clearTransactions: true,
        clearTrainings: false,
        clearBotDecisions: false,
        resetBotRuntime: false,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'trainings':
      return {
        clearLogsTraces: false,
        clearCash: false,
        clearTransactions: false,
        clearTrainings: true,
        clearBotDecisions: false,
        resetBotRuntime: false,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'paper':
      return {
        clearLogsTraces: false,
        clearCash: true,
        clearTransactions: true,
        clearTrainings: false,
        clearBotDecisions: true,
        resetBotRuntime: true,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: true,
      }
    case 'bots_runtime':
      return {
        clearLogsTraces: false,
        clearCash: false,
        clearTransactions: false,
        clearTrainings: false,
        clearBotDecisions: true,
        resetBotRuntime: true,
        deleteUserBots: false,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'all_except_configurations':
      return {
        clearLogsTraces: true,
        clearCash: true,
        clearTransactions: true,
        clearTrainings: true,
        clearBotDecisions: true,
        resetBotRuntime: false,
        deleteUserBots: true,
        resetConfigurations: false,
        reinitializePaperWallet: false,
      }
    case 'configurations':
      return {
        clearLogsTraces: false,
        clearCash: false,
        clearTransactions: false,
        clearTrainings: false,
        clearBotDecisions: false,
        resetBotRuntime: false,
        deleteUserBots: false,
        resetConfigurations: true,
        reinitializePaperWallet: false,
      }
    case 'all':
      return {
        clearLogsTraces: true,
        clearCash: true,
        clearTransactions: true,
        clearTrainings: true,
        clearBotDecisions: true,
        resetBotRuntime: false,
        deleteUserBots: true,
        resetConfigurations: true,
        reinitializePaperWallet: true,
      }
  }
}

function parseUploadedFileUrl(config: string): string | null {
  try {
    const parsed = JSON.parse(config) as { uploadedFileUrl?: unknown }
    return typeof parsed.uploadedFileUrl === 'string' && parsed.uploadedFileUrl.length > 0
      ? parsed.uploadedFileUrl
      : null
  } catch {
    return null
  }
}

function resolveManagedFilePath(storageDir: string, urlOrFilename: string): string {
  const resolvedDir = path.resolve(storageDir)
  const candidate = path.resolve(resolvedDir, path.basename(urlOrFilename))

  if (candidate !== resolvedDir && !candidate.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error(`Caminho fora do diretório permitido: ${urlOrFilename}`)
  }

  return candidate
}

async function deleteManagedFile(filePath: string): Promise<boolean> {
  try {
    await fs.rm(filePath, { force: true })
    return true
  } catch {
    return false
  }
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

function resolvePaperResetBalance(): { currency: string; amount: number } {
  const currency = (process.env.PAPER_RESET_CURRENCY || 'USDT').trim().toUpperCase() || 'USDT'
  const amount = Math.max(0, readNumberEnv('PAPER_RESET_INITIAL_CAPITAL', 10000))

  return {
    currency,
    amount,
  }
}

async function collectResetAssets(
  tx: Prisma.TransactionClient,
  userId: string,
  includeTrainingAssets: boolean,
): Promise<{
  configuration: {
    exchange: string
    apiKey: string
    secretKey: string
  } | null
  trainingSessions: TrainingSessionAsset[]
  userBots: UserBotAsset[]
}> {
  const [configuration, trainingSessions, userBots] = await Promise.all([
    tx.configuration.findUnique({
      where: { userId },
      select: {
        exchange: true,
        apiKey: true,
        secretKey: true,
      },
    }),
    includeTrainingAssets
      ? tx.trainingSession.findMany({
          where: { userId },
          select: {
            id: true,
            modelUrl: true,
            config: true,
          },
        })
      : Promise.resolve([]),
    includeTrainingAssets
      ? tx.bot.findMany({
          where: { userId },
          select: {
            id: true,
            modelUrl: true,
          },
        })
      : Promise.resolve([]),
  ])

  return {
    configuration,
    trainingSessions,
    userBots,
  }
}

async function cleanupTrainingFiles(
  sessions: TrainingSessionAsset[],
  userBots: UserBotAsset[],
): Promise<Record<string, number>> {
  const deletedFiles = {
    modelFiles: 0,
    uploadFiles: 0,
    checkpointFiles: 0,
  }

  const modelDir = getTrainingModelStorageDir()
  const uploadDir = getTrainingUploadStorageDir()
  const checkpointDir = getTrainingCheckpointStorageDir()

  const modelPaths = new Set<string>()
  const uploadPaths = new Set<string>()
  const checkpointPaths = new Set<string>()

  for (const session of sessions) {
    if (session.modelUrl) {
      modelPaths.add(resolveManagedFilePath(modelDir, session.modelUrl))
    }

    const uploadedFileUrl = parseUploadedFileUrl(session.config)
    if (uploadedFileUrl) {
      uploadPaths.add(resolveManagedFilePath(uploadDir, uploadedFileUrl))
    }

    checkpointPaths.add(resolveManagedFilePath(checkpointDir, buildTrainingCheckpointFilename(session.id)))
  }

  for (const bot of userBots) {
    if (bot.modelUrl) {
      modelPaths.add(resolveManagedFilePath(modelDir, bot.modelUrl))
    }
  }

  for (const filePath of modelPaths) {
    if (await deleteManagedFile(filePath)) {
      deletedFiles.modelFiles += 1
    }
  }

  for (const filePath of uploadPaths) {
    if (await deleteManagedFile(filePath)) {
      deletedFiles.uploadFiles += 1
    }
  }

  for (const filePath of checkpointPaths) {
    if (await deleteManagedFile(filePath)) {
      deletedFiles.checkpointFiles += 1
    }
  }

  return deletedFiles
}

function buildSummary(result: Omit<ConfigurationResetResult, 'summary' | 'executedAt'>): string {
  const deletedRecordCount = Object.values(result.deletedRecords).reduce((sum, count) => sum + count, 0)
  const deletedFileCount = Object.values(result.deletedFiles).reduce((sum, count) => sum + count, 0)
  const parts = [`${result.label} executado com sucesso.`]

  if (deletedRecordCount > 0) {
    parts.push(`${deletedRecordCount} registros afetados.`)
  }

  if (deletedFileCount > 0) {
    parts.push(`${deletedFileCount} arquivos removidos.`)
  }

  if (result.paperBalance) {
    parts.push(`Paper restaurado com ${result.paperBalance.amount} ${result.paperBalance.currency}.`)
  }

  if (result.preservedApiKeys) {
    parts.push('As chaves externas foram preservadas.')
  }

  return parts.join(' ')
}

export async function executeConfigurationReset(
  userId: string,
  scope: ConfigurationResetScope,
): Promise<ConfigurationResetResult> {
  const plan = resolveResetPlan(scope)
  const includeTrainingAssets = plan.clearTrainings || plan.deleteUserBots
  const preloadedAssets = await prisma.$transaction((tx) => collectResetAssets(tx, userId, includeTrainingAssets))

  const deletedRecords = {
    logs: 0,
    traces: 0,
    balances: 0,
    balanceHistory: 0,
    transactions: 0,
    trainingSessions: 0,
    botDecisions: 0,
    botsRuntimeResets: 0,
    userBots: 0,
    configurations: 0,
  }

  await prisma.$transaction(async (tx) => {
    if (plan.clearLogsTraces) {
      const [logs, traces] = await Promise.all([
        tx.log.deleteMany({ where: { userId } }),
        tx.trace.deleteMany({ where: { userId } }),
      ])

      deletedRecords.logs = logs.count
      deletedRecords.traces = traces.count
    }

    if (plan.clearBotDecisions) {
      const decisions = await tx.botDecision.deleteMany({ where: { userId } })
      deletedRecords.botDecisions = decisions.count
    }

    if (plan.clearTransactions) {
      const transactions = await tx.transaction.deleteMany({ where: { userId } })
      deletedRecords.transactions = transactions.count
    }

    if (plan.clearTrainings) {
      const sessions = await tx.trainingSession.deleteMany({ where: { userId } })
      deletedRecords.trainingSessions = sessions.count

      if (!plan.deleteUserBots) {
        await tx.bot.updateMany({
          where: {
            userId,
            modelUrl: { not: null },
          },
          data: {
            modelUrl: null,
            modelVersion: 'v1.0.0',
          },
        })
      }
    }

    if (plan.clearLogsTraces || plan.clearCash || plan.clearTransactions || plan.clearTrainings || plan.clearBotDecisions) {
      if (plan.clearCash) {
        const [balances, balanceHistory] = await Promise.all([
          tx.balance.deleteMany({ where: { userId } }),
          tx.balanceHistory.deleteMany({ where: { userId } }),
        ])

        deletedRecords.balances = balances.count
        deletedRecords.balanceHistory = balanceHistory.count
      }
    }

    if (plan.resetBotRuntime) {
      const resetResult = await tx.bot.updateMany({
        where: { userId },
        data: {
          status: 'offline',
          isPaused: false,
          currentPair: null,
          lastAnalysis: null,
          recommendedAction: null,
          confidence: null,
        },
      })

      deletedRecords.botsRuntimeResets = resetResult.count
    }

    if (plan.deleteUserBots) {
      const bots = await tx.bot.deleteMany({ where: { userId } })
      deletedRecords.userBots = bots.count
    }

    if (plan.resetConfigurations) {
      const defaultConfiguration = buildDefaultConfigurationData({
        exchange: preloadedAssets.configuration?.exchange ?? 'binance',
        apiKey: preloadedAssets.configuration?.apiKey ?? '',
        secretKey: preloadedAssets.configuration?.secretKey ?? '',
      })

      await tx.configuration.upsert({
        where: { userId },
        update: defaultConfiguration,
        create: {
          userId,
          ...defaultConfiguration,
        },
      })

      deletedRecords.configurations = 1
    }

    if (plan.reinitializePaperWallet) {
      const paperBalance = resolvePaperResetBalance()
      await tx.balance.upsert({
        where: {
          userId_currency: {
            userId,
            currency: paperBalance.currency,
          },
        },
        update: {
          available: paperBalance.amount,
          reserved: 0,
          total: paperBalance.amount,
        },
        create: {
          userId,
          currency: paperBalance.currency,
          available: paperBalance.amount,
          reserved: 0,
          total: paperBalance.amount,
        },
      })
    }
  })

  const deletedFiles = includeTrainingAssets
    ? await cleanupTrainingFiles(preloadedAssets.trainingSessions, preloadedAssets.userBots)
    : {
        modelFiles: 0,
        uploadFiles: 0,
        checkpointFiles: 0,
      }

  const paperBalance = plan.reinitializePaperWallet ? resolvePaperResetBalance() : undefined

  if (paperBalance) {
    await recordBalanceHistorySnapshot(userId, [{
      currency: paperBalance.currency,
      total: paperBalance.amount,
    }]).catch(() => undefined)
  }

  emitDashboardUpdate(userId, {
    scope: 'portfolio',
    reason: `configuration_reset:${scope}`,
    updatedAt: new Date().toISOString(),
  })
  emitDashboardUpdate(userId, {
    scope: 'bots',
    reason: `configuration_reset:${scope}`,
    updatedAt: new Date().toISOString(),
  })
  emitOrderUpdated(userId, {
    type: 'reset',
    scope,
    updatedAt: new Date().toISOString(),
  })
  emitLogNew(userId, {
    type: 'reset',
    scope,
    updatedAt: new Date().toISOString(),
  })
  emitTraceNew(userId, {
    type: 'reset',
    scope,
    updatedAt: new Date().toISOString(),
  })

  const baseResult: Omit<ConfigurationResetResult, 'summary' | 'executedAt'> = {
    scope,
    label: SCOPE_LABELS[scope],
    deletedRecords,
    deletedFiles,
    preservedApiKeys: plan.resetConfigurations,
    paperBalance,
  }

  return {
    ...baseResult,
    executedAt: new Date().toISOString(),
    summary: buildSummary(baseResult),
  }
}
