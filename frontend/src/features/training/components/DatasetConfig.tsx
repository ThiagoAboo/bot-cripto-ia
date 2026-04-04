import { useMemo, useState } from 'react'
import { Calendar, ChevronDown, Database, Search, Upload, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Label } from '../../../shared/components/ui/Label'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Checkbox } from '../../../shared/components/ui/Checkbox'
import { useAvailablePairs } from '../hooks/useTraining'
import { TIMEFRAMES, TECHNICAL_INDICATORS } from '../types/training.types'
import { cn } from '../../../shared/utils/formatters'
import type { DataSource, Timeframe } from '../types/training.types'

interface DatasetConfigProps {
  dataSource: DataSource
  startDate: string
  endDate: string
  includedPairs: string[]
  indicators: string[]
  timeframe: Timeframe
  onDataSourceChange: (value: DataSource) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onPairsChange: (value: string[]) => void
  onIndicatorsChange: (value: string[]) => void
  onTimeframeChange: (value: Timeframe) => void
}

const dataSources = [
  { value: 'exchange' as const, label: 'Exchange', icon: Database },
  { value: 'synthetic' as const, label: 'Sintético', icon: Database },
  { value: 'upload' as const, label: 'Upload CSV', icon: Upload },
]

export function DatasetConfig({
  dataSource,
  startDate,
  endDate,
  includedPairs,
  indicators,
  timeframe,
  onDataSourceChange,
  onStartDateChange,
  onEndDateChange,
  onPairsChange,
  onIndicatorsChange,
  onTimeframeChange,
}: DatasetConfigProps) {
  const [isPairsDropdownOpen, setIsPairsDropdownOpen] = useState(false)
  const [pairSearchTerm, setPairSearchTerm] = useState('')

  const { data: availablePairs, isLoading } = useAvailablePairs()

  const filteredPairs = useMemo(
    () =>
      (availablePairs ?? []).filter((pair) =>
        pair.toLowerCase().includes(pairSearchTerm.toLowerCase()),
      ),
    [availablePairs, pairSearchTerm],
  )

  const handleAddPair = (pair: string) => {
    if (!includedPairs.includes(pair)) {
      onPairsChange([...includedPairs, pair])
    }
  }

  const handleRemovePair = (pair: string) => {
    onPairsChange(includedPairs.filter((item) => item !== pair))
  }

  const handleSelectAllPairs = () => {
    if (availablePairs) {
      onPairsChange([...availablePairs])
    }
  }

  const handleClearPairs = () => {
    onPairsChange([])
  }

  const handleToggleIndicator = (indicatorValue: string) => {
    if (indicators.includes(indicatorValue)) {
      onIndicatorsChange(indicators.filter((item) => item !== indicatorValue))
      return
    }

    onIndicatorsChange([...indicators, indicatorValue])
  }

  return (
    <Card variant="hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary-500" />
          Configuração do Dataset
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <Label>Origem dos dados</Label>
          <div className="grid gap-3 md:grid-cols-3">
            {dataSources.map((source) => {
              const Icon = source.icon
              const isSelected = dataSource === source.value

              return (
                <button
                  key={source.value}
                  type="button"
                  onClick={() => onDataSourceChange(source.value)}
                  className={cn(
                    'flex min-h-[76px] items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all',
                    isSelected
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:border-primary-500/30 hover:text-[var(--color-text)]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{source.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data inicial
            </Label>
            <Input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data final
            </Label>
            <Input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Pares incluídos</Label>

          <div className="app-card-muted min-h-[84px] rounded-2xl p-3">
            {includedPairs.length === 0 ? (
              <p className="text-sm text-[var(--color-text-subtle)]">Nenhum par selecionado</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {includedPairs.map((pair) => (
                  <Badge key={pair} variant="primary" className="gap-1 pr-1">
                    {pair}
                    <button
                      type="button"
                      onClick={() => handleRemovePair(pair)}
                      className="rounded-full p-0.5 text-current transition-colors hover:bg-black/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPairsDropdownOpen((current) => !current)}
              className="app-input flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm shadow-sm"
            >
              <span className={pairSearchTerm ? 'text-[var(--color-text)]' : 'text-[var(--color-text-subtle)]'}>
                Adicionar par...
              </span>
              <ChevronDown className={cn('h-4 w-4 text-[var(--color-text-subtle)] transition-transform', isPairsDropdownOpen && 'rotate-180')} />
            </button>

            {isPairsDropdownOpen && (
              <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-2xl">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
                  <input
                    value={pairSearchTerm}
                    onChange={(event) => setPairSearchTerm(event.target.value)}
                    className="app-input h-10 w-full rounded-xl py-2 pl-9 pr-3 text-sm"
                    placeholder="Buscar par..."
                    autoFocus
                  />
                </div>

                <div className="max-h-60 overflow-auto rounded-xl">
                  {isLoading ? (
                    <div className="px-3 py-2 text-sm text-[var(--color-text-subtle)]">Carregando...</div>
                  ) : filteredPairs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--color-text-subtle)]">Nenhum par encontrado</div>
                  ) : (
                    filteredPairs.map((pair) => (
                      <button
                        key={pair}
                        type="button"
                        onClick={() => {
                          handleAddPair(pair)
                          setIsPairsDropdownOpen(false)
                          setPairSearchTerm('')
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
                      >
                        <span>{pair}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={handleSelectAllPairs}>
              Selecionar todos
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearPairs}>
              Limpar todos
            </Button>
          </div>
        </div>

        <div>
          <Label>Resolução temporal</Label>
          <Select value={timeframe} onValueChange={(value) => onTimeframeChange(value as Timeframe)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o intervalo" />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Indicadores técnicos</Label>
          <div className="grid gap-2 md:grid-cols-2">
            {TECHNICAL_INDICATORS.map((indicator) => (
              <Checkbox
                key={indicator.value}
                checked={indicators.includes(indicator.value)}
                label={indicator.label}
                onChange={() => handleToggleIndicator(indicator.value)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
