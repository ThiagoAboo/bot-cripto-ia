import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Button } from '../../../shared/components/ui/Button'
import { Filter, X, Calendar, Search } from 'lucide-react'
import { LOG_MODULES, LOG_LEVELS } from '../types/logs.types'
import type { LogFilters as LogFiltersType, LogLevel, LogModule } from '../types/logs.types'

interface LogFiltersProps {
  filters: LogFiltersType
  onFiltersChange: (filters: LogFiltersType) => void
  onExport: () => void
  isExporting: boolean
}

export function LogFilters({ filters, onFiltersChange, onExport, isExporting }: LogFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleLevelToggle = (level: LogLevel) => {
    const current = filters.levels || []
    const newLevels = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level]
    onFiltersChange({ ...filters, levels: newLevels.length ? newLevels : undefined, offset: 0 })
  }

  const handleModuleToggle = (module: LogModule) => {
    const current = filters.modules || []
    const newModules = current.includes(module)
      ? current.filter(m => m !== module)
      : [...current, module]
    onFiltersChange({ ...filters, modules: newModules.length ? newModules : undefined, offset: 0 })
  }

  const clearFilters = () => {
    onFiltersChange({
      limit: filters.limit,
      offset: 0,
    })
  }

  const hasActiveFilters = !!(
    (filters.levels && filters.levels.length > 0) ||
    (filters.modules && filters.modules.length > 0) ||
    filters.startDate ||
    filters.endDate ||
    filters.search
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary-500" />
          Filtros
        </CardTitle>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400">
              <X className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Buscar por mensagem..."
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined, offset: 0 })}
            className="pl-9"
          />
        </div>

        <div className="space-y-2">
          <Label>Nível</Label>
          <div className="flex gap-2 flex-wrap">
            {LOG_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => handleLevelToggle(level.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  filters.levels?.includes(level.value)
                    ? `${level.color} bg-opacity-20 bg-current`
                    : 'bg-dark-300 text-gray-400 hover:bg-dark-400'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Módulo</Label>
          <div className="flex gap-2 flex-wrap">
            {LOG_MODULES.map((module) => (
              <button
                key={module.value}
                onClick={() => handleModuleToggle(module.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  filters.modules?.includes(module.value)
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-300 text-gray-400 hover:bg-dark-400'
                }`}
              >
                {module.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1"
        >
          {showAdvanced ? 'Ocultar' : 'Mostrar'} filtros avançados
          <Calendar className="w-3 h-3" />
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dark-300">
            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Input
                type="datetime-local"
                value={filters.startDate || ''}
                onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value || undefined, offset: 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data final</Label>
              <Input
                type="datetime-local"
                value={filters.endDate || ''}
                onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value || undefined, offset: 0 })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}