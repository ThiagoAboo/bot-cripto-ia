import crypto from 'crypto'
import path from 'path'
import { promises as fs } from 'fs'

import { prisma } from '../config/database'
import { executeConfigurationReset } from './configuration-reset.service'
import { buildDefaultConfigurationData } from './configuration.service'
import {
  buildTrainingCheckpointFilename,
  getTrainingCheckpointStorageDir,
} from './training-checkpoint.service'
import { getTrainingModelStorageDir } from './training-model.service'
import { getTrainingUploadStorageDir } from './training-upload.service'
import {
  emitDashboardUpdate,
  emitLogNew,
  emitOrderUpdated,
  emitTraceNew,
} from './socket.service'

const BACKUP_SNAPSHOT_TYPE = 'bot-crypto-ia-user-backup'
const BACKUP_FORMAT_VERSION = 1

type SerializedConfigurationRecord = {
  exchange: string
  apiKey: string
  secretKey: string
  stopLossPercent: number
  takeProfitPercent: number
  leverage: number
  maxTradeAmount: number
  maxTradeAmountUnit: string
  allowedPairs: string
  useBnbForFees: boolean
  discountUsdtPercent: number
  discountBnbPercent: number
  minBnbBalance: number
  reserveBnbForFeesEnabled: boolean
  pairDiscovery: string
  mode: string
  orderType: string
  slippagePercent: number
  strategies: string
}

type SerializedBotRecord = {
  id: string
  templateId: string | null
  templateSlug: string | null
  name: string
  strategyType: string
  description: string | null
  executionMode: string
  isSystemManaged: boolean
  status: string
  isPaused: boolean
  currentPair: string | null
  lastAnalysis: string | null
  recommendedAction: string | null
  confidence: number | null
  modelVersion: string
  modelUrl: string | null
  parameters: string
  createdAt: string
}

type SerializedTransactionRecord = {
  id: string
  date: string
  pair: string
  origin: string
  botId: string | null
  type: string
  quantity: number
  requestedQuantity: number
  orderType: string
  price: number
  total: number
  fee: number
  feeCurrency: string
  feeRateApplied: number
  feeDiscountSource: string | null
  status: string
  externalOrderId: string | null
  externalClientOrderId: string | null
  externalStatus: string | null
  syncedAt: string | null
  profitBrl: number | null
  profitPercent: number | null
  createdAt: string
}

type SerializedBalanceRecord = {
  currency: string
  available: number
  reserved: number
  total: number
  updatedAt: string
}

type SerializedBalanceHistoryRecord = {
  timestamp: string
  totalBrl: number
}

type SerializedTrainingSessionRecord = {
  id: string
  botId: string
  status: string
  startTime: string
  endTime: string | null
  config: string
  metrics: string
  bestEpoch: number | null
  bestValLoss: number | null
  modelUrl: string | null
  createdAt: string
}

type SerializedBotModelArtifactRecord = {
  id: string
  botId: string
  trainingSessionId: string | null
  modelVersion: string
  modelUrl: string
  fingerprint: string
  architecture: string | null
  validationStrategy: string | null
  forecastHorizonCandles: number | null
  governanceRole: string
  isActive: boolean
  notes: string | null
  evaluationSummary: string
  reproducibilitySummary: string
  promotedAt: string | null
  archivedAt: string | null
  createdAt: string
}

type SerializedBotDecisionRecord = {
  id: string
  botId: string
  pair: string
  action: string
  confidence: number
  reason: string
  timeframe: string
  executionMode: string
  executionStatus: string
  modelVersion: string | null
  modelUrl: string | null
  modelArchitecture: string | null
  horizonCandles: number
  buyThresholdPercent: number
  sellThresholdPercent: number
  decisionPrice: number
  requestedQuantity: number | null
  executedQuantity: number | null
  transactionId: string | null
  slippagePercent: number | null
  simulatedLatencyMs: number | null
  simulatedFillPercent: number | null
  createdAt: string
  dueAt: string
  evaluatedAt: string | null
  evaluationStatus: string
  evaluationPrice: number | null
  marketReturnPercent: number | null
  strategyReturnPercent: number | null
  realizedEdgePercent: number | null
  actualLabel: string | null
  expectedLabel: string | null
  isCorrect: boolean | null
}

type SerializedLogRecord = {
  id: string
  timestamp: string
  level: string
  module: string
  message: string
  details: string | null
}

type SerializedTraceRecord = {
  id: string
  timestamp: string
  level: string
  module: string
  traceId: string
  parentTraceId: string | null
  functionName: string
  message: string
  durationMs: number
  botId: string | null
  currentPair: string | null
  recommendedAction: string | null
  confidence: number | null
  errorFlag: boolean
}

