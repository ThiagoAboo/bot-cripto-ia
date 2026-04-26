import { prisma } from '../config/database'
import {
  buildBotDecisionSummary,
  buildBotPaperReadiness,
  type BotDecisionSummary,
  type BotPaperReadiness,
} from './bot-decision.service'
import {
  resolveBotFullAutoEligibility,
  type BotFullAutoEligibility,
} from './bot-governance-policy.service'
import { parseTraceSnapshot } from '../utils/tracer'

type HomologationVerdictStatus = 'approved' | 'attention' | 'blocked'
type FindingSeverity = 'info' | 'warning' | 'critical'

export interface BotHomologationFinding {
  severity: FindingSeverity
  title: string
  detail: string
}

export interface BotHomologationTraceEntry {
  id: string
  timestamp: string
  level: string
  module: string
  traceId: string
  functionName: string
  message: string
  stage?: string
  durationMs: number
  currentPair?: string
  recommendedAction?: string
  confidence?: number
  errorFlag: boolean
  snapshot?: unknown
}

export interface BotHomologationPairBreakdown {
  pair: string
  decisions: number
  evaluatedDecisions: number
  executedTransactions: number
  errorTraces: number
  accuracyPercent: number
  averageStrategyReturnPercent: number
  averageEdgePercent: number
  profitBrl: number
}

export interface BotHomologationReport {
  botId: string
  generatedAt: string
  period: {
    startDate: string
    endDate: string
    days: number
  }
  verdict: {
    status: HomologationVerdictStatus
    approvedForFullAuto: boolean
    summary: string
    blockers: string[]
  }
  decisionSummary: BotDecisionSummary
  paperReadiness: BotPaperReadiness
  fullAutoEligibility: BotFullAutoEligibility
  executionSummary: {
    totalTransactions: number
    executedTransactions: number
    submittedTransactions: number
    profitableSells: number
    losingSells: number
    averageProfitPercent: number
    totalProfitBrl: number
    averageSlippagePercent: number
    averageSimulatedLatencyMs: number
    averageSimulatedFillPercent: number
    executionStatusBreakdown: Record<string, number>
    executionModeBreakdown: Record<string, number>
  }
  operationalSummary: {
    totalTraces: number
    errorTraces: number
    snapshotCoveragePercent: number
    averageTraceDurationMs: number
    slowestFunctions: Array<{
      functionName: string
      module: string
      count: number
      averageDurationMs: number
      maxDurationMs: number
      errorCount: number
    }>
    stageBreakdown: Array<{
      stage: string
      count: number
      errorCount: number
      averageDurationMs: number
    }>
  }
  pairBreakdown: BotHomologationPairBreakdown[]
  findings: BotHomologationFinding[]
  recentIncidents: BotHomologationTraceEntry[]
  recentSnapshots: BotHomologationTraceEntry[]
  balanceTimeline: Array<{
    timestamp: string
    totalBrl: number
  }>
}

