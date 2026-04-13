import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Label } from '../../../shared/components/ui/Label'
import { Input } from '../../../shared/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Brain, Cpu, Layers } from 'lucide-react'
import { ARCHITECTURES } from '../types/training.types'
import type { Architecture, AvailableBot, AvailableStrategy } from '../types/training.types'

interface ModelSelectorProps {
  botId: string
  strategyId: string
  architecture: Architecture
  modelVersion: string
  baseModelId?: string
  availableBots: AvailableBot[]
  availableStrategies: AvailableStrategy[]
  onBotChange: (value: string) => void
  onStrategyChange: (value: string) => void
  onArchitectureChange: (value: Architecture) => void
  onVersionChange: (value: string) => void
}

export function ModelSelector({
  botId,
  strategyId,
  architecture,
  modelVersion,
  availableBots,
  availableStrategies,
  onBotChange,
  onStrategyChange,
  onArchitectureChange,
  onVersionChange,
}: ModelSelectorProps) {
  const selectedArchitecture = ARCHITECTURES.find((item) => item.value === architecture)
  const selectedBot = availableBots.find((item) => item.id === botId)
  const compatibleStrategies = selectedBot
    ? selectedBot.strategyId
      ? availableStrategies.filter((item) => item.id === selectedBot.strategyId)
      : availableStrategies.filter((item) => item.strategyType === selectedBot.strategyType)
    : availableStrategies

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary-500" />
          Seleção do Modelo
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bot alvo */}
          <div className="space-y-2">
            <Label htmlFor="bot">Bot alvo</Label>
            <Select value={botId} onValueChange={onBotChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um bot" />
              </SelectTrigger>
              <SelectContent>
                {availableBots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name} ({bot.indicatorType || bot.strategyType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Bot instanciado que receberá o modelo treinado
            </p>
            {selectedBot && (
              <p className="text-xs text-gray-500">
                Template: {selectedBot.templateName || selectedBot.name}
                {selectedBot.specialization ? ` · ${selectedBot.specialization}` : ''}
              </p>
            )}
          </div>

          {/* Estratégia */}
          <div className="space-y-2">
            <Label htmlFor="strategy">Estratégia</Label>
            <Select value={strategyId} onValueChange={onStrategyChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma estratégia" />
              </SelectTrigger>
              <SelectContent>
                {compatibleStrategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Template estratégico base para o treinamento
            </p>
            {compatibleStrategies.length > 0 && (
              <p className="text-xs text-gray-500">
                Indicador principal: {compatibleStrategies[0].indicatorType || compatibleStrategies[0].strategyType}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Arquitetura */}
          <div className="space-y-2">
            <Label htmlFor="architecture" className="flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Arquitetura do modelo
            </Label>
            <Select value={architecture} onValueChange={(v) => onArchitectureChange(v as Architecture)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a arquitetura" />
              </SelectTrigger>
              <SelectContent>
                {ARCHITECTURES.map((arch) => (
                  <SelectItem key={arch.value} value={arch.value}>
                    <div>
                      <div>{arch.label}</div>
                      <div className="text-xs text-gray-500">{arch.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedArchitecture && (
              <p className="text-xs text-gray-500">{selectedArchitecture.description}</p>
            )}
          </div>

          {/* Versão do modelo */}
          <div className="space-y-2">
            <Label htmlFor="version" className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Versão do modelo
            </Label>
            <Input
              id="version"
              placeholder="Ex: v1.0.0"
              value={modelVersion}
              onChange={(e) => onVersionChange(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Identificador da versão do modelo
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
