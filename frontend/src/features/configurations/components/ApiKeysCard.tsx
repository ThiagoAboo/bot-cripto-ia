import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Eye, EyeOff, Key, Lock, Server } from 'lucide-react'
import type { ExchangeApiKeys } from '../types/configurations.types'

interface ApiKeysCardProps {
  data: ExchangeApiKeys
  onChange: (data: ExchangeApiKeys) => void
  onTestConnection: () => void
  isTesting: boolean
}

export function ApiKeysCard({ data, onChange, onTestConnection, isTesting }: ApiKeysCardProps) {
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)

  const exchanges = [
    { value: 'binance', label: 'Binance' },
    { value: 'kucoin', label: 'KuCoin' },
    { value: 'bybit', label: 'Bybit' },
  ]

  const handleExchangeChange = (value: string) => {
    onChange({ ...data, exchange: value as ExchangeApiKeys['exchange'] })
  }

  const handleApiKeyChange = (value: string) => {
    onChange({ ...data, apiKey: value })
  }

  const handleSecretKeyChange = (value: string) => {
    onChange({ ...data, secretKey: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5 text-primary-500" />
          Chaves de API
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="exchange">Exchange</Label>
          <Select value={data.exchange} onValueChange={handleExchangeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a exchange" />
            </SelectTrigger>
            <SelectContent>
              {exchanges.map((ex) => (
                <SelectItem key={ex.value} value={ex.value}>
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    {ex.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key</Label>
          <div className="relative">
            <Input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={data.apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Digite sua API Key"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="secretKey">Secret Key</Label>
          <div className="relative">
            <Input
              id="secretKey"
              type={showSecretKey ? 'text' : 'password'}
              value={data.secretKey}
              onChange={(e) => handleSecretKeyChange(e.target.value)}
              placeholder="Digite sua Secret Key"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
            >
              {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onTestConnection}
          disabled={isTesting || !data.apiKey || !data.secretKey}
          className="w-full"
        >
          {isTesting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Testando...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Testar Conexão
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}