import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Button } from '../../../shared/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Search, Filter, X, Calendar } from 'lucide-react'
import type { OrderFilters, OrderOrigin, OrderStatus } from '../types/transactions.types'
import { useAvailablePairs } from '../hooks/useTransactions'

interface TransactionFiltersProps {
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
}

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'executed', label: 'Executada' },
  { value: 'pending', label: 'Pendente' },
  { value: 'cancelled', label: 'Cancelada' },
]

const typeOptions = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venda' },
]

const originOptions: { value: OrderOrigin; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'bot', label: 'Bot' },
]

export function TransactionFilters({ filters, onFiltersChange }: TransactionFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { data: availablePairs } = useAvailablePairs()

  const handleFilterChange = (key: keyof OrderFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value, page: 1 })
  }

  const clearFilters = () => {
    onFiltersChange({
      page: 1,
      limit: filters.limit,
    })
  }

  const hasActiveFilters = !!(
    filters.pair ||
    filters.search ||
    (filters.types && filters.types.length > 0) ||
    (filters.statuses && filters.statuses.length > 0) ||
    (filters.origins && filters.origins.length > 0) ||
    filters.startDate ||
    filters.endDate
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary-500" />
          Filtros
        </CardTitle>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400">
            <X className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Busca rápida */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Buscar por par ou ID..."
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filtros básicos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Par</Label>
            <Select value={filters.pair || 'all'} onValueChange={(v) => handleFilterChange('pair', v === 'all' ? undefined : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os pares" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pares</SelectItem>
                {availablePairs?.map((pair) => (
                  <SelectItem key={pair} value={pair}>
                    {pair}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="flex gap-2 flex-wrap">
              {typeOptions.map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    const current = filters.types || []
                    const newTypes = current.includes(type.value as any)
                      ? current.filter(t => t !== type.value)
                      : [...current, type.value as any]
                    handleFilterChange('types', newTypes.length ? newTypes : undefined)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    filters.types?.includes(type.value as any)
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-300 text-gray-400 hover:bg-dark-400'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Origem</Label>
            <div className="flex gap-2 flex-wrap">
              {originOptions.map((origin) => (
                <button
                  key={origin.value}
                  onClick={() => {
                    const current = filters.origins || []
                    const newOrigins = current.includes(origin.value)
                      ? current.filter(o => o !== origin.value)
                      : [...current, origin.value]
                    handleFilterChange('origins', newOrigins.length ? newOrigins : undefined)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    filters.origins?.includes(origin.value)
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-300 text-gray-400 hover:bg-dark-400'
                  }`}
                >
                  {origin.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filtros avançados (toggle) */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1"
        >
          {showAdvanced ? 'Ocultar' : 'Mostrar'} filtros avançados
          <Calendar className="w-3 h-3" />
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-dark-300">
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-2 flex-wrap">
                {statusOptions.map((status) => (
                  <button
                    key={status.value}
                    onClick={() => {
                      const current = filters.statuses || []
                      const newStatuses = current.includes(status.value)
                        ? current.filter(s => s !== status.value)
                        : [...current, status.value]
                      handleFilterChange('statuses', newStatuses.length ? newStatuses : undefined)
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      filters.statuses?.includes(status.value)
                        ? 'bg-primary-600 text-white'
                        : 'bg-dark-300 text-gray-400 hover:bg-dark-400'
                    }`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data final</Label>
              <Input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleFilterChange('endDate', e.target.value || undefined)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}