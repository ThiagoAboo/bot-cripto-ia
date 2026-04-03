import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Switch } from '../../../shared/components/ui/Switch'
import { Button } from '../../../shared/components/ui/Button'
import { ChevronDown, ChevronRight, Brain, TrendingUp, Activity, Repeat, Target, Zap } from 'lucide-react'
import { cn } from '../../../shared/utils/formatters'
import type { StrategyConfig, ScalperParams, MomentumParams, TrendFollowerParams, MeanReversionParams, ArbitrageParams } from '../types/configurations.types'

interface StrategiesConfigCardProps {
  data: StrategyConfig[]
  onChange: (data: StrategyConfig[]) => void
}

const strategyIcons = {
  scalper: { icon: Zap, color: 'text-yellow-500', label: 'Scalper' },
  momentum: { icon: TrendingUp, color: 'text-green-500', label: 'Momentum' },
  trend_follower: { icon: Activity, color: 'text-blue-500', label: 'Trend Follower' },
  mean_reversion: { icon: Target, color: 'text-purple-500', label: 'Mean Reversion' },
  arbitrage: { icon: Repeat, color: 'text-cyan-500', label: 'Arbitrage' },
}

export function StrategiesConfigCard({ data, onChange }: StrategiesConfigCardProps) {
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null)

  const handleToggleActive = (id: string, isActive: boolean) => {
    onChange(data.map(s => s.id === id ? { ...s, isActive } : s))
  }

  const handleParameterChange = (id: string, parameters: Record<string, any>) => {
    onChange(data.map(s => s.id === id ? { ...s, parameters } : s))
  }

  const renderParameters = (strategy: StrategyConfig) => {
    switch (strategy.strategyType) {
      case 'scalper':
        const scalperParams = strategy.parameters as ScalperParams
        return (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">Timeframe</Label>
              <select
                value={scalperParams.timeframe}
                onChange={(e) => handleParameterChange(strategy.id, { ...scalperParams, timeframe: e.target.value })}
                className="w-full mt-1 rounded-lg border border-dark-300 bg-dark-300 px-2 py-1 text-sm"
              >
                <option value="1m">1 minuto</option>
                <option value="5m">5 minutos</option>
                <option value="15m">15 minutos</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Spread máximo (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={scalperParams.maxSpread}
                onChange={(e) => handleParameterChange(strategy.id, { ...scalperParams, maxSpread: parseFloat(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Volume mínimo</Label>
              <Input
                type="number"
                value={scalperParams.minVolume}
                onChange={(e) => handleParameterChange(strategy.id, { ...scalperParams, minVolume: parseFloat(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
        )

      case 'momentum':
        const momentumParams = strategy.parameters as MomentumParams
        return (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">Período</Label>
              <Input
                type="number"
                value={momentumParams.period}
                onChange={(e) => handleParameterChange(strategy.id, { ...momentumParams, period: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Threshold</Label>
              <Input
                type="number"
                step="0.1"
                value={momentumParams.threshold}
                onChange={(e) => handleParameterChange(strategy.id, { ...momentumParams, threshold: parseFloat(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">RSI Período</Label>
              <Input
                type="number"
                value={momentumParams.rsiPeriod}
                onChange={(e) => handleParameterChange(strategy.id, { ...momentumParams, rsiPeriod: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
        )

      case 'trend_follower':
        const trendParams = strategy.parameters as TrendFollowerParams
        return (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">EMA Rápida</Label>
              <Input
                type="number"
                value={trendParams.fastEma}
                onChange={(e) => handleParameterChange(strategy.id, { ...trendParams, fastEma: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">EMA Lenta</Label>
              <Input
                type="number"
                value={trendParams.slowEma}
                onChange={(e) => handleParameterChange(strategy.id, { ...trendParams, slowEma: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">ADX Threshold</Label>
              <Input
                type="number"
                value={trendParams.adxThreshold}
                onChange={(e) => handleParameterChange(strategy.id, { ...trendParams, adxThreshold: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
        )

      case 'mean_reversion':
        const reversionParams = strategy.parameters as MeanReversionParams
        return (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">BB Período</Label>
              <Input
                type="number"
                value={reversionParams.bbPeriod}
                onChange={(e) => handleParameterChange(strategy.id, { ...reversionParams, bbPeriod: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">BB Desvio</Label>
              <Input
                type="number"
                step="0.1"
                value={reversionParams.bbStdDev}
                onChange={(e) => handleParameterChange(strategy.id, { ...reversionParams, bbStdDev: parseFloat(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">RSI Superior</Label>
              <Input
                type="number"
                value={reversionParams.rsiUpper}
                onChange={(e) => handleParameterChange(strategy.id, { ...reversionParams, rsiUpper: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">RSI Inferior</Label>
              <Input
                type="number"
                value={reversionParams.rsiLower}
                onChange={(e) => handleParameterChange(strategy.id, { ...reversionParams, rsiLower: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
        )

      case 'arbitrage':
        const arbitrageParams = strategy.parameters as ArbitrageParams
        return (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">Spread mínimo (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={arbitrageParams.minSpreadPercent}
                onChange={(e) => handleParameterChange(strategy.id, { ...arbitrageParams, minSpreadPercent: parseFloat(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Latência máxima (ms)</Label>
              <Input
                type="number"
                value={arbitrageParams.maxLatencyMs}
                onChange={(e) => handleParameterChange(strategy.id, { ...arbitrageParams, maxLatencyMs: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary-500" />
          Configuração por Estratégia
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Configure os parâmetros específicos de cada estratégia de análise
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {data.map((strategy) => {
          const Icon = strategyIcons[strategy.strategyType].icon
          const iconColor = strategyIcons[strategy.strategyType].color
          const isExpanded = expandedStrategy === strategy.id
          
          return (
            <div
              key={strategy.id}
              className={cn(
                'rounded-lg border transition-all duration-200',
                strategy.isActive ? 'border-primary-500/30 bg-dark-300/50' : 'border-dark-300 bg-dark-300/30 opacity-70'
              )}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpandedStrategy(isExpanded ? null : strategy.id)}
                    className="p-1 hover:bg-dark-400 rounded"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <Icon className={cn('w-5 h-5', iconColor)} />
                  <div>
                    <h4 className="font-medium text-white">{strategy.name}</h4>
                    <p className="text-xs text-gray-500">{strategyIcons[strategy.strategyType].label}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {strategy.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                  <Switch
                    checked={strategy.isActive}
                    onCheckedChange={(checked) => handleToggleActive(strategy.id, checked)}
                  />
                </div>
              </div>
              
              {isExpanded && (
                <div className="border-t border-dark-300 p-3">
                  {renderParameters(strategy)}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}