function toFixedNumber(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function average(values: number[], digits: number = 4): number {
  if (values.length === 0) {
    return 0
  }

  return toFixedNumber(values.reduce((sum, value) => sum + value, 0) / values.length, digits)
}

function sum(values: number[], digits: number = 2): number {
  if (values.length === 0) {
    return 0
  }

  return toFixedNumber(values.reduce((total, value) => total + value, 0), digits)
}

function incrementBreakdown(target: Record<string, number>, key: string | null | undefined): void {
  const normalized = key?.trim() || 'unknown'
  target[normalized] = (target[normalized] ?? 0) + 1
}

function buildTraceEntry(trace: {
  id: string
  timestamp: Date
  level: string
  module: string
  traceId: string
  functionName: string
  message: string
  stage: string | null
  snapshot: string | null
  durationMs: number
  currentPair: string | null
  recommendedAction: string | null
  confidence: number | null
  errorFlag: boolean
}): BotHomologationTraceEntry {
  return {
    id: trace.id,
    timestamp: trace.timestamp.toISOString(),
    level: trace.level,
    module: trace.module,
    traceId: trace.traceId,
    functionName: trace.functionName,
    message: trace.message,
    stage: trace.stage ?? undefined,
    durationMs: trace.durationMs,
    currentPair: trace.currentPair ?? undefined,
    recommendedAction: trace.recommendedAction ?? undefined,
    confidence: trace.confidence ?? undefined,
    errorFlag: trace.errorFlag,
    snapshot: parseTraceSnapshot(trace.snapshot),
  }
}

function buildFindings(params: {
  paperReadiness: BotPaperReadiness
  fullAutoEligibility: BotFullAutoEligibility
  errorTraces: number
  totalTraces: number
  submittedTransactions: number
  averageSlippagePercent: number
  averageSimulatedLatencyMs: number
}): BotHomologationFinding[] {
  const findings: BotHomologationFinding[] = []

  for (const blocker of params.paperReadiness.blockers) {
    findings.push({
      severity: 'critical',
      title: 'Bloqueio de paper readiness',
      detail: blocker,
    })
  }

  for (const blocker of params.fullAutoEligibility.blockers) {
    if (findings.some((finding) => finding.detail === blocker)) {
      continue
    }

    findings.push({
      severity: 'critical',
      title: 'Bloqueio de governanca',
      detail: blocker,
    })
  }

  const errorRate = params.totalTraces > 0
    ? (params.errorTraces / params.totalTraces) * 100
    : 0

  if (params.errorTraces > 0) {
    findings.push({
      severity: errorRate >= 15 ? 'critical' : 'warning',
      title: 'Ocorrencias operacionais',
      detail: `${params.errorTraces} trace(s) com erro em ${toFixedNumber(errorRate, 2)}% da janela analisada.`,
    })
  }

  if (params.submittedTransactions > 0) {
    findings.push({
      severity: 'warning',
      title: 'Ordens ainda em acompanhamento',
      detail: `${params.submittedTransactions} ordem(ns) permanecem enviadas ou pendentes de reconciliacao.`,
    })
  }

  if (params.averageSlippagePercent > 0.25) {
    findings.push({
      severity: 'warning',
      title: 'Slippage medio elevado',
      detail: `O slippage medio do periodo esta em ${toFixedNumber(params.averageSlippagePercent, 4)}%.`,
    })
  }

  if (params.averageSimulatedLatencyMs > 600) {
    findings.push({
      severity: 'info',
      title: 'Latencia simulada alta em paper',
      detail: `A latencia media simulada ficou em ${Math.round(params.averageSimulatedLatencyMs)} ms.`,
    })
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'info',
      title: 'Janela estavel',
      detail: 'Nenhum bloqueio adicional foi encontrado alem dos criterios normais de governanca.',
    })
  }

  return findings
}

function buildVerdict(params: {
  paperReadiness: BotPaperReadiness
  fullAutoEligibility: BotFullAutoEligibility
  findings: BotHomologationFinding[]
}): BotHomologationReport['verdict'] {
  const blockers = [
    ...params.paperReadiness.blockers,
    ...params.fullAutoEligibility.blockers,
  ].filter((value, index, collection) => collection.indexOf(value) === index)

  const criticalFindings = params.findings.filter((finding) => finding.severity === 'critical').length
  const warningFindings = params.findings.filter((finding) => finding.severity === 'warning').length
  const approvedForFullAuto = params.paperReadiness.readyForFullAuto && params.fullAutoEligibility.eligible && criticalFindings === 0

  if (approvedForFullAuto) {
    return {
      status: 'approved',
      approvedForFullAuto: true,
      summary: 'O bot atingiu os criterios de paper e nao apresentou bloqueios adicionais para full_auto nesta janela.',
      blockers,
    }
  }

  if (params.paperReadiness.evaluatedSignals > 0 || warningFindings > 0) {
    return {
      status: 'attention',
      approvedForFullAuto: false,
      summary: 'O bot ja gera evidencias suficientes para acompanhamento, mas ainda precisa de ajustes ou mais amostra antes da liberacao.',
      blockers,
    }
  }

  return {
    status: 'blocked',
    approvedForFullAuto: false,
    summary: 'A homologacao ainda nao tem evidencias suficientes ou esta bloqueada por criterios essenciais de governanca e paper.',
    blockers,
  }
}

