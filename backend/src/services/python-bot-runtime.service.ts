import { spawn } from 'child_process'
import path from 'path'

import type { SocialSignal } from './pair-discovery.service'

export type BotRuntimeAction = 'buy' | 'sell' | 'hold'

export interface PythonBotRuntimeInsight {
  specialist: string
  action: BotRuntimeAction
  confidence: number
  reason: string
  indicators: Record<string, number | null>
}

export interface PythonBotRuntimeOpportunity {
  pair: string
  action: BotRuntimeAction
  confidence: number
  price: number
  reason: string
  specialists: PythonBotRuntimeInsight[]
}

export interface PythonBotRuntimeResult {
  timeframe: string
  analyzedPairs: string[]
  primarySpecialist: string
  summary: {
    analyzedPairs: number
    actionablePairs: number
    buySignals: number
    sellSignals: number
    holdSignals: number
  }
  bestOpportunity?: PythonBotRuntimeOpportunity | null
  opportunities: PythonBotRuntimeOpportunity[]
  socialSignals: SocialSignal[]
}

export interface PythonBotCycleRecentExecution {
  pair: string
  action: 'buy' | 'sell'
  executedAt: string
}

export interface PythonBotCyclePosition {
  pair: string
  quantity: number
  averageEntryPrice: number
  currentPrice: number
  pnlPercent: number
  exposureBrl: number
}

export interface PythonBotCycleBalance {
  currency: string
  available: number
  reserved: number
  total: number
}

export interface PythonBotCycleOpenExchangeOrder {
  pair: string
  status: string
  requestedQuantity?: number
  quantity?: number
  externalStatus?: string
}

export interface PythonBotCyclePlanResult {
  analysis: PythonBotRuntimeResult
  plan: PythonBotCyclePlanItem
  plans: PythonBotCyclePlanItem[]
}

export interface PythonBotCyclePlanItem {
  status: 'skipped' | 'suggested' | 'execute'
  reason: string
  pair?: string
  action?: BotRuntimeAction
  confidence?: number
  decisionPrice?: number
  quantity?: number
  isRiskOverride?: boolean
  rank?: number
  source?: 'analysis' | 'risk_override'
  paperSimulation?: {
    requestedQuantity: number
    executedQuantity: number
    executionPrice: number
    slippagePercent: number
    simulatedLatencyMs: number
    simulatedFillPercent: number
  }
}

function resolvePythonExecutable(): string {
  return process.env.PYTHON_BOT_RUNTIME_EXECUTABLE
    || process.env.PYTHON_ML_EXECUTABLE
    || 'python'
}

function resolvePythonRuntimeScriptPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'bots', 'python', 'runtime.py')
}

async function runPythonRuntimeCommand<T>(
  command: 'analyze' | 'cycle',
  payload: Record<string, unknown>,
): Promise<T> {
  const executable = resolvePythonExecutable()
  const scriptPath = resolvePythonRuntimeScriptPath()

  return new Promise<T>((resolve, reject) => {
    const child = spawn(executable, [scriptPath, command], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python bot runtime exited with code ${code}`))
        return
      }

      try {
        resolve(JSON.parse(stdout) as T)
      } catch (error) {
        reject(new Error(`Invalid JSON from python bot runtime: ${String(error)}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`))
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

export async function runPythonBotAnalysis(payload: {
  backend: {
    baseUrl: string
    accessToken: string
    timeoutSeconds?: number
  }
  bot: {
    id: string
    name: string
    strategyType: string
    strategyId: string
    indicatorType?: string
    specialization?: string
    parameters: Record<string, unknown>
    allowedPairs: string[]
    focusPair?: string | null
    currentPair?: string | null
    minSocialScore?: number
    minMentions?: number
    timeframe: string
    modelArtifactPath?: string
  }
  pairLimit?: number
  includeSocialOverlay?: boolean
}): Promise<PythonBotRuntimeResult> {
  return runPythonRuntimeCommand<PythonBotRuntimeResult>('analyze', payload)
}

export async function runPythonBotCycle(payload: {
  backend: {
    baseUrl: string
    accessToken: string
    timeoutSeconds?: number
  }
  bot: {
    id: string
    name: string
    strategyType: string
    strategyId: string
    indicatorType?: string
    specialization?: string
    parameters: Record<string, unknown>
    allowedPairs: string[]
    focusPair?: string | null
    currentPair?: string | null
    minSocialScore?: number
    minMentions?: number
    timeframe: string
    modelArtifactPath?: string
  }
  pairLimit?: number
  includeSocialOverlay?: boolean
  cycle: {
    executionMode: 'paper' | 'semi_auto' | 'full_auto'
    minimumConfidence: number
    maxTradeAmount: number
    maxTradeAmountUnit: string
    riskConfig: Record<string, number>
    balances: PythonBotCycleBalance[]
    openPositions: PythonBotCyclePosition[]
    portfolio: {
      totalPortfolioBrl: number
      totalExposureBrl: number
      openPositionsCount: number
    }
    recentSellTransactions: Array<{
      date: string
      profitBrl: number
    }>
    recentExecutions: PythonBotCycleRecentExecution[]
    tradeCooldownMs: number
    fullAutoBuyBlockReason?: string
    exchangeCredentialsReady: boolean
    openExchangeOrder?: PythonBotCycleOpenExchangeOrder | null
  }
}): Promise<PythonBotCyclePlanResult> {
  return runPythonRuntimeCommand<PythonBotCyclePlanResult>('cycle', payload)
}
