import { useState } from 'react'
import { Search, X, Plus, Coins, ChevronDown } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { FieldLabel } from '../../../shared/components/ui/FieldLabel'
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
      pair.toLowerCase().includes(searchTerm.toLowerCase()),
  ) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary-500" />
          Moedas Permitidas
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <FieldLabel
            label={`Moedas permitidas (${data.length})`}
            help={{
              title: 'Moedas permitidas',
              description: 'Lista-base de ativos que os bots podem analisar e negociar quando usam a configuração global.',
              example: 'Se você deixar apenas BTC/USDT e ETH/USDT aqui, nenhum bot global vai procurar oportunidade fora dessa lista.',
            }}
          />
          <div className="min-h-[60px] rounded-lg border border-dark-400 bg-dark-300 p-3">
            {data.length === 0 ? (
              <span className="text-sm text-gray-500">
                Nenhuma moeda selecionada. Selecione abaixo.
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.map((pair) => (
                  <Badge
                    key={pair}
                    variant="primary"
                    className="flex items-center gap-1 px-2 py-1"
                  >
                    {pair}
                    <button
                      onClick={() => handleRemovePair(pair)}
                      className="ml-1 transition-colors hover:text-error"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel
            label="Adicionar moeda"
            help={{
              title: 'Adicionar moeda',
              description: 'Inclui um novo par na lista global. Bots que herdam pares globais passam a enxergar esse ativo.',
              example: 'Ao adicionar SOL/USDT aqui, um scalper global pode começar a analisar SOL automaticamente.',
            }}
          />

          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex w-full items-center justify-between rounded-lg border border-dark-400 bg-dark-300 px-3 py-2 text-sm text-white transition-colors hover:bg-dark-400"
              >
                <span className={selectedPair ? 'text-white' : 'text-gray-500'}>
                  {selectedPair || 'Selecione uma moeda...'}
                </span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', isDropdownOpen && 'rotate-180')} />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-dark-400 bg-dark-200 shadow-xl">
                  <div className="border-b border-dark-400 p-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Buscar moeda..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-lg border border-dark-400 bg-dark-300 py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
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
                          className="w-full border-b border-dark-400 px-3 py-2 text-left text-sm text-white transition-colors last:border-0 hover:bg-dark-300"
                        >
                          {pair}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleAddPair} disabled={!selectedPair} className="shrink-0">
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          </div>
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
