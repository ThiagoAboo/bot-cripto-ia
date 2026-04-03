import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Shield, TrendingDown, TrendingUp, Gauge, DollarSign } from 'lucide-react'
import type { RiskManagement } from '../types/configurations.types'

interface RiskManagementCardProps {
  data: RiskManagement
  onChange: (data: RiskManagement) => void
}

export function RiskManagementCard({ data, onChange }: RiskManagementCardProps) {
  const handleChange = (field: keyof RiskManagement, value: number | string) => {
    onChange({ ...data, [field]: value })
  }

  const handleUnitChange = (value: 'USDT' | 'percent') => {
    onChange({ ...data, maxTradeAmountUnit: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-500" />
          Gerenciamento de Risco
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stop Loss */}
          <div className="space-y-2">
            <Label htmlFor="stopLoss" className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-error" />
              Stop-loss (%)
            </Label>
            <Input
              id="stopLoss"
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={data.stopLossPercent}
              onChange={(e) => handleChange('stopLossPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Percentual de perda máxima a partir do preço de entrada
            </p>
          </div>

          {/* Take Profit */}
          <div className="space-y-2">
            <Label htmlFor="takeProfit" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              Take-profit (%)
            </Label>
            <Input
              id="takeProfit"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={data.takeProfitPercent}
              onChange={(e) => handleChange('takeProfitPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Percentual de lucro alvo. Encerra quando identificada queda prevista
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Alavancagem */}
          <div className="space-y-2">
            <Label htmlFor="leverage" className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-warning" />
              Alavancagem
            </Label>
            <Input
              id="leverage"
              type="number"
              step="1"
              min="1"
              max="125"
              value={data.leverage}
              onChange={(e) => handleChange('leverage', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Multiplicador de capital (1 = sem alavancagem)
            </p>
          </div>

          {/* Quantidade máxima por trade */}
          <div className="space-y-2">
            <Label htmlFor="maxTrade" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary-500" />
              Quantidade máxima por trade
            </Label>
            <div className="flex gap-2">
              <Input
                id="maxTrade"
                type="number"
                step="100"
                min="0"
                value={data.maxTradeAmount}
                onChange={(e) => handleChange('maxTradeAmount', parseFloat(e.target.value))}
                className="flex-1"
              />
              <Select value={data.maxTradeAmountUnit} onValueChange={handleUnitChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="percent">%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">
              Montante máximo por operação
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}