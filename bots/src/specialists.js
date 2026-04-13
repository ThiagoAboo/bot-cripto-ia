const {
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
} = require('./indicators')

function normalizeConfidence(value) {
  return Math.round(clamp(value, 0, 100))
}

function createInsight(specialist, action, confidence, reason, indicators) {
  return {
    specialist,
    action,
    confidence: normalizeConfidence(confidence),
    reason,
    indicators,
  }
}

function getSeries(snapshot) {
  const candles = Array.isArray(snapshot?.candles) ? snapshot.candles : []
  return {
    closes: candles.map((entry) => Number(entry.close)),
    volumes: candles.map((entry) => Number(entry.volume)),
    price: typeof snapshot.currentPrice === 'number' ? snapshot.currentPrice : Number(candles[candles.length - 1]?.close ?? 0),
  }
}

function analyzeRsiReversion(snapshot, params) {
  const { closes, price } = getSeries(snapshot)
  const rsiPeriod = Number(params.rsiPeriod ?? 14)
  const rsiOversold = Number(params.rsiOversold ?? params.rsiLower ?? 32)
  const rsiOverbought = Number(params.rsiOverbought ?? params.rsiUpper ?? 68)
  const bbPeriod = Number(params.bbPeriod ?? 20)
  const bbStdDev = Number(params.bbStdDev ?? 2)
  const rsi = calculateRsi(closes, rsiPeriod)
  const bollinger = calculateBollinger(closes, bbPeriod, bbStdDev)

  if (rsi === null || bollinger.lower === null || bollinger.upper === null) {
    return createInsight('rsi_reversion', 'hold', 28, 'Dados insuficientes para RSI/Bollinger', {
      rsi,
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
    })
  }

  if (price <= bollinger.lower && rsi <= rsiOversold) {
    const confidence = 58 + ((rsiOversold - rsi) * 1.1) + (((bollinger.lower - price) / bollinger.lower) * 1000)
    return createInsight('rsi_reversion', 'buy', confidence, 'Preço pressionado abaixo da banda inferior com RSI em sobrevenda', {
      rsi,
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
    })
  }

  if (price >= bollinger.upper && rsi >= rsiOverbought) {
    const confidence = 58 + ((rsi - rsiOverbought) * 1.1) + (((price - bollinger.upper) / bollinger.upper) * 1000)
    return createInsight('rsi_reversion', 'sell', confidence, 'Preço estendido acima da banda superior com RSI em sobrecompra', {
      rsi,
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
    })
  }

  return createInsight('rsi_reversion', 'hold', 42, 'RSI e bandas de Bollinger ainda sem estresse suficiente para reversão', {
    rsi,
    price,
    bbLower: bollinger.lower,
    bbUpper: bollinger.upper,
  })
}

function analyzeMacdMomentum(snapshot, params) {
  const { closes, volumes, price } = getSeries(snapshot)
  const macd = calculateMacd(closes, Number(params.macdFast ?? 12), Number(params.macdSlow ?? 26), Number(params.macdSignal ?? 9))
  const momentum = calculateRateOfChange(closes, Number(params.lookbackPeriods?.[0] ?? 6))
  const volumeRatio = calculateVolumeRatio(volumes, 5, 20)
  const threshold = Number(params.momentumThreshold ?? 0.75)

  if (macd.macd === null || macd.signal === null || momentum === null) {
    return createInsight('macd_momentum', 'hold', 24, 'Dados insuficientes para MACD/momentum', {
      macd: macd.macd,
      signal: macd.signal,
      histogram: macd.histogram,
      momentum,
      volumeRatio,
      price,
    })
  }

  if (macd.macd > macd.signal && (macd.histogram ?? 0) > 0 && momentum > threshold) {
    const confidence = 55 + ((macd.histogram ?? 0) * 35) + (momentum * 4) + ((volumeRatio ?? 1) * 6)
    return createInsight('macd_momentum', 'buy', confidence, 'Cruzamento positivo de MACD com aceleração e confirmação de volume', {
      macd: macd.macd,
      signal: macd.signal,
      histogram: macd.histogram,
      momentum,
      volumeRatio,
      price,
    })
  }

  if (macd.macd < macd.signal && (macd.histogram ?? 0) < 0 && momentum < -threshold) {
    const confidence = 55 + (Math.abs(macd.histogram ?? 0) * 35) + (Math.abs(momentum) * 4) + ((volumeRatio ?? 1) * 6)
    return createInsight('macd_momentum', 'sell', confidence, 'MACD virou para baixo com perda de ritmo e pressão de saída', {
      macd: macd.macd,
      signal: macd.signal,
      histogram: macd.histogram,
      momentum,
      volumeRatio,
      price,
    })
  }

  return createInsight('macd_momentum', 'hold', 45, 'Momentum ainda sem direção clara apesar do MACD monitorado', {
    macd: macd.macd,
    signal: macd.signal,
    histogram: macd.histogram,
    momentum,
    volumeRatio,
    price,
  })
}

