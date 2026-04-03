import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Percent, Coins, Wallet } from 'lucide-react'
import type { FeesConfig } from '../types/configurations.types'

interface FeesCardProps {
  data: FeesConfig
  onChange: (data: FeesConfig) => void
}

export function FeesCard({ data, onChange }: FeesCardProps) {
  const handleChange = (field: keyof FeesConfig, value: number) => {
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
              onChange={(e) => handleChange('discountUsdtPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Percentual da taxa de trading paga com USDT
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
              onChange={(e) => handleChange('discountBnbPercent', parseFloat(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Percentual da taxa com desconto em BNB
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
            onChange={(e) => handleChange('minBnbBalance', parseFloat(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Quantidade mínima de BNB mantida como reserva
          </p>
        </div>
      </CardContent>
    </Card>
  )
}