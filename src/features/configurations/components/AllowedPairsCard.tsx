import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Search, X, Plus, Coins, ChevronDown } from 'lucide-react'
import { useAvailablePairs } from '../hooks/useConfigurations'
import { cn } from '../../../shared/utils/formatters'

interface AllowedPairsCardProps {
  data: string[]
  onChange: (data: string[]) => void
}

export function AllowedPairsCard({ data, onChange }: AllowedPairsCardProps) {
  const [selectedPair, setSelectedPair] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { data: availablePairs, isLoading } = useAvailablePairs()

  const handleAddPair = () => {
    if (selectedPair && !data.includes(selectedPair)) {
      onChange([...data, selectedPair])
      setSelectedPair('')
      setSearchTerm('')
    }
  }

  const handleRemovePair = (pair: string) => {
    onChange(data.filter((p) => p !== pair))
  }

  const handleSelectPair = (value: string) => {
    setSelectedPair(value)
    setIsDropdownOpen(false)
  }

  const filteredPairs = availablePairs?.filter(
    (pair) =>
      !data.includes(pair) &&
      pair.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary-500" />
          Moedas Permitidas
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Selecione as moedas que os bots podem analisar e negociar
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Moedas selecionadas */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Moedas permitidas ({data.length})
          </label>
          <div className="flex flex-wrap gap-2 min-h-[60px] p-3 rounded-lg bg-dark-300 border border-dark-400">
            {data.length === 0 ? (
              <span className="text-sm text-gray-500">
                Nenhuma moeda selecionada. Selecione abaixo.
              </span>
            ) : (
              data.map((pair) => (
                <Badge
                  key={pair}
                  variant="primary"
                  className="flex items-center gap-1 px-2 py-1"
                >
                  {pair}
                  <button
                    onClick={() => handleRemovePair(pair)}
                    className="ml-1 hover:text-error transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Adicionar moeda - Select com lista */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Adicionar moeda
          </label>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between rounded-lg border border-dark-400 bg-dark-300 px-3 py-2 text-sm text-white hover:bg-dark-400 transition-colors"
              >
                <span className={selectedPair ? 'text-white' : 'text-gray-500'}>
                  {selectedPair || 'Selecione uma moeda...'}
                </span>
                <ChevronDown className={cn('w-4 h-4 transition-transform', isDropdownOpen && 'rotate-180')} />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-dark-400 bg-dark-200 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-dark-400">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Buscar moeda..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-dark-300 border border-dark-400 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto">
                    {isLoading ? (
                      <div className="p-4 text-center text-gray-500">
                        Carregando moedas...
                      </div>
                    ) : filteredPairs.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        {searchTerm ? 'Nenhuma moeda encontrada' : 'Todas as moedas já foram selecionadas'}
                      </div>
                    ) : (
                      filteredPairs.map((pair) => (
                        <button
                          key={pair}
                          onClick={() => handleSelectPair(pair)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-white hover:bg-dark-300 transition-colors border-b border-dark-400 last:border-0"
                        >
                          <span>{pair}</span>
                          <Plus className="w-4 h-4 text-primary-500 opacity-0 group-hover:opacity-100" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleAddPair} disabled={!selectedPair} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
          
          <p className="text-xs text-gray-500">
            Selecione uma moeda da lista para adicionar às permitidas
          </p>
        </div>

        {availablePairs && availablePairs.length > 0 && data.length !== availablePairs.length && (
          <Button variant="outline" size="sm" onClick={() => onChange([...availablePairs])} className="w-full">
            Selecionar todas as moedas
          </Button>
        )}

        {data.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])} className="w-full text-error hover:text-error">
            Limpar todas
          </Button>
        )}
      </CardContent>
    </Card>
  )
}