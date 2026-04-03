import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Label } from '../../../shared/components/ui/Label'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Checkbox } from '../../../shared/components/ui/Checkbox'
import { Calendar, Upload, Database, Search, X, ChevronDown } from 'lucide-react'
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

  const handleAddPair = (pair: string) => {
    if (!includedPairs.includes(pair)) {
      onPairsChange([...includedPairs, pair])
    }
  }

  const handleRemovePair = (pair: string) => {
    onPairsChange(includedPairs.filter(p => p !== pair))
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
      onIndicatorsChange(indicators.filter(i => i !== indicatorValue))
    } else {
      onIndicatorsChange([...indicators, indicatorValue])
    }
  }

  const filteredPairs = availablePairs?.filter(
    (pair) => pair.toLowerCase().includes(pairSearchTerm.toLowerCase())
  ) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-500" />
          Configuração do Dataset
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Origem dos dados */}
        <div className="space-y-2">
          <Label>Origem dos dados</Label>
          <div className="flex gap-3">
            <button
              onClick={() => onDataSourceChange('exchange')}
              className={cn(
                'flex-1 p-3 rounded-lg border transition-all',
                dataSource === 'exchange'
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-dark-300 bg-dark-300 text-gray-400 hover:border-dark-400'
              )}
            >
              <Database className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm">Exchange</span>
            </button>
            <button
              onClick={() => onDataSourceChange('synthetic')}
              className={cn(
                'flex-1 p-3 rounded-lg border transition-all',
                dataSource === 'synthetic'
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-dark-300 bg-dark-300 text-gray-400 hover:border-dark-400'
              )}
            >
              <Database className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm">Sintético</span>
            </button>
            <button
              onClick={() => onDataSourceChange('upload')}
              className={cn(
                'flex-1 p-3 rounded-lg border transition-all',
                dataSource === 'upload'
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-dark-300 bg-dark-300 text-gray-400 hover:border-dark-400'
              )}
            >
              <Upload className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm">Upload CSV</span>
            </button>
          </div>
        </div>

        {/* Período de treinamento */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Data inicial
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Data final
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        </div>

        {/* Pares incluídos */}
        <div className="space-y-2">
          <Label>Pares incluídos</Label>
          
          {/* Moedas selecionadas */}
          <div className="flex flex-wrap gap-2 min-h-[50px] p-2 rounded-lg bg-dark-300 border border-dark-400">
            {includedPairs.length === 0 ? (
              <span className="text-sm text-gray-500">Nenhum par selecionado</span>
            ) : (
              includedPairs.map((pair) => (
                <Badge key={pair} variant="primary" className="flex items-center gap-1">
                  {pair}
                  <button onClick={() => handleRemovePair(pair)} className="ml-1 hover:text-error">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>

          {/* Select de pares */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPairsDropdownOpen(!isPairsDropdownOpen)}
              className="w-full flex items-center justify-between rounded-lg border border-dark-400 bg-dark-300 px-3 py-2 text-sm text-white hover:bg-dark-400 transition-colors"
            >
              <span className="text-gray-400">Adicionar par...</span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', isPairsDropdownOpen && 'rotate-180')} />
            </button>

            {isPairsDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-dark-400 bg-dark-200 shadow-xl overflow-hidden">
                <div className="p-2 border-b border-dark-400">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar par..."
                      value={pairSearchTerm}
                      onChange={(e) => setPairSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-dark-300 border border-dark-400 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {isLoading ? (
                    <div className="p-4 text-center text-gray-500">Carregando...</div>
                  ) : filteredPairs.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">Nenhum par encontrado</div>
                  ) : (
                    filteredPairs.map((pair) => (
                      <button
                        key={pair}
                        onClick={() => {
                          handleAddPair(pair)
                          setIsPairsDropdownOpen(false)
                          setPairSearchTerm('')
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-white hover:bg-dark-300 transition-colors border-b border-dark-400 last:border-0"
                      >
                        {pair}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={handleSelectAllPairs}>
              Selecionar todos
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearPairs} className="text-error">
              Limpar todos
            </Button>
          </div>
        </div>

        {/* Resolução temporal */}
        <div className="space-y-2">
          <Label>Resolução temporal</Label>
          <Select value={timeframe} onValueChange={(v) => onTimeframeChange(v as Timeframe)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((tf) => (
                <SelectItem key={tf.value} value={tf.value}>
                  {tf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Indicadores técnicos */}
        <div className="space-y-2">
          <Label>Indicadores técnicos</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 rounded-lg bg-dark-300 border border-dark-400">
            {TECHNICAL_INDICATORS.map((indicator) => (
              <Checkbox
                key={indicator.value}
                label={indicator.label}
                checked={indicators.includes(indicator.value)}
                onChange={() => handleToggleIndicator(indicator.value)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}