function analyzeEmaTrend(snapshot, params) {
  const { closes, price } = getSeries(snapshot)
  const fastPeriod = Number(params.fastEma ?? 20)
  const slowPeriod = Number(params.slowEma ?? 50)
  const trendPeriod = Number(params.trendEma ?? 200)
  const fastSeries = calculateEmaSeries(closes, fastPeriod)
  const slowSeries = calculateEmaSeries(closes, slowPeriod)
  const trendSeries = calculateEmaSeries(closes, trendPeriod)
  const fast = getLastValid(fastSeries)
  const slow = getLastValid(slowSeries)
  const trend = getLastValid(trendSeries)
  const slope = calculateSlope(fastSeries, 5)

  if (fast === null || slow === null) {
    return createInsight('ema_trend', 'hold', 20, 'Dados insuficientes para estrutura de tendência por EMAs', {
      emaFast: fast,
      emaSlow: slow,
      emaTrend: trend,
      slope,
      price,
    })
  }

  if (price > slow && fast > slow && (slope ?? 0) > 0) {
    const confidence = 56 + (((fast - slow) / slow) * 1200) + ((slope ?? 0) * 40) + (trend && price > trend ? 8 : 0)
    return createInsight('ema_trend', 'buy', confidence, 'Estrutura de alta confirmada por cruzamento e inclinação positiva das EMAs', {
      emaFast: fast,
      emaSlow: slow,
      emaTrend: trend,
      slope,
      price,
    })
  }

  if (price < slow && fast < slow && (slope ?? 0) < 0) {
    const confidence = 56 + (((slow - fast) / Math.max(fast, 1)) * 1200) + (Math.abs(slope ?? 0) * 40) + (trend && price < trend ? 8 : 0)
    return createInsight('ema_trend', 'sell', confidence, 'Estrutura de baixa confirmada por cruzamento e inclinação negativa das EMAs', {
      emaFast: fast,
      emaSlow: slow,
      emaTrend: trend,
      slope,
      price,
    })
  }

  return createInsight('ema_trend', 'hold', 43, 'EMAs ainda em compressão ou transição sem tendência dominante', {
    emaFast: fast,
    emaSlow: slow,
    emaTrend: trend,
    slope,
    price,
  })
}

function analyzeBollingerReversion(snapshot, params) {
  const { closes, price } = getSeries(snapshot)
  const bbPeriod = Number(params.bbPeriod ?? 20)
  const bbStdDev = Number(params.bbStdDev ?? 2)
  const zScoreThreshold = Number(params.zscoreThreshold ?? 1.8)
  const bollinger = calculateBollinger(closes, bbPeriod, bbStdDev)
  const zScore = calculateZScore(closes, bbPeriod)

  if (bollinger.lower === null || bollinger.upper === null || zScore === null) {
    return createInsight('bollinger_reversion', 'hold', 26, 'Dados insuficientes para z-score/Bollinger', {
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
      zScore,
    })
  }

  if (price <= bollinger.lower && zScore <= -zScoreThreshold) {
    const confidence = 54 + (Math.abs(zScore) * 10) + (((bollinger.lower - price) / bollinger.lower) * 900)
    return createInsight('bollinger_reversion', 'buy', confidence, 'Desvio extremo abaixo da média com chance de retorno ao centro da banda', {
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
      zScore,
    })
  }

  if (price >= bollinger.upper && zScore >= zScoreThreshold) {
    const confidence = 54 + (Math.abs(zScore) * 10) + (((price - bollinger.upper) / bollinger.upper) * 900)
    return createInsight('bollinger_reversion', 'sell', confidence, 'Desvio extremo acima da média com pressão para reversão', {
      price,
      bbLower: bollinger.lower,
      bbUpper: bollinger.upper,
      zScore,
    })
  }

  return createInsight('bollinger_reversion', 'hold', 44, 'Preço ainda orbitando a banda média sem afastamento extremo', {
    price,
    bbLower: bollinger.lower,
    bbUpper: bollinger.upper,
    zScore,
  })
}

