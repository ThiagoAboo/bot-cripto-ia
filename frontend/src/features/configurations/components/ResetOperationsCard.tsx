import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  DatabaseZap,
  Eraser,
  FileClock,
  Layers3,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Wallet,
} from 'lucide-react'

import { useRunConfigurationReset } from '../hooks/useConfigurations'
import type {
  ConfigurationResetResult,
  ConfigurationResetScope,
} from '../types/configurations.types'
import { Button } from '../../../shared/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Modal } from '../../../shared/components/ui/Modal'

interface ResetOperationsCardProps {
  onResetCompleted?: (result: ConfigurationResetResult) => void
}

type ResetAction = {
  scope: ConfigurationResetScope
  label: string
  description: string
  impact: string
  icon: typeof Trash2
  emphasis?: 'high' | 'critical'
}

const RESET_ACTIONS: ResetAction[] = [
  {
    scope: 'logs_traces',
    label: 'Limpar traces/logs',
    description: 'Remove logs, traces e histórico de observabilidade.',
    impact: 'Útil para zerar diagnósticos e análises sem mexer em saldo, treinos ou configurações.',
    icon: FileClock,
  },
  {
    scope: 'cash',
    label: 'Limpar cash',
    description: 'Apaga saldos e histórico de saldo da carteira local.',
    impact: 'Mantém ordens, treinos e configurações, mas zera a visão atual da carteira.',
    icon: Wallet,
  },
  {
    scope: 'transactions',
    label: 'Limpar ordens/transações',
    description: 'Remove o histórico de ordens e execuções.',
    impact: 'Boa opção para reiniciar o histórico operacional sem apagar saldo nem treinos.',
    icon: Trash2,
  },
  {
    scope: 'trainings',
    label: 'Limpar treinamentos',
    description: 'Apaga sessões, checkpoints, uploads e arquivos de modelo do usuário.',
    impact: 'Mantém configurações e bots, mas remove o histórico de treino e artefatos gerados.',
    icon: DatabaseZap,
  },
  {
    scope: 'paper',
    label: 'Limpar paper',
    description: 'Zera decisões, ordens e carteira local e recria o capital inicial do paper.',
    impact: 'É a forma mais direta de recomeçar a validação simulada dos bots.',
    icon: RefreshCcw,
    emphasis: 'high',
  },
  {
    scope: 'bots_runtime',
    label: 'Limpar bots e decisões',
    description: 'Remove decisões avaliadas e reseta o estado operacional dos bots do usuário.',
    impact: 'Mantém modelos e configurações, mas limpa runtime, confiança, último par e placar de paper.',
    icon: Layers3,
  },
  {
    scope: 'all_except_configurations',
    label: 'Limpar todos os dados (mantendo configurações)',
    description: 'Apaga histórico, paper, treinos, bots do usuário e demais dados operacionais.',
    impact: 'Preserva somente a tabela de configurações e o catálogo global seedado do sistema.',
    icon: Eraser,
    emphasis: 'high',
  },
  {
    scope: 'configurations',
    label: 'Limpar configurações',
    description: 'Restaura os parâmetros para o padrão inicial mantendo as chaves externas.',
    impact: 'Reseta risco, pares, descoberta automática, estratégias e opções avançadas.',
    icon: ShieldAlert,
  },
  {
    scope: 'all',
    label: 'Limpar tudo',
    description: 'Executa todas as limpezas, restaura configurações padrão e recria o paper inicial.',
    impact: 'É o reset mais próximo de uma instalação recém-preparada, preservando somente as chaves externas.',
    icon: AlertTriangle,
    emphasis: 'critical',
  },
]

function formatEntryLabel(key: string): string {
  const labels: Record<string, string> = {
    logs: 'Logs',
    traces: 'Traces',
    balances: 'Saldos',
    balanceHistory: 'Histórico de saldo',
    transactions: 'Transações',
    trainingSessions: 'Treinamentos',
    botDecisions: 'Decisões de bots',
    botsRuntimeResets: 'Bots resetados',
    userBots: 'Bots do usuário removidos',
    configurations: 'Configurações resetadas',
    modelFiles: 'Arquivos de modelo',
    uploadFiles: 'Datasets enviados',
    checkpointFiles: 'Checkpoints',
  }

  return labels[key] ?? key
}

export function ResetOperationsCard({ onResetCompleted }: ResetOperationsCardProps) {
  const { mutate: runReset, isPending } = useRunConfigurationReset()
  const [selectedAction, setSelectedAction] = useState<ResetAction | null>(null)
  const [lastResult, setLastResult] = useState<ConfigurationResetResult | null>(null)

  const visibleEntries = useMemo(() => {
    if (!lastResult) {
      return []
    }

    return [
      ...Object.entries(lastResult.deletedRecords),
      ...Object.entries(lastResult.deletedFiles),
    ].filter(([, count]) => count > 0)
  }, [lastResult])

  const handleConfirm = () => {
    if (!selectedAction) {
      return
    }

    runReset(selectedAction.scope, {
      onSuccess: (result) => {
        setLastResult(result)
        onResetCompleted?.(result)
        setSelectedAction(null)
      },
    })
  }

  return (
    <>
      <Card className="border border-error/20 bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="rounded-2xl bg-error/12 p-3 text-error">
              <AlertTriangle className="h-5 w-5" />
            </span>
            Bloco de Reset
          </CardTitle>
          <CardDescription>
            Use essas ações para limpar grupos específicos de dados e voltar o ambiente para um estado controlado sem precisar reinstalar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {RESET_ACTIONS.map((action) => {
              const Icon = action.icon
              const isCritical = action.emphasis === 'critical'
              const isHigh = action.emphasis === 'high'

              return (
                <div
                  key={action.scope}
                  className={[
                    'rounded-2xl border p-4',
                    isCritical
                      ? 'border-error/40 bg-error/5'
                      : isHigh
                        ? 'border-warning/35 bg-warning/5'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[var(--color-text)]">
                        <Icon className="h-4 w-4" />
                        <h4 className="font-semibold">{action.label}</h4>
                      </div>
                      <p className="text-sm text-[var(--color-text)]">{action.description}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{action.impact}</p>
                    </div>
                    <Button
                      variant={isCritical || isHigh ? 'danger' : 'secondary'}
                      size="sm"
                      disabled={isPending}
                      onClick={() => setSelectedAction(action)}
                    >
                      Executar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {lastResult && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--color-text)]">Última operação executada</h4>
                  <p className="text-sm text-[var(--color-text-muted)]">{lastResult.summary}</p>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {new Date(lastResult.executedAt).toLocaleString('pt-BR')}
                </div>
              </div>

              {visibleEntries.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {visibleEntries.map(([key, count]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--color-text-muted)]">{formatEntryLabel(key)}</span>
                      <span className="font-semibold text-[var(--color-text)]">{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {lastResult.paperBalance && (
                <div className="mt-4 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-sm text-[var(--color-text)]">
                  Paper restaurado para {lastResult.paperBalance.amount} {lastResult.paperBalance.currency}.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={selectedAction !== null}
        onClose={() => (isPending ? undefined : setSelectedAction(null))}
        title={selectedAction?.label}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setSelectedAction(null)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={isPending}
              onClick={handleConfirm}
            >
              Confirmar limpeza
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-[var(--color-text)]">
            {selectedAction?.description}
          </p>
          <p className="text-[var(--color-text-muted)]">
            {selectedAction?.impact}
          </p>
          <div className="rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-[var(--color-text)]">
            Esta ação não pode ser desfeita. Revise antes de continuar.
          </div>
        </div>
      </Modal>
    </>
  )
}
