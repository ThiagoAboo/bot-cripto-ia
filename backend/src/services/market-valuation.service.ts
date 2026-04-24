import { getRateToBrl } from './awesomeapi.service'
import { getSymbolPriceInUsdt } from './binance.service'

const USD_PROXY_STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD'])

async function getUsdBackedRateToBrl(currency: string): Promise<number> {
  try {
    return await getRateToBrl(currency)
  } catch (error) {
    if (!USD_PROXY_STABLECOINS.has(currency) || currency === 'USD') {
      throw error
    }

    return getRateToBrl('USD')
  }
}

export async function getCurrencyRateToBrl(currency: string): Promise<number> {
  const normalizedCurrency = currency.trim().toUpperCase()

  if (normalizedCurrency === 'BRL') {
    return 1
  }

  if (USD_PROXY_STABLECOINS.has(normalizedCurrency)) {
    return getUsdBackedRateToBrl(normalizedCurrency)
  }

  if (['USD', 'EUR', 'BTC', 'ETH'].includes(normalizedCurrency)) {
    return getRateToBrl(normalizedCurrency)
  }

  const usdtToBrl = await getUsdBackedRateToBrl('USDT')
  const assetToUsdt = await getSymbolPriceInUsdt(normalizedCurrency)
  return assetToUsdt * usdtToBrl
}
