import { useMemo, useState } from 'react'
import { AlertTriangle, Download, ShieldCheck, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

import {
  useExportConfigurationBackup,
  useRestoreConfigurationBackup,
} from '../hooks/useConfigurations'
import type {
  ConfigurationBackupRestoreResult,
  ConfigurationBackupSnapshot,
} from '../types/configurations.types'
import { Button } from '../../../shared/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Modal } from '../../../shared/components/ui/Modal'

interface BackupOperationsCardProps {
  onRestoreCompleted?: (result: ConfigurationBackupRestoreResult) => void
}

function formatEntryLabel(key: string): string {
  const labels: Record<string, string> = {
    balances: 'Saldos',
    balanceHistory: 'Histórico de saldo',
    bots: 'Bots',
    transactions: 'Transações',
    trainingSessions: 'Treinamentos',
    botModelArtifacts: 'Artefatos de modelo',
    botDecisions: 'Decisões dos bots',
    logs: 'Logs',
    traces: 'Traces',
    modelFiles: 'Arquivos de modelo',
    uploadFiles: 'Datasets enviados',
    checkpointFiles: 'Checkpoints',
  }

  return labels[key] ?? key
}

function buildSnapshotFilename(exportedAt: string): string {
  const date = new Date(exportedAt)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `bot-cripto-ia-backup_${year}${month}${day}_${hours}${minutes}.json`
}

function downloadSnapshot(snapshot: ConfigurationBackupSnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = buildSnapshotFilename(snapshot.exportedAt)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(objectUrl)
}

export function BackupOperationsCard({ onRestoreCompleted }: BackupOperationsCardProps) {
  const { mutate: exportBackup, isPending: isExporting } = useExportConfigurationBackup()
  const { mutate: restoreBackup, isPending: isRestoring } = useRestoreConfigurationBackup()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preserveCurrentApiKeys, setPreserveCurrentApiKeys] = useState(true)
  const [lastSnapshot, setLastSnapshot] = useState<ConfigurationBackupSnapshot | null>(null)
  const [lastRestoreResult, setLastRestoreResult] = useState<ConfigurationBackupRestoreResult | null>(null)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)

  const restoreEntries = useMemo(() => {
    if (!lastRestoreResult) {
      return []
    }

    return [
      ...Object.entries(lastRestoreResult.restoredRecords),
      ...Object.entries(lastRestoreResult.restoredFiles),
    ].filter(([, count]) => count > 0)
  }, [lastRestoreResult])

  const handleExport = () => {
    exportBackup(undefined, {
      onSuccess: (snapshot) => {
        setLastSnapshot(snapshot)
        downloadSnapshot(snapshot)
      },
    })
  }

  const handleRestore = async () => {
    if (!selectedFile) {
      return
    }

    let snapshot: ConfigurationBackupSnapshot

    try {
      const rawContent = await selectedFile.text()
      snapshot = JSON.parse(rawContent) as ConfigurationBackupSnapshot
    } catch {
      toast.error('O arquivo selecionado não contém um snapshot JSON válido')
      return
    }

    restoreBackup(
      {
        snapshot,
        preserveCurrentApiKeys,
      },
      {
        onSuccess: (result) => {
          setLastRestoreResult(result)
          onRestoreCompleted?.(result)
          setConfirmRestoreOpen(false)
          setSelectedFile(null)
        },
      },
    )
  }

  return (
    <>
      <Card className="border border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="rounded-2xl bg-primary/10 p-3 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            Backup e Restore Operacional
          </CardTitle>
          <CardDescription>
            Exporte um snapshot completo do ambiente do usuário e restaure depois com dados, histórico e arquivos de treinamento.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-[var(--color-text)]">Exportar snapshot</h4>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Gera um arquivo JSON com configurações, bots, paper, histórico, treinos e artefatos do usuário.
                </p>
              </div>

              <Button className="mt-4" onClick={handleExport} disabled={isExporting}>
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? 'Exportando...' : 'Exportar backup'}
              </Button>

              {lastSnapshot && (
                <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-[var(--color-text)]">Último snapshot</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {new Date(lastSnapshot.exportedAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries({
                      ...lastSnapshot.summary.recordCounts,
                      ...lastSnapshot.summary.fileCounts,
                    }).map(([key, count]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2"
                      >
                        <span className="text-[var(--color-text-muted)]">{formatEntryLabel(key)}</span>
                        <span className="font-semibold text-[var(--color-text)]">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-warning/25 bg-warning/5 p-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-[var(--color-text)]">Restaurar snapshot</h4>
                <p className="text-sm text-[var(--color-text-muted)]">
                  A restauração limpa os dados atuais do usuário e recria o estado salvo no arquivo selecionado.
                </p>
              </div>

              <label className="mt-4 flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                <span className="flex items-center gap-2 font-medium text-[var(--color-text)]">
                  <Upload className="h-4 w-4" />
                  Selecionar arquivo de backup
                </span>
                <span>{selectedFile ? selectedFile.name : 'Escolha um arquivo .json exportado pelo sistema'}</span>
                <input
                  className="hidden"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }}
                />
              </label>

              <label className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={preserveCurrentApiKeys}
                  onChange={(event) => setPreserveCurrentApiKeys(event.target.checked)}
                />
                <span className="text-[var(--color-text-muted)]">
                  Preservar as chaves externas atuais ao restaurar. Recomendado quando o snapshot veio de outro ambiente.
                </span>
              </label>

              <Button
                className="mt-4"
                variant="secondary"
                disabled={!selectedFile || isRestoring}
                onClick={() => setConfirmRestoreOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Restaurar backup
              </Button>
            </div>
          </div>

          {lastRestoreResult && (
            <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--color-text)]">Última restauração</h4>
                  <p className="text-sm text-[var(--color-text-muted)]">{lastRestoreResult.summary}</p>
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {new Date(lastRestoreResult.restoredAt).toLocaleString('pt-BR')}
                </span>
              </div>

              {restoreEntries.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {restoreEntries.map(([key, count]) => (
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
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={confirmRestoreOpen}
        onClose={() => (isRestoring ? undefined : setConfirmRestoreOpen(false))}
        title="Confirmar restauração do backup"
        size="md"
        footer={(
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setConfirmRestoreOpen(false)}
              disabled={isRestoring}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={isRestoring}
              onClick={() => {
                void handleRestore()
              }}
            >
              Confirmar restauração
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 text-sm">
          <p className="text-[var(--color-text)]">
            O sistema vai limpar os dados atuais do usuário antes de recriar o estado salvo no snapshot selecionado.
          </p>
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-[var(--color-text)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>Esta ação substitui o estado atual do usuário.</p>
                <p className="text-[var(--color-text-muted)]">
                  Chaves externas atuais: {preserveCurrentApiKeys ? 'serão preservadas' : 'serão sobrescritas pelo snapshot'}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
