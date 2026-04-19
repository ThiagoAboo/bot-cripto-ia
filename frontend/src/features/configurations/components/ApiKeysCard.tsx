import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
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
          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <Server className="h-4 w-4 text-primary-500" />
            <span>Binance</span>
          </div>
          <p className="text-xs text-gray-500">
            A integração operacional atual está homologada apenas para Binance.
          </p>
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
