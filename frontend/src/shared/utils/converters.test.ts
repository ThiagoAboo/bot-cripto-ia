import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDataMock } = vi.hoisted(() => ({
  getDataMock: vi.fn(),
}))

vi.mock('../services/api.client', () => ({
  apiClient: {
    getData: getDataMock,
  },
}))

import { brlToUsdt, convertCurrency, convertWithRate, usdtToBrl } from './converters'

describe('converters', () => {
  beforeEach(() => {
    getDataMock.mockReset()
  })

  it('busca a cotação real pela API e reutiliza cache para a mesma conversão', async () => {
    getDataMock.mockResolvedValue({
      from: 'BTC',
      to: 'BRL',
      rate: 350000,
      lastUpdate: '2026-04-19T12:00:00.000Z',
    })

    const first = await convertCurrency(0.5, 'BTC', 'BRL')
    const second = await convertCurrency(1, 'BTC', 'BRL')

    expect(first).toBe(175000)
    expect(second).toBe(350000)
    expect(getDataMock).toHaveBeenCalledTimes(1)
    expect(getDataMock).toHaveBeenCalledWith('/exchange/rate?from=BTC&to=BRL')
  })

  it('mantem helpers direcionais apoiados na mesma API real', async () => {
    getDataMock
      .mockResolvedValueOnce({
        from: 'USDT',
        to: 'BRL',
        rate: 5.2,
        lastUpdate: '2026-04-19T12:00:00.000Z',
      })
      .mockResolvedValueOnce({
        from: 'BRL',
        to: 'USDT',
        rate: 0.1923,
        lastUpdate: '2026-04-19T12:00:00.000Z',
      })

    await expect(usdtToBrl(10)).resolves.toBe(52)
    await expect(brlToUsdt(52)).resolves.toBeCloseTo(9.9996, 4)
  })

  it('faz fallback para o valor original se a cotação falhar', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getDataMock.mockRejectedValue(new Error('network down'))

    await expect(convertCurrency(25, 'EUR', 'USDT')).resolves.toBe(25)
    expect(getDataMock).toHaveBeenCalledWith('/exchange/rate?from=EUR&to=USDT')

    consoleErrorSpy.mockRestore()
  })

  it('ainda suporta conversão direta com taxa já conhecida', () => {
    expect(convertWithRate(100, 5.1)).toBeCloseTo(510, 10)
  })
})