function analyzeSocialDiscovery(snapshot, params) {
  const { closes, price } = getSeries(snapshot)
  const signal = snapshot.socialSignal
  const momentum = calculateRateOfChange(closes, 6)
  const minMentions = Number(params.minMentions ?? 8)
  const minSocialScore = Number(params.minSocialScore ?? 60)

  if (!signal) {
    return createInsight('social_discovery', 'hold', 18, 'Sem sinal social recente para este ativo', {
      socialScore: null,
      mentions: null,
      sentiment: null,
      momentum,
      price,
    })
  }

  if (signal.sentiment === 'bullish' && signal.score >= minSocialScore && signal.mentions >= minMentions && (momentum ?? 0) >= -0.6) {
    const confidence = 45 + (signal.score * 0.32) + (signal.mentions * 0.4) + Math.max(momentum ?? 0, 0) * 5
    return createInsight('social_discovery', 'buy', confidence, 'Tração social positiva reforçando a priorização do ativo', {
      socialScore: signal.score,
      mentions: signal.mentions,
      sentiment: signal.sentiment,
      momentum,
      price,
    })
  }

  if (signal.sentiment === 'bearish' && signal.score >= minSocialScore && signal.mentions >= minMentions) {
    const confidence = 42 + (signal.score * 0.28) + (signal.mentions * 0.35) + Math.max(-(momentum ?? 0), 0) * 4
    return createInsight('social_discovery', 'sell', confidence, 'Sentimento social adverso sugerindo defesa ou redução de exposição', {
      socialScore: signal.score,
      mentions: signal.mentions,
      sentiment: signal.sentiment,
      momentum,
      price,
    })
  }

  return createInsight('social_discovery', 'hold', 37, 'Sinal social monitorado, porém ainda sem força suficiente para decisão', {
    socialScore: signal.score,
    mentions: signal.mentions,
    sentiment: signal.sentiment,
    momentum,
    price,
  })
}

const SPECIALISTS = {
  rsi_reversion: analyzeRsiReversion,
  macd_momentum: analyzeMacdMomentum,
  ema_trend: analyzeEmaTrend,
  bollinger_reversion: analyzeBollingerReversion,
  social_discovery: analyzeSocialDiscovery,
}

function resolvePrimarySpecialist(bot) {
  const specialization = String(bot?.specialization ?? '').trim().toLowerCase()
  if (specialization && SPECIALISTS[specialization]) {
    return specialization
  }

  const indicatorType = String(bot?.indicatorType ?? '').trim().toLowerCase()
  if (indicatorType.includes('rsi')) {
    return 'rsi_reversion'
  }

  if (indicatorType.includes('macd')) {
    return 'macd_momentum'
  }

  if (indicatorType.includes('ema')) {
    return 'ema_trend'
  }

  if (indicatorType.includes('bollinger')) {
    return 'bollinger_reversion'
  }

  const strategyType = String(bot?.strategyType ?? '').trim().toLowerCase()
  switch (strategyType) {
    case 'momentum':
      return 'macd_momentum'
    case 'trend_follower':
      return 'ema_trend'
    case 'mean_reversion':
      return 'bollinger_reversion'
    default:
      return 'rsi_reversion'
  }
}

function analyzeSpecialist(name, snapshot, params) {
  const specialist = SPECIALISTS[name]
  if (!specialist) {
    return createInsight(name, 'hold', 0, 'Especialista não configurado', {})
  }

  return specialist(snapshot, params)
}

module.exports = {
  analyzeSpecialist,
  resolvePrimarySpecialist,
}
