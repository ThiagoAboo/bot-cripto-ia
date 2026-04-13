function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getLastValid(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function calculateEmaSeries(values, period) {
  if (!Array.isArray(values) || values.length === 0 || period <= 0) {
    return []
  }

  const multiplier = 2 / (period + 1)
  const result = []
  let previous = null

  values.forEach((value, index) => {
    if (index + 1 < period) {
      result.push(null)
      return
    }

    if (previous === null) {
      previous = average(values.slice(0, period))
      result.push(previous)
      return
    }

    previous = ((value - previous) * multiplier) + previous
    result.push(previous)
  })

  return result
}

function calculateRsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) {
    return null
  }

  let gains = 0
  let losses = 0

  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1]
    if (change >= 0) {
      gains += change
    } else {
      losses += Math.abs(change)
    }
  }

  const averageGain = gains / period
  const averageLoss = losses / period
  if (averageLoss === 0) {
    return 100
  }

  const relativeStrength = averageGain / averageLoss
  return 100 - (100 / (1 + relativeStrength))
}

function calculateMacd(values, fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(values) || values.length < slow + signal) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    }
  }

  const emaFast = calculateEmaSeries(values, fast)
  const emaSlow = calculateEmaSeries(values, slow)
  const macdSeries = values.map((_, index) => {
    if (emaFast[index] === null || emaSlow[index] === null) {
      return null
    }

    return emaFast[index] - emaSlow[index]
  })

  const compactMacd = macdSeries.filter((value) => typeof value === 'number')
  const signalSeries = calculateEmaSeries(compactMacd, signal)
  const signalValue = getLastValid(signalSeries)
  const macdValue = getLastValid(macdSeries)

  if (macdValue === null || signalValue === null) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    }
  }

  return {
    macd: macdValue,
    signal: signalValue,
    histogram: macdValue - signalValue,
  }
}

function standardDeviation(values) {
  const mean = average(values)
  if (mean === null) {
    return null
  }

  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function calculateBollinger(values, period = 20, stdDev = 2) {
  if (!Array.isArray(values) || values.length < period) {
    return {
      upper: null,
      middle: null,
      lower: null,
      deviation: null,
    }
  }

  const window = values.slice(values.length - period)
  const middle = average(window)
  const deviation = standardDeviation(window)
  if (middle === null || deviation === null) {
    return {
      upper: null,
      middle: null,
      lower: null,
      deviation: null,
    }
  }

  return {
    upper: middle + (stdDev * deviation),
    middle,
    lower: middle - (stdDev * deviation),
    deviation,
  }
}

function calculateRateOfChange(values, periods = 6) {
  if (!Array.isArray(values) || values.length <= periods) {
    return null
  }

  const current = values[values.length - 1]
  const previous = values[values.length - 1 - periods]
  if (!previous) {
    return null
  }

  return ((current / previous) - 1) * 100
}

function calculateVolumeRatio(volumes, shortPeriod = 5, longPeriod = 20) {
  if (!Array.isArray(volumes) || volumes.length < Math.max(shortPeriod, longPeriod)) {
    return null
  }

  const recent = average(volumes.slice(volumes.length - shortPeriod))
  const baseline = average(volumes.slice(volumes.length - longPeriod))
  if (recent === null || baseline === null || baseline === 0) {
    return null
  }

  return recent / baseline
}

function calculateSlope(values, lookback = 5) {
  const current = getLastValid(values)
  if (current === null || values.length <= lookback) {
    return null
  }

  const previous = values[values.length - 1 - lookback]
  if (typeof previous !== 'number' || !Number.isFinite(previous)) {
    return null
  }

  return current - previous
}

function calculateZScore(values, period = 20) {
  if (!Array.isArray(values) || values.length < period) {
    return null
  }

  const window = values.slice(values.length - period)
  const mean = average(window)
  const deviation = standardDeviation(window)
  const current = values[values.length - 1]

  if (mean === null || deviation === null || deviation === 0) {
    return null
  }

  return (current - mean) / deviation
}

module.exports = {
  average,
  calculateBollinger,
  calculateEmaSeries,
  calculateMacd,
  calculateRateOfChange,
  calculateRsi,
  calculateSlope,
  calculateVolumeRatio,
  calculateZScore,
  clamp,
  getLastValid,
}
