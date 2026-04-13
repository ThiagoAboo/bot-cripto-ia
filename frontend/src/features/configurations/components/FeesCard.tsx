import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Switch } from '../../../shared/components/ui/Switch'
import { Percent, Coins, Wallet } from 'lucide-react'
import type { FeesConfig } from '../types/configurations.types'

interface FeesCardProps {
  data: FeesConfig
  onChange: (data: FeesConfig) => void
}

export function FeesCard({ data, onChange }: FeesCardProps) {
  const handleNumberChange = (field: keyof FeesConfig, value: number) => {
    onChange({ ...data, [field]: value })
  }

  const handleToggle = (field: keyof FeesConfig, value: boolean) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-primary-500" />
          Taxas e Descontos
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border border-dark-400 bg-dark-300 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Usar BNB para taxas</p>
              <p className="text-xs text-gray-500">
                Prioriza o desconto da Binance quando houver saldo utilizável em BNB
              </p>
            </div>
            <Switch
              checked={data.useBnbForFees}
              onCheckedChange={(checked) => handleToggle('useBnbForFees', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Preservar reserva mínima de BNB</p>
              <p className="text-xs text-gray-500">
                Impede que trades comuns consumam o saldo reservado para pagamento de taxas
              </p>
            </div>
            <Switch
              checked={data.reserveBnbForFeesEnabled}
              onCheckedChange={(checked) => handleToggle('reserveBnbForFeesEnabled', checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Desconto USDT */}
          <div className="space-y-2">
            <Label htmlFor="discountUsdt" className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary-500" />
              Desconto USDT (%)
            </Label>
            <Input
              id="discountUsdt"
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={data.discountUsdtPercent}
              onChange={(e) => handleNumberChange('discountUsdtPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Desconto aplicado quando a taxa for debitada na moeda cotada em USDT
            </p>
          </div>

          {/* Desconto BNB */}
          <div className="space-y-2">
            <Label htmlFor="discountBnb" className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-warning" />
              Desconto BNB (%)
            </Label>
            <Input
              id="discountBnb"
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={data.discountBnbPercent}
              onChange={(e) => handleNumberChange('discountBnbPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Desconto aplicado quando a taxa for debitada em BNB
            </p>
          </div>
        </div>

        {/* Saldo mínimo BNB */}
        <div className="space-y-2">
          <Label htmlFor="minBnb" className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-success" />
            Saldo mínimo de BNB
          </Label>
          <Input
            id="minBnb"
            type="number"
            step="0.001"
            min="0"
            value={data.minBnbBalance}
            onChange={(e) => handleNumberChange('minBnbBalance', parseFloat(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Quantidade mínima de BNB mantida como reserva
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
