import { getRateToBrl } from './awesomeapi.service'
import { getSymbolPriceInUsdt } from './binance.service'

export async function getCurrencyRateToBrl(currency: string): Promise<number> {
  const normalizedCurrency = currency.trim().toUpperCase()

  if (normalizedCurrency === 'BRL') {
    return 1
  }

  if (['USDT', 'EUR', 'BTC', 'ETH'].includes(normalizedCurrency)) {
    return getRateToBrl(normalizedCurrency)
  }

  const usdtToBrl = await getRateToBrl('USDT')
  const assetToUsdt = await getSymbolPriceInUsdt(normalizedCurrency)
  return assetToUsdt * usdtToBrl
}
