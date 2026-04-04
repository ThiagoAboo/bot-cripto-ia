import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Label } from '../../../shared/components/ui/Label'
import { Button } from '../../../shared/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/components/ui/Select'
import { Send, AlertCircle } from 'lucide-react'
import { useCreateOrder, useAvailablePairs } from '../hooks/useTransactions'
import { formatCurrency } from '../../../shared/utils/formatters'

interface ManualOrderFormProps {
  selectedPair: string
  onPairChange: (pair: string) => void
  displayCurrency: string
  exchangeRate?: number
}

export function ManualOrderForm({ selectedPair, onPairChange, displayCurrency, exchangeRate }: ManualOrderFormProps) {
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [orderKind, setOrderKind] = useState<'market' | 'limit'>('market')
  
  const { mutate: createOrder, isPending } = useCreateOrder()
  const { data: availablePairs } = useAvailablePairs()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const order = {
      pair: selectedPair,
      type: orderType,
      quantity: parseFloat(quantity),
      orderType: orderKind,
      price: orderKind === 'limit' ? parseFloat(price) : undefined,
    }
    
    createOrder(order)
    setQuantity('')
    setPrice('')
  }

  const totalValue = parseFloat(quantity) * (orderKind === 'limit' ? parseFloat(price) : 50000)
  const convertedTotal = totalValue * (exchangeRate || 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ordem Manual</CardTitle>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Par */}
          <div className="space-y-2">
            <Label>Par</Label>
            <Select value={selectedPair} onValueChange={onPairChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePairs?.map((pair) => (
                  <SelectItem key={pair} value={pair}>
                    {pair}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo (Compra/Venda) */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOrderType('buy')}
              className={`
                flex-1 py-2 rounded-lg font-medium transition-all
                ${orderType === 'buy' 
                  ? 'bg-success text-white' 
                  : 'bg-dark-300 text-gray-400 hover:bg-dark-400'}
              `}
            >
              COMPRA
            </button>
            <button
              type="button"
              onClick={() => setOrderType('sell')}
              className={`
                flex-1 py-2 rounded-lg font-medium transition-all
                ${orderType === 'sell' 
                  ? 'bg-error text-white' 
                  : 'bg-dark-300 text-gray-400 hover:bg-dark-400'}
              `}
            >
              VENDA
            </button>
          </div>

          {/* Tipo de ordem (Market/Limit) */}
          <div className="space-y-2">
            <Label>Tipo de ordem</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOrderKind('market')}
                className={`
                  flex-1 py-2 rounded-lg text-sm transition-all
                  ${orderKind === 'market' 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-dark-300 text-gray-400 hover:bg-dark-400'}
                `}
              >
                Market
              </button>
              <button
                type="button"
                onClick={() => setOrderKind('limit')}
                className={`
                  flex-1 py-2 rounded-lg text-sm transition-all
                  ${orderKind === 'limit' 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-dark-300 text-gray-400 hover:bg-dark-400'}
                `}
              >
                Limit
              </button>
            </div>
          </div>

          {/* Quantidade */}
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input
              type="number"
              step="0.0001"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          {/* Preço (apenas para Limit) */}
          {orderKind === 'limit' && (
            <div className="space-y-2">
              <Label>Preço ({displayCurrency})</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          )}

          {/* Resumo */}
          {quantity && (
            <div className="p-3 rounded-lg bg-dark-300/50 border border-dark-400">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Valor total:</span>
                <span className="text-white font-medium">
                  {formatCurrency(convertedTotal, displayCurrency)}
                </span>
              </div>
            </div>
          )}

          {/* Aviso */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
            <p className="text-xs text-gray-400">
              Ordens manuais são executadas imediatamente. Verifique os preços antes de confirmar.
            </p>
          </div>

          {/* Botão enviar */}
          <Button type="submit" disabled={isPending || !quantity} className="w-full">
            {isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Ordem
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}