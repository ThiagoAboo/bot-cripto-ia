import { apiClient } from '../../../shared/services/api.client'
import { logsService } from '../../logs/services/logs.service'
import type {
  BotDetail,
  BotHomologationAnalysisPack,
  BotHistory,
  BotHomologationReport,
  BotListItem,
  BotModelArtifact,
  BotModelCatalog,
  BotTemplateSummary,
  BotWorkerStatus,
  CreateBotPayload,
  UpdateBotPayload,
} from '../types/bots.types'
import type { BotCycleResult } from '../../dashboard/types/dashboard.types'
import type { TraceAnalysisExportPack, TraceFilters } from '../../logs/types/logs.types'

const HOMOLOGATION_BLOCKED_STAGES = [
  'execution_blocked_governance',
  'execution_blocked_open_order',
  'execution_blocked_exchange_filters',
  'execution_invalid_plan',
  'execution_skipped',
] as const

const HOMOLOGATION_CONTEXT_STAGES = [
  'cycle_context_ready',
  'runtime_plan_received',
  'decision_persisted',
] as const

const HOMOLOGATION_RUNTIME_STAGES = [
  'python_cycle_started',
  'python_analysis_started',
  'python_analysis_completed',
  'python_cycle_completed',
  'python_cycle_circuit_breaker',
] as const

async function buildStagePackage(
  botId: string,
  params: { startDate?: string; endDate?: string } | undefined,
  extraFilters: Partial<TraceFilters>,
): Promise<TraceAnalysisExportPack> {
  return logsService.exportTracesForAnalysis({
    botId,
    startDate: params?.startDate,
    endDate: params?.endDate,
    limit: 50,
    offset: 0,
    ...extraFilters,
  })
}

export const botsService = {
  async getBots(): Promise<BotListItem[]> {
    return apiClient.getData('/dashboard/bots')
  },

  async getBotTemplates(): Promise<BotTemplateSummary[]> {
    return apiClient.getData('/dashboard/bots/templates')
  },

  async getBotDetail(botId: string): Promise<BotDetail> {
    return apiClient.getData(`/dashboard/bots/${botId}`)
  },

  async getBotHistory(botId: string): Promise<BotHistory> {
    return apiClient.getData(`/dashboard/bots/${botId}/history`)
  },

  async getBotHomologationReport(
    botId: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<BotHomologationReport> {
    const searchParams = new URLSearchParams()
    if (params?.startDate) searchParams.append('startDate', params.startDate)
    if (params?.endDate) searchParams.append('endDate', params.endDate)
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return apiClient.getData(`/dashboard/bots/${botId}/homologation-report${suffix}`)
  },

  async getBotHomologationAnalysisPack(
    botId: string,
    botName: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<BotHomologationAnalysisPack> {
    const reportPromise = this.getBotHomologationReport(botId, params)
    const incidentsPromise = buildStagePackage(botId, params, { onlyErrors: true })
    const executionResultPromise = buildStagePackage(botId, params, { stage: 'execution_result' })

    const blockedPromises = HOMOLOGATION_BLOCKED_STAGES.map(async (stage) => ({
      key: stage,
      label: stage,
      payload: await buildStagePackage(botId, params, { stage }),
    }))
    const contextPromises = HOMOLOGATION_CONTEXT_STAGES.map(async (stage) => ({
      key: stage,
      label: stage,
      payload: await buildStagePackage(botId, params, { stage }),
    }))
    const runtimePromises = HOMOLOGATION_RUNTIME_STAGES.map(async (stage) => ({
      key: stage,
      label: stage,
      payload: await buildStagePackage(botId, params, { stage }),
    }))

    const [
      report,
      incidents,
      executionResult,
      blocked,
      context,
      runtime,
    ] = await Promise.all([
      reportPromise,
      incidentsPromise,
      executionResultPromise,
      Promise.all(blockedPromises),
      Promise.all(contextPromises),
      Promise.all(runtimePromises),
    ])

    return {
      exportType: 'bot_homologation_pack_v1',
      generatedAt: new Date().toISOString(),
      bot: {
        id: botId,
        name: botName,
      },
      report,
      tracePackages: {
        incidents,
        executionResult,
        blocked: blocked.filter((entry) => entry.payload.summary.totalTraces > 0),
        context: context.filter((entry) => entry.payload.summary.totalTraces > 0),
        runtime: runtime.filter((entry) => entry.payload.summary.totalTraces > 0),
      },
    }
  },

  async getBotModels(botId: string): Promise<BotModelCatalog> {
    return apiClient.getData(`/dashboard/bots/${botId}/models`)
  },

  async getBotWorkerStatus(): Promise<BotWorkerStatus> {
    return apiClient.getData('/dashboard/bots/worker-status')
  },

  async createBot(payload: CreateBotPayload): Promise<BotDetail> {
    return apiClient.postData('/dashboard/bots', payload)
  },

  async updateBot(botId: string, payload: UpdateBotPayload): Promise<BotDetail> {
    return apiClient.putData(`/dashboard/bots/${botId}`, payload)
  },

  async deleteBot(botId: string): Promise<void> {
    await apiClient.delete(`/dashboard/bots/${botId}`)
  },

  async runBotCycle(botId: string): Promise<BotCycleResult> {
    return apiClient.postData(`/dashboard/bots/${botId}/run`, {})
  },

  async promoteBotModel(botId: string, modelId: string, notes?: string): Promise<BotModelArtifact> {
    return apiClient.postData(`/dashboard/bots/${botId}/models/${modelId}/promote`, notes ? { notes } : {})
  },

  async archiveBotModel(botId: string, modelId: string, notes?: string): Promise<BotModelArtifact> {
    return apiClient.postData(`/dashboard/bots/${botId}/models/${modelId}/archive`, notes ? { notes } : {})
  },

  async pauseBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/pause`)
  },

  async resumeBot(botId: string): Promise<void> {
    await apiClient.put(`/dashboard/bots/${botId}/resume`)
  },
}
