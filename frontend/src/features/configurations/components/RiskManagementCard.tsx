import { Shield, TrendingDown, TrendingUp, Gauge, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { FieldLabel } from '../../../shared/components/ui/FieldLabel'
import { Input } from '../../../shared/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import type { RiskManagement } from '../types/configurations.types'

interface RiskManagementCardProps {
  data: RiskManagement
  onChange: (data: RiskManagement) => void
}

export function RiskManagementCard({ data, onChange }: RiskManagementCardProps) {
  const handleChange = (
    field: 'stopLossPercent' | 'takeProfitPercent' | 'maxTradeAmount',
    value: number,
  ) => {
    onChange({ ...data, [field]: value })
  }

  const handleUnitChange = (value: string) => {
    onChange({ ...data, maxTradeAmountUnit: value as 'USDT' | 'percent' })
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-error" />
              <FieldLabel
                htmlFor="stopLoss"
                label="Stop-loss (%)"
                help={{
                  title: 'Stop-loss (%)',
                  description: 'Perda máxima a partir do preço de entrada antes do encerramento automático da posição.',
                  example: '2% significa que uma entrada em 100 pode ser fechada perto de 98.',
                }}
              />
            </div>
            <Input
              id="stopLoss"
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={data.stopLossPercent}
              onChange={(e) => handleChange('stopLossPercent', parseFloat(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <FieldLabel
                htmlFor="takeProfit"
                label="Take-profit (%)"
                help={{
                  title: 'Take-profit (%)',
                  description: 'Alvo principal de saída com lucro. Precisa fazer sentido para o regime da estratégia.',
                  example: '0,8% é mais realista para micro trade do que 10% em ciclos curtos.',
                }}
              />
            </div>
            <Input
              id="takeProfit"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={data.takeProfitPercent}
              onChange={(e) => handleChange('takeProfitPercent', parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-warning" />
              <FieldLabel
                htmlFor="leverage"
                label="Alavancagem"
                help={{
                  title: 'Alavancagem',
                  description: 'Está travada porque o runtime atual só opera no mercado spot.',
                  example: 'Enquanto não houver suporte real a futuros ou margem, ela permanece em 1x.',
                }}
              />
            </div>
            <Input
              id="leverage"
              type="number"
              step="1"
              min="1"
              max="1"
              value={data.leverage}
              readOnly
              disabled
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary-500" />
              <FieldLabel
                htmlFor="maxTrade"
                label="Máx. por trade"
                help={{
                  title: 'Quantidade máxima por trade',
                  description: 'Teto absoluto de capital por operação. O bot não passa desse valor, mesmo com saldo e sinal forte.',
                  example: '150 USDT por trade mantém o paper mais controlado do que expor 500 USDT em cada tentativa.',
                }}
              />
            </div>
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
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