type BackupBinaryFile = {
  originalUrl: string
  filename: string
  contentBase64: string
}

type BackupCheckpointFile = {
  sessionId: string
  filename: string
  contentBase64: string
}

export interface ConfigurationBackupSnapshot {
  snapshotType: typeof BACKUP_SNAPSHOT_TYPE
  formatVersion: number
  exportedAt: string
  userProfile: {
    sourceUserId: string
    name: string
    preferences: string
    lastLogin: string | null
  }
  configuration: SerializedConfigurationRecord | null
  summary: {
    recordCounts: Record<string, number>
    fileCounts: Record<string, number>
  }
  data: {
    balances: SerializedBalanceRecord[]
    balanceHistory: SerializedBalanceHistoryRecord[]
    bots: SerializedBotRecord[]
    transactions: SerializedTransactionRecord[]
    trainingSessions: SerializedTrainingSessionRecord[]
    botModelArtifacts: SerializedBotModelArtifactRecord[]
    botDecisions: SerializedBotDecisionRecord[]
    logs: SerializedLogRecord[]
    traces: SerializedTraceRecord[]
  }
  files: {
    modelFiles: BackupBinaryFile[]
    uploadFiles: BackupBinaryFile[]
    checkpointFiles: BackupCheckpointFile[]
  }
}

export interface ConfigurationBackupRestoreResult {
  restoredAt: string
  summary: string
  restoredRecords: Record<string, number>
  restoredFiles: Record<string, number>
  preservedApiKeys: boolean
}

export class ConfigurationBackupError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 400) {
    super(message)
    this.name = 'ConfigurationBackupError'
    this.statusCode = statusCode
  }
}

function sanitizeFilenameSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'file'
}

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function createRestoredId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function ensureSnapshotObject(input: unknown): ConfigurationBackupSnapshot {
  if (!input || typeof input !== 'object') {
    throw new ConfigurationBackupError('Snapshot de backup inválido')
  }

  const candidate = input as Partial<ConfigurationBackupSnapshot>
  if (candidate.snapshotType !== BACKUP_SNAPSHOT_TYPE) {
    throw new ConfigurationBackupError('Tipo de snapshot incompatível')
  }

  if (typeof candidate.formatVersion !== 'number' || candidate.formatVersion < 1) {
    throw new ConfigurationBackupError('Versão do snapshot inválida')
  }

  if (!candidate.data || typeof candidate.data !== 'object') {
    throw new ConfigurationBackupError('Estrutura de dados do snapshot inválida')
  }

  if (!candidate.files || typeof candidate.files !== 'object') {
    throw new ConfigurationBackupError('Estrutura de arquivos do snapshot inválida')
  }

  return candidate as ConfigurationBackupSnapshot
}

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function parseUploadedFileUrl(config: string): string | null {
  const parsed = tryParseJson<{ uploadedFileUrl?: unknown }>(config)
  return typeof parsed?.uploadedFileUrl === 'string' && parsed.uploadedFileUrl.length > 0
    ? parsed.uploadedFileUrl
    : null
}

function deepReplaceExactStrings(value: unknown, maps: Array<Map<string, string>>): unknown {
  if (typeof value === 'string') {
    for (const replacements of maps) {
      const replaced = replacements.get(value)
      if (replaced) {
        return replaced
      }
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deepReplaceExactStrings(entry, maps))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepReplaceExactStrings(entry, maps)]),
    )
  }

  return value
}

function rewriteJsonStringReferences(value: string, maps: Array<Map<string, string>>): string {
  const parsed = tryParseJson<unknown>(value)
  if (!parsed) {
    return value
  }

  return JSON.stringify(deepReplaceExactStrings(parsed, maps))
}