export async function buildBotHomologationReport(params: {
  userId: string
  botId: string
  startDate: Date
  endDate: Date
}): Promise<BotHomologationReport> {
  const [decisions, transactions, traces, balanceTimeline, fullAutoEligibility] = await Promise.all([
    prisma.botDecision.findMany({
      where: {
        userId: params.userId,
        botId: params.botId,
        createdAt: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        botId: params.botId,
        date: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.trace.findMany({
      where: {
        userId: params.userId,
        botId: params.botId,
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.balanceHistory.findMany({
      where: {
        userId: params.userId,
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
      take: 180,
      select: {
        timestamp: true,
        totalBrl: true,
      },
    }),
    resolveBotFullAutoEligibility({
      userId: params.userId,
      botId: params.botId,
    }),
  ])

  const decisionSummary = buildBotDecisionSummary(decisions)
  const paperReadiness = buildBotPaperReadiness(decisions)

  const executedTransactions = transactions.filter((transaction) => transaction.status === 'executed')
  const submittedTransactions = transactions.filter((transaction) => transaction.status === 'pending' || transaction.status === 'partially_filled')
  const profitableSells = transactions.filter((transaction) => (transaction.profitBrl ?? 0) > 0).length
  const losingSells = transactions.filter((transaction) => (transaction.profitBrl ?? 0) < 0).length
  const executionStatusBreakdown: Record<string, number> = {}
  const executionModeBreakdown: Record<string, number> = {}

  for (const decision of decisions) {
    incrementBreakdown(executionStatusBreakdown, decision.executionStatus)
    incrementBreakdown(executionModeBreakdown, decision.executionMode)
  }

  const parsedTraces = traces.map((trace) => buildTraceEntry(trace))
  const tracesWithSnapshotCount = traces.filter((trace) => Boolean(trace.snapshot)).length
  const recentIncidents = parsedTraces
    .filter((trace) => trace.errorFlag || trace.level === 'ERROR')
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 12)
  const recentSnapshots = parsedTraces
    .filter((trace) => trace.snapshot !== undefined)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 12)

  const traceFunctionMap = new Map<string, {
    functionName: string
    module: string
    count: number
    totalDurationMs: number
    maxDurationMs: number
    errorCount: number
  }>()
  const traceStageMap = new Map<string, {
    stage: string
    count: number
    errorCount: number
    totalDurationMs: number
  }>()

  for (const trace of traces) {
    const functionKey = `${trace.module}:${trace.functionName}`
    const stageKey = trace.stage ?? 'unclassified'
    const functionEntry = traceFunctionMap.get(functionKey) ?? {
      functionName: trace.functionName,
      module: trace.module,
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      errorCount: 0,
    }
    functionEntry.count += 1
    functionEntry.totalDurationMs += trace.durationMs
    functionEntry.maxDurationMs = Math.max(functionEntry.maxDurationMs, trace.durationMs)
    functionEntry.errorCount += trace.errorFlag ? 1 : 0
    traceFunctionMap.set(functionKey, functionEntry)

    const stageEntry = traceStageMap.get(stageKey) ?? {
      stage: stageKey,
      count: 0,
      errorCount: 0,
      totalDurationMs: 0,
    }
    stageEntry.count += 1
    stageEntry.errorCount += trace.errorFlag ? 1 : 0
    stageEntry.totalDurationMs += trace.durationMs
    traceStageMap.set(stageKey, stageEntry)
  }

  const averageSlippagePercent = average(
    decisions
      .map((decision) => decision.slippagePercent)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  )
  const averageSimulatedLatencyMs = average(
    decisions
      .map((decision) => decision.simulatedLatencyMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    2,
  )
  const findings = buildFindings({
    paperReadiness,
    fullAutoEligibility,
    errorTraces: traces.filter((trace) => trace.errorFlag).length,
    totalTraces: traces.length,
    submittedTransactions: submittedTransactions.length,
    averageSlippagePercent,
    averageSimulatedLatencyMs,
  })
  const verdict = buildVerdict({
    paperReadiness,
    fullAutoEligibility,
    findings,
  })

  const pairs = Array.from(new Set([
    ...decisions.map((decision) => decision.pair),
    ...transactions.map((transaction) => transaction.pair),
    ...traces.map((trace) => trace.currentPair).filter((pair): pair is string => Boolean(pair)),
  ]))

  const pairBreakdown = pairs.map((pair) => {
    const pairDecisions = decisions.filter((decision) => decision.pair === pair)
    const pairTransactions = transactions.filter((transaction) => transaction.pair === pair)
    const pairTraces = traces.filter((trace) => trace.currentPair === pair)
    const evaluatedPairDecisions = pairDecisions.filter((decision) => decision.evaluationStatus === 'evaluated')
    const correctPairDecisions = evaluatedPairDecisions.filter((decision) => decision.isCorrect === true).length

    return {
      pair,
      decisions: pairDecisions.length,
      evaluatedDecisions: evaluatedPairDecisions.length,
      executedTransactions: pairTransactions.filter((transaction) => transaction.status === 'executed').length,
      errorTraces: pairTraces.filter((trace) => trace.errorFlag).length,
      accuracyPercent: evaluatedPairDecisions.length > 0
        ? toFixedNumber((correctPairDecisions / evaluatedPairDecisions.length) * 100, 2)
        : 0,
      averageStrategyReturnPercent: average(
        evaluatedPairDecisions
          .map((decision) => decision.strategyReturnPercent)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
      averageEdgePercent: average(
        evaluatedPairDecisions
          .map((decision) => decision.realizedEdgePercent)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
      profitBrl: sum(
        pairTransactions
          .map((transaction) => transaction.profitBrl)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
    }
  }).sort((left, right) => right.profitBrl - left.profitBrl)

  const periodMs = Math.max(1, params.endDate.getTime() - params.startDate.getTime())

  return {
    botId: params.botId,
    generatedAt: new Date().toISOString(),
    period: {
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      days: toFixedNumber(periodMs / 86_400_000, 2),
    },
    verdict,
    decisionSummary,
    paperReadiness,
    fullAutoEligibility,
    executionSummary: {
      totalTransactions: transactions.length,
      executedTransactions: executedTransactions.length,
      submittedTransactions: submittedTransactions.length,
      profitableSells,
      losingSells,
      averageProfitPercent: average(
        transactions
          .map((transaction) => transaction.profitPercent)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
      totalProfitBrl: sum(
        transactions
          .map((transaction) => transaction.profitBrl)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
      averageSlippagePercent,
      averageSimulatedLatencyMs,
      averageSimulatedFillPercent: average(
        decisions
          .map((decision) => decision.simulatedFillPercent)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ),
      executionStatusBreakdown,
      executionModeBreakdown,
    },
    operationalSummary: {
      totalTraces: traces.length,
      errorTraces: traces.filter((trace) => trace.errorFlag).length,
      snapshotCoveragePercent: traces.length > 0
        ? toFixedNumber((tracesWithSnapshotCount / traces.length) * 100, 2)
        : 0,
      averageTraceDurationMs: average(traces.map((trace) => trace.durationMs), 2),
      slowestFunctions: Array.from(traceFunctionMap.values())
        .map((entry) => ({
          functionName: entry.functionName,
          module: entry.module,
          count: entry.count,
          averageDurationMs: toFixedNumber(entry.totalDurationMs / entry.count, 2),
          maxDurationMs: toFixedNumber(entry.maxDurationMs, 2),
          errorCount: entry.errorCount,
        }))
        .sort((left, right) => right.averageDurationMs - left.averageDurationMs)
        .slice(0, 8),
      stageBreakdown: Array.from(traceStageMap.values())
        .map((entry) => ({
          stage: entry.stage,
          count: entry.count,
          errorCount: entry.errorCount,
          averageDurationMs: toFixedNumber(entry.totalDurationMs / entry.count, 2),
        }))
        .sort((left, right) => right.count - left.count),
    },
    pairBreakdown,
    findings,
    recentIncidents,
    recentSnapshots,
    balanceTimeline: balanceTimeline.map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      totalBrl: toFixedNumber(entry.totalBrl, 2),
    })),
  }
}
