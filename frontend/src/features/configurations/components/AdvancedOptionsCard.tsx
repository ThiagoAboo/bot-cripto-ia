import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Settings, Zap, AlertTriangle } from 'lucide-react'
import type { AdvancedOptions } from '../types/configurations.types'

interface AdvancedOptionsCardProps {
  data: AdvancedOptions
  onChange: (data: AdvancedOptions) => void
}

export function AdvancedOptionsCard({ data, onChange }: AdvancedOptionsCardProps) {
  const handleChange = (field: 'orderType' | 'slippagePercent', value: string | number) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-500" />
          Opções Avançadas
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Modo de operação */}
          <div className="space-y-2">
            <Label htmlFor="mode" className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              Modo de operação
            </Label>
            <div
              id="mode"
              className="app-input flex h-11 w-full items-center rounded-xl px-3 text-sm shadow-sm"
            >
              Spot (à vista)
            </div>
            <p className="text-xs text-gray-500">
              O motor operacional atual executa apenas ordens spot. Futuros ainda não fazem parte do fluxo real do produto.
            </p>
          </div>

          {/* Tipo de ordem */}
          <div className="space-y-2">
            <Label htmlFor="orderType">Tipo de ordem</Label>
            <Select value={data.orderType} onValueChange={(value) => handleChange('orderType', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="market">Market (execução imediata)</SelectItem>
                <SelectItem value="limit">Limit (preço definido)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Market: executa ao preço atual | Limit: executa no preço definido
            </p>
          </div>
        </div>

        {/* Slippage tolerado */}
        <div className="space-y-2">
          <Label htmlFor="slippage" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-error" />
            Slippage tolerado (%)
          </Label>
          <Input
            id="slippage"
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={data.slippagePercent}
            onChange={(e) => handleChange('slippagePercent', parseFloat(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Percentual máximo de deslize aceito em ordens market
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