function buildRestoredFilename(prefix: string, originalFilename: string, fallbackExtension: string): string {
  const parsedPath = path.parse(originalFilename)
  const baseName = sanitizeFilenameSegment(parsedPath.name || 'file')
  const extension = parsedPath.ext || fallbackExtension

  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${baseName}${extension}`
}

async function safeReadFileAsBase64(absolutePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(absolutePath)
    return buffer.toString('base64')
  } catch {
    return null
  }
}

async function ensureDirectory(absolutePath: string): Promise<void> {
  await fs.mkdir(absolutePath, { recursive: true })
}

function decodeBase64File(contentBase64: string): Buffer {
  try {
    return Buffer.from(contentBase64, 'base64')
  } catch {
    throw new ConfigurationBackupError('Conteúdo de arquivo inválido no snapshot')
  }
}

function buildRestoreSummary(result: Omit<ConfigurationBackupRestoreResult, 'summary' | 'restoredAt'>): string {
  const restoredRecordCount = Object.values(result.restoredRecords).reduce((sum, count) => sum + count, 0)
  const restoredFileCount = Object.values(result.restoredFiles).reduce((sum, count) => sum + count, 0)

  const parts = ['Backup restaurado com sucesso.', `${restoredRecordCount} registros recriados.`]

  if (restoredFileCount > 0) {
    parts.push(`${restoredFileCount} arquivos restaurados.`)
  }

  if (result.preservedApiKeys) {
    parts.push('As chaves externas atuais foram preservadas.')
  }

  return parts.join(' ')
}

export async function exportConfigurationBackup(userId: string): Promise<ConfigurationBackupSnapshot> {
  const payload = await prisma.$transaction(async (tx) => {
    const [
      user,
      configuration,
      balances,
      balanceHistory,
      bots,
      transactions,
      trainingSessions,
      botModelArtifacts,
      botDecisions,
      logs,
      traces,
    ] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          preferences: true,
          lastLogin: true,
        },
      }),
      tx.configuration.findUnique({
        where: { userId },
        select: {
          exchange: true,
          apiKey: true,
          secretKey: true,
          stopLossPercent: true,
          takeProfitPercent: true,
          leverage: true,
          maxTradeAmount: true,
          maxTradeAmountUnit: true,
          allowedPairs: true,
          useBnbForFees: true,
          discountUsdtPercent: true,
          discountBnbPercent: true,
          minBnbBalance: true,
          reserveBnbForFeesEnabled: true,
          pairDiscovery: true,
          mode: true,
          orderType: true,
          slippagePercent: true,
          strategies: true,
        },
      }),
      tx.balance.findMany({
        where: { userId },
        orderBy: { currency: 'asc' },
      }),
      tx.balanceHistory.findMany({
        where: { userId },
        orderBy: { timestamp: 'asc' },
      }),
      tx.bot.findMany({
        where: { userId },
        include: {
          template: {
            select: {
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      tx.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      tx.trainingSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      tx.botModelArtifact.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      tx.botDecision.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      tx.log.findMany({
        where: { userId },
        orderBy: { timestamp: 'asc' },
      }),
      tx.trace.findMany({
        where: { userId },
        orderBy: { timestamp: 'asc' },
      }),
    ])

    return {
      user,
      configuration,
      balances,
      balanceHistory,
      bots,
      transactions,
      trainingSessions,
      botModelArtifacts,
      botDecisions,
      logs,
      traces,
    }
  })

  const modelUrls = new Set<string>()
  const uploadUrls = new Set<string>()

  for (const bot of payload.bots) {
    if (bot.modelUrl) {
      modelUrls.add(bot.modelUrl)
    }
  }

  for (const session of payload.trainingSessions) {
    if (session.modelUrl) {
      modelUrls.add(session.modelUrl)
    }

    const uploadedFileUrl = parseUploadedFileUrl(session.config)
    if (uploadedFileUrl) {
      uploadUrls.add(uploadedFileUrl)
    }
  }

  for (const artifact of payload.botModelArtifacts) {
    modelUrls.add(artifact.modelUrl)
  }

  for (const decision of payload.botDecisions) {
    if (decision.modelUrl) {
      modelUrls.add(decision.modelUrl)
    }
  }

  const modelFiles: BackupBinaryFile[] = []
  for (const modelUrl of modelUrls) {
    const absolutePath = path.join(getTrainingModelStorageDir(), path.basename(modelUrl))
    const contentBase64 = await safeReadFileAsBase64(absolutePath)
    if (!contentBase64) {
      continue
    }

    modelFiles.push({
      originalUrl: modelUrl,
      filename: path.basename(modelUrl),
      contentBase64,
    })
  }

  const uploadFiles: BackupBinaryFile[] = []
  for (const uploadUrl of uploadUrls) {
    const absolutePath = path.join(getTrainingUploadStorageDir(), path.basename(uploadUrl))
    const contentBase64 = await safeReadFileAsBase64(absolutePath)
    if (!contentBase64) {
      continue
    }

    uploadFiles.push({
      originalUrl: uploadUrl,
      filename: path.basename(uploadUrl),
      contentBase64,
    })
  }

  const checkpointFiles: BackupCheckpointFile[] = []
  for (const session of payload.trainingSessions) {
    const absolutePath = path.join(
      getTrainingCheckpointStorageDir(),
      buildTrainingCheckpointFilename(session.id),
    )
    const contentBase64 = await safeReadFileAsBase64(absolutePath)
    if (!contentBase64) {
      continue
    }

    checkpointFiles.push({
      sessionId: session.id,
      filename: path.basename(absolutePath),
      contentBase64,
    })
  }

  return {
    snapshotType: BACKUP_SNAPSHOT_TYPE,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    userProfile: {
      sourceUserId: userId,
      name: payload.user?.name ?? '',
      preferences: payload.user?.preferences ?? '{}',
      lastLogin: toIsoString(payload.user?.lastLogin),
    },
    configuration: payload.configuration ? { ...payload.configuration } : null,
    summary: {
      recordCounts: {
        balances: payload.balances.length,
        balanceHistory: payload.balanceHistory.length,
        bots: payload.bots.length,
        transactions: payload.transactions.length,
        trainingSessions: payload.trainingSessions.length,
        botModelArtifacts: payload.botModelArtifacts.length,
        botDecisions: payload.botDecisions.length,
        logs: payload.logs.length,
        traces: payload.traces.length,
      },
      fileCounts: {
        modelFiles: modelFiles.length,
        uploadFiles: uploadFiles.length,
        checkpointFiles: checkpointFiles.length,
      },
    },
    data: {
      balances: payload.balances.map((entry) => ({
        currency: entry.currency,
        available: entry.available,
        reserved: entry.reserved,
        total: entry.total,
        updatedAt: entry.updatedAt.toISOString(),
      })),
      balanceHistory: payload.balanceHistory.map((entry) => ({
        timestamp: entry.timestamp.toISOString(),
        totalBrl: entry.totalBrl,
      })),
      bots: payload.bots.map((entry) => ({
        id: entry.id,
        templateId: entry.templateId,
        templateSlug: entry.template?.slug ?? null,
        name: entry.name,
        strategyType: entry.strategyType,
        description: entry.description,
        executionMode: entry.executionMode,
        isSystemManaged: entry.isSystemManaged,
        status: entry.status,
        isPaused: entry.isPaused,
        currentPair: entry.currentPair,
        lastAnalysis: toIsoString(entry.lastAnalysis),
        recommendedAction: entry.recommendedAction,
        confidence: entry.confidence,
        modelVersion: entry.modelVersion,
        modelUrl: entry.modelUrl,
        parameters: entry.parameters,
        createdAt: entry.createdAt.toISOString(),
      })),
      transactions: payload.transactions.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        pair: entry.pair,
        origin: entry.origin,
        botId: entry.botId,
        type: entry.type,
        quantity: entry.quantity,
        requestedQuantity: entry.requestedQuantity,
        orderType: entry.orderType,
        price: entry.price,
        total: entry.total,
        fee: entry.fee,
        feeCurrency: entry.feeCurrency,
        feeRateApplied: entry.feeRateApplied,
        feeDiscountSource: entry.feeDiscountSource,
        status: entry.status,
        externalOrderId: entry.externalOrderId,
        externalClientOrderId: entry.externalClientOrderId,
        externalStatus: entry.externalStatus,
        syncedAt: toIsoString(entry.syncedAt),
        profitBrl: entry.profitBrl,
        profitPercent: entry.profitPercent,
        createdAt: entry.createdAt.toISOString(),
      })),
      trainingSessions: payload.trainingSessions.map((entry) => ({
        id: entry.id,
        botId: entry.botId,
        status: entry.status,
        startTime: entry.startTime.toISOString(),
        endTime: toIsoString(entry.endTime),
        config: entry.config,
        metrics: entry.metrics,
        bestEpoch: entry.bestEpoch,
        bestValLoss: entry.bestValLoss,
        modelUrl: entry.modelUrl,
        createdAt: entry.createdAt.toISOString(),
      })),
      botModelArtifacts: payload.botModelArtifacts.map((entry) => ({
        id: entry.id,
        botId: entry.botId,
        trainingSessionId: entry.trainingSessionId,
        modelVersion: entry.modelVersion,
        modelUrl: entry.modelUrl,
        fingerprint: entry.fingerprint,
        architecture: entry.architecture,
        validationStrategy: entry.validationStrategy,
        forecastHorizonCandles: entry.forecastHorizonCandles,
        governanceRole: entry.governanceRole,
        isActive: entry.isActive,
        notes: entry.notes,
        evaluationSummary: entry.evaluationSummary,
        reproducibilitySummary: entry.reproducibilitySummary,
        promotedAt: toIsoString(entry.promotedAt),
        archivedAt: toIsoString(entry.archivedAt),
        createdAt: entry.createdAt.toISOString(),
      })),
      botDecisions: payload.botDecisions.map((entry) => ({
        id: entry.id,
        botId: entry.botId,
        pair: entry.pair,
        action: entry.action,
        confidence: entry.confidence,
        reason: entry.reason,
        timeframe: entry.timeframe,
        executionMode: entry.executionMode,
        executionStatus: entry.executionStatus,
        modelVersion: entry.modelVersion,
        modelUrl: entry.modelUrl,
        modelArchitecture: entry.modelArchitecture,
        horizonCandles: entry.horizonCandles,
        buyThresholdPercent: entry.buyThresholdPercent,
        sellThresholdPercent: entry.sellThresholdPercent,
        decisionPrice: entry.decisionPrice,
        requestedQuantity: entry.requestedQuantity,
        executedQuantity: entry.executedQuantity,
        transactionId: entry.transactionId,
        slippagePercent: entry.slippagePercent,
        simulatedLatencyMs: entry.simulatedLatencyMs,
        simulatedFillPercent: entry.simulatedFillPercent,
        createdAt: entry.createdAt.toISOString(),
        dueAt: entry.dueAt.toISOString(),
        evaluatedAt: toIsoString(entry.evaluatedAt),
        evaluationStatus: entry.evaluationStatus,
        evaluationPrice: entry.evaluationPrice,
        marketReturnPercent: entry.marketReturnPercent,
        strategyReturnPercent: entry.strategyReturnPercent,
        realizedEdgePercent: entry.realizedEdgePercent,
        actualLabel: entry.actualLabel,
        expectedLabel: entry.expectedLabel,
        isCorrect: entry.isCorrect,
      })),
      logs: payload.logs.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        module: entry.module,
        message: entry.message,
        details: entry.details,
      })),
      traces: payload.traces.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        module: entry.module,
        traceId: entry.traceId,
        parentTraceId: entry.parentTraceId,
        functionName: entry.functionName,
        message: entry.message,
        durationMs: entry.durationMs,
        botId: entry.botId,
        currentPair: entry.currentPair,
        recommendedAction: entry.recommendedAction,
        confidence: entry.confidence,
        errorFlag: entry.errorFlag,
      })),
    },
    files: {
      modelFiles,
      uploadFiles,
      checkpointFiles,
    },
  }
}

export async function restoreConfigurationBackup(
  userId: string,
  snapshotInput: unknown,
  options?: {
    preserveCurrentApiKeys?: boolean
  },
): Promise<ConfigurationBackupRestoreResult> {
  const snapshot = ensureSnapshotObject(snapshotInput)
  const preserveCurrentApiKeys = options?.preserveCurrentApiKeys ?? true

  const currentConfiguration = await prisma.configuration.findUnique({
    where: { userId },
    select: {
      exchange: true,
      apiKey: true,
      secretKey: true,
    },
  })

  const templates = await prisma.botTemplate.findMany({
    select: {
      id: true,
      slug: true,
    },
  })

  const templateIdBySlug = new Map(templates.map((entry) => [entry.slug, entry.id]))
  const templateIds = new Set(templates.map((entry) => entry.id))

  const botIdMap = new Map(snapshot.data.bots.map((entry) => [entry.id, createRestoredId('bot')]))
  const transactionIdMap = new Map(snapshot.data.transactions.map((entry) => [entry.id, createRestoredId('txn')]))
  const trainingSessionIdMap = new Map(snapshot.data.trainingSessions.map((entry) => [entry.id, createRestoredId('train')]))
  const modelArtifactIdMap = new Map(snapshot.data.botModelArtifacts.map((entry) => [entry.id, createRestoredId('artifact')]))
  const decisionIdMap = new Map(snapshot.data.botDecisions.map((entry) => [entry.id, createRestoredId('decision')]))

  const modelStorageDir = getTrainingModelStorageDir()
  const uploadStorageDir = getTrainingUploadStorageDir()
  const checkpointStorageDir = getTrainingCheckpointStorageDir()
  await Promise.all([
    ensureDirectory(modelStorageDir),
    ensureDirectory(uploadStorageDir),
    ensureDirectory(checkpointStorageDir),
  ])

  const modelUrlMap = new Map<string, string>()
  const uploadUrlMap = new Map<string, string>()

  for (const modelFile of snapshot.files.modelFiles) {
    const restoredFilename = buildRestoredFilename('restored_model', modelFile.filename, '.h5')
    modelUrlMap.set(modelFile.originalUrl, `/models/${restoredFilename}`)
  }

  for (const uploadFile of snapshot.files.uploadFiles) {
    const restoredFilename = buildRestoredFilename('restored_dataset', uploadFile.filename, '.csv')
    uploadUrlMap.set(uploadFile.originalUrl, `/uploads/${restoredFilename}`)
  }

  const referenceMaps = [
    new Map([[snapshot.userProfile.sourceUserId, userId]]),
    botIdMap,
    trainingSessionIdMap,
    transactionIdMap,
    modelUrlMap,
    uploadUrlMap,
  ]
  const jsonRewriteMaps = [modelUrlMap, uploadUrlMap]

  await executeConfigurationReset(userId, 'all_except_configurations')

  const restoredFiles = {
    modelFiles: 0,
    uploadFiles: 0,
    checkpointFiles: 0,
  }

  for (const modelFile of snapshot.files.modelFiles) {
    const restoredUrl = modelUrlMap.get(modelFile.originalUrl)
    if (!restoredUrl) {
      continue
    }

    const decodedBuffer = decodeBase64File(modelFile.contentBase64)
    const parsedContent = tryParseJson<unknown>(decodedBuffer.toString('utf-8'))
    const rewrittenContent = parsedContent
      ? Buffer.from(JSON.stringify(deepReplaceExactStrings(parsedContent, referenceMaps), null, 2), 'utf-8')
      : decodedBuffer
    const absolutePath = path.join(modelStorageDir, path.basename(restoredUrl))
    await fs.writeFile(absolutePath, rewrittenContent)
    restoredFiles.modelFiles += 1
  }

  for (const uploadFile of snapshot.files.uploadFiles) {
    const restoredUrl = uploadUrlMap.get(uploadFile.originalUrl)
    if (!restoredUrl) {
      continue
    }

    const absolutePath = path.join(uploadStorageDir, path.basename(restoredUrl))
    await fs.writeFile(absolutePath, decodeBase64File(uploadFile.contentBase64))
    restoredFiles.uploadFiles += 1
  }

  for (const checkpointFile of snapshot.files.checkpointFiles) {
    const restoredSessionId = trainingSessionIdMap.get(checkpointFile.sessionId)
    if (!restoredSessionId) {
      continue
    }

    const decodedBuffer = decodeBase64File(checkpointFile.contentBase64)
    const parsedContent = tryParseJson<unknown>(decodedBuffer.toString('utf-8'))
    const rewrittenContent = parsedContent
      ? Buffer.from(JSON.stringify(deepReplaceExactStrings(parsedContent, referenceMaps), null, 2), 'utf-8')
      : decodedBuffer
    const absolutePath = path.join(checkpointStorageDir, buildTrainingCheckpointFilename(restoredSessionId))
    await fs.writeFile(absolutePath, rewrittenContent)
    restoredFiles.checkpointFiles += 1
  }

  const baseConfiguration = buildDefaultConfigurationData({
    exchange: currentConfiguration?.exchange ?? snapshot.configuration?.exchange ?? 'binance',
    apiKey: preserveCurrentApiKeys
      ? currentConfiguration?.apiKey ?? snapshot.configuration?.apiKey ?? ''
      : snapshot.configuration?.apiKey ?? currentConfiguration?.apiKey ?? '',
    secretKey: preserveCurrentApiKeys
      ? currentConfiguration?.secretKey ?? snapshot.configuration?.secretKey ?? ''
      : snapshot.configuration?.secretKey ?? currentConfiguration?.secretKey ?? '',
  })

  const restoredConfiguration = snapshot.configuration
    ? {
        ...baseConfiguration,
        ...snapshot.configuration,
        exchange: preserveCurrentApiKeys
          ? currentConfiguration?.exchange ?? snapshot.configuration.exchange
          : snapshot.configuration.exchange,
        apiKey: preserveCurrentApiKeys
          ? currentConfiguration?.apiKey ?? snapshot.configuration.apiKey
          : snapshot.configuration.apiKey,
        secretKey: preserveCurrentApiKeys
          ? currentConfiguration?.secretKey ?? snapshot.configuration.secretKey
          : snapshot.configuration.secretKey,
      }
    : baseConfiguration

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: snapshot.userProfile.name,
        preferences: snapshot.userProfile.preferences,
        lastLogin: snapshot.userProfile.lastLogin ? new Date(snapshot.userProfile.lastLogin) : null,
      },
    })

    await tx.configuration.upsert({
      where: { userId },
      update: restoredConfiguration,
      create: {
        userId,
        ...restoredConfiguration,
      },
    })

    if (snapshot.data.balances.length > 0) {
      await tx.balance.createMany({
        data: snapshot.data.balances.map((entry) => ({
          userId,
          currency: entry.currency,
          available: entry.available,
          reserved: entry.reserved,
          total: entry.total,
          updatedAt: new Date(entry.updatedAt),
        })),
      })
    }

    if (snapshot.data.balanceHistory.length > 0) {
      await tx.balanceHistory.createMany({
        data: snapshot.data.balanceHistory.map((entry) => ({
          userId,
          timestamp: new Date(entry.timestamp),
          totalBrl: entry.totalBrl,
        })),
      })
    }

    if (snapshot.data.bots.length > 0) {
      await tx.bot.createMany({
        data: snapshot.data.bots.map((entry) => ({
          id: botIdMap.get(entry.id)!,
          userId,
          templateId: entry.templateSlug
            ? templateIdBySlug.get(entry.templateSlug) ?? null
            : (entry.templateId && templateIds.has(entry.templateId) ? entry.templateId : null),
          name: entry.name,
          strategyType: entry.strategyType,
          description: entry.description,
          executionMode: entry.executionMode,
          isSystemManaged: entry.isSystemManaged,
          status: entry.status,
          isPaused: entry.isPaused,
          currentPair: entry.currentPair,
          lastAnalysis: entry.lastAnalysis ? new Date(entry.lastAnalysis) : null,
          recommendedAction: entry.recommendedAction,
          confidence: entry.confidence,
          modelVersion: entry.modelVersion,
          modelUrl: entry.modelUrl ? modelUrlMap.get(entry.modelUrl) ?? null : null,
          parameters: entry.parameters,
          createdAt: new Date(entry.createdAt),
        })),
      })
    }

    if (snapshot.data.transactions.length > 0) {
      await tx.transaction.createMany({
        data: snapshot.data.transactions.map((entry) => ({
          id: transactionIdMap.get(entry.id)!,
          userId,
          date: new Date(entry.date),
          pair: entry.pair,
          origin: entry.origin,
          botId: entry.botId ? botIdMap.get(entry.botId) ?? null : null,
          type: entry.type,
          quantity: entry.quantity,
          requestedQuantity: entry.requestedQuantity,
          orderType: entry.orderType,
          price: entry.price,
          total: entry.total,
          fee: entry.fee,
          feeCurrency: entry.feeCurrency,
          feeRateApplied: entry.feeRateApplied,
          feeDiscountSource: entry.feeDiscountSource,
          status: entry.status,
          externalOrderId: entry.externalOrderId,
          externalClientOrderId: entry.externalClientOrderId,
          externalStatus: entry.externalStatus,
          syncedAt: entry.syncedAt ? new Date(entry.syncedAt) : null,
          profitBrl: entry.profitBrl,
          profitPercent: entry.profitPercent,
          createdAt: new Date(entry.createdAt),
        })),
      })
    }

    if (snapshot.data.trainingSessions.length > 0) {
      await tx.trainingSession.createMany({
        data: snapshot.data.trainingSessions.map((entry) => ({
          id: trainingSessionIdMap.get(entry.id)!,
          userId,
          botId: botIdMap.get(entry.botId)!,
          status: entry.status,
          startTime: new Date(entry.startTime),
          endTime: entry.endTime ? new Date(entry.endTime) : null,
          config: rewriteJsonStringReferences(entry.config, jsonRewriteMaps),
          metrics: entry.metrics,
          bestEpoch: entry.bestEpoch,
          bestValLoss: entry.bestValLoss,
          modelUrl: entry.modelUrl ? modelUrlMap.get(entry.modelUrl) ?? null : null,
          createdAt: new Date(entry.createdAt),
        })),
      })
    }

    if (snapshot.data.botModelArtifacts.length > 0) {
      await tx.botModelArtifact.createMany({
        data: snapshot.data.botModelArtifacts.map((entry) => ({
          id: modelArtifactIdMap.get(entry.id)!,
          userId,
          botId: botIdMap.get(entry.botId)!,
          trainingSessionId: entry.trainingSessionId ? trainingSessionIdMap.get(entry.trainingSessionId) ?? null : null,
          modelVersion: entry.modelVersion,
          modelUrl: modelUrlMap.get(entry.modelUrl) ?? entry.modelUrl,
          fingerprint: entry.fingerprint,
          architecture: entry.architecture,
          validationStrategy: entry.validationStrategy,
          forecastHorizonCandles: entry.forecastHorizonCandles,
          governanceRole: entry.governanceRole,
          isActive: entry.isActive,
          notes: entry.notes,
          evaluationSummary: rewriteJsonStringReferences(entry.evaluationSummary, jsonRewriteMaps),
          reproducibilitySummary: rewriteJsonStringReferences(entry.reproducibilitySummary, jsonRewriteMaps),
          promotedAt: entry.promotedAt ? new Date(entry.promotedAt) : null,
          archivedAt: entry.archivedAt ? new Date(entry.archivedAt) : null,
          createdAt: new Date(entry.createdAt),
        })),
      })
    }

    if (snapshot.data.botDecisions.length > 0) {
      await tx.botDecision.createMany({
        data: snapshot.data.botDecisions.map((entry) => ({
          id: decisionIdMap.get(entry.id)!,
          userId,
          botId: botIdMap.get(entry.botId)!,
          pair: entry.pair,
          action: entry.action,
          confidence: entry.confidence,
          reason: entry.reason,
          timeframe: entry.timeframe,
          executionMode: entry.executionMode,
          executionStatus: entry.executionStatus,
          modelVersion: entry.modelVersion,
          modelUrl: entry.modelUrl ? modelUrlMap.get(entry.modelUrl) ?? null : null,
          modelArchitecture: entry.modelArchitecture,
          horizonCandles: entry.horizonCandles,
          buyThresholdPercent: entry.buyThresholdPercent,
          sellThresholdPercent: entry.sellThresholdPercent,
          decisionPrice: entry.decisionPrice,
          requestedQuantity: entry.requestedQuantity,
          executedQuantity: entry.executedQuantity,
          transactionId: entry.transactionId ? transactionIdMap.get(entry.transactionId) ?? null : null,
          slippagePercent: entry.slippagePercent,
          simulatedLatencyMs: entry.simulatedLatencyMs,
          simulatedFillPercent: entry.simulatedFillPercent,
          createdAt: new Date(entry.createdAt),
          dueAt: new Date(entry.dueAt),
          evaluatedAt: entry.evaluatedAt ? new Date(entry.evaluatedAt) : null,
          evaluationStatus: entry.evaluationStatus,
          evaluationPrice: entry.evaluationPrice,
          marketReturnPercent: entry.marketReturnPercent,
          strategyReturnPercent: entry.strategyReturnPercent,
          realizedEdgePercent: entry.realizedEdgePercent,
          actualLabel: entry.actualLabel,
          expectedLabel: entry.expectedLabel,
          isCorrect: entry.isCorrect,
        })),
      })
    }

    if (snapshot.data.logs.length > 0) {
      await tx.log.createMany({
        data: snapshot.data.logs.map((entry) => ({
          userId,
          timestamp: new Date(entry.timestamp),
          level: entry.level,
          module: entry.module,
          message: entry.message,
          details: entry.details,
        })),
      })
    }

    if (snapshot.data.traces.length > 0) {
      await tx.trace.createMany({
        data: snapshot.data.traces.map((entry) => ({
          userId,
          timestamp: new Date(entry.timestamp),
          level: entry.level,
          module: entry.module,
          traceId: entry.traceId,
          parentTraceId: entry.parentTraceId,
          functionName: entry.functionName,
          message: entry.message,
          durationMs: entry.durationMs,
          botId: entry.botId ? botIdMap.get(entry.botId) ?? null : null,
          currentPair: entry.currentPair,
          recommendedAction: entry.recommendedAction,
          confidence: entry.confidence,
          errorFlag: entry.errorFlag,
        })),
      })
    }
  })

  emitDashboardUpdate(userId, {
    scope: 'portfolio',
    reason: 'configuration_backup_restore',
    updatedAt: new Date().toISOString(),
  })
  emitDashboardUpdate(userId, {
    scope: 'bots',
    reason: 'configuration_backup_restore',
    updatedAt: new Date().toISOString(),
  })
  emitOrderUpdated(userId, {
    type: 'restore',
    updatedAt: new Date().toISOString(),
  })
  emitLogNew(userId, {
    type: 'restore',
    updatedAt: new Date().toISOString(),
  })
  emitTraceNew(userId, {
    type: 'restore',
    updatedAt: new Date().toISOString(),
  })

  const restoredRecords = {
    balances: snapshot.data.balances.length,
    balanceHistory: snapshot.data.balanceHistory.length,
    bots: snapshot.data.bots.length,
    transactions: snapshot.data.transactions.length,
    trainingSessions: snapshot.data.trainingSessions.length,
    botModelArtifacts: snapshot.data.botModelArtifacts.length,
    botDecisions: snapshot.data.botDecisions.length,
    logs: snapshot.data.logs.length,
    traces: snapshot.data.traces.length,
  }

  const baseResult: Omit<ConfigurationBackupRestoreResult, 'summary' | 'restoredAt'> = {
    restoredRecords,
    restoredFiles,
    preservedApiKeys: preserveCurrentApiKeys,
  }

  return {
    ...baseResult,
    restoredAt: new Date().toISOString(),
    summary: buildRestoreSummary(baseResult),
  }
}
