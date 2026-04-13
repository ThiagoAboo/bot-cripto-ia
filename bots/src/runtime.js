const { clamp } = require('./indicators')
const { analyzeSpecialist, resolvePrimarySpecialist } = require('./specialists')

function buildConsensus(primarySpecialist, specialistResults) {
  const votes = {
    buy: 0,
    sell: 0,
    hold: 0,
  }

  specialistResults.forEach((result) => {
    const isPrimary = result.specialist === primarySpecialist
    const weight = isPrimary ? 1 : 0.42
    votes[result.action] += result.confidence * weight
  })

  const buyScore = votes.buy
  const sellScore = votes.sell
  const holdScore = votes.hold
  const conflict = Math.abs(buyScore - sellScore) < 12 && buyScore > 30 && sellScore > 30

  if (conflict) {
    return {
      action: 'hold',
      confidence: Math.round(clamp((holdScore * 0.3) + 46, 0, 100)),
      reason: 'Especialistas divergentes; o ensemble preferiu não agir',
    }
  }

  if (buyScore > sellScore && buyScore >= Math.max(holdScore, 48)) {
    return {
      action: 'buy',
      confidence: Math.round(clamp(buyScore - (sellScore * 0.18), 0, 100)),
      reason: 'Consenso inclinado para compra entre os especialistas ativos',
    }
  }

  if (sellScore > buyScore && sellScore >= Math.max(holdScore, 48)) {
    return {
      action: 'sell',
      confidence: Math.round(clamp(sellScore - (buyScore * 0.18), 0, 100)),
      reason: 'Consenso inclinado para venda entre os especialistas ativos',
    }
  }

  return {
    action: 'hold',
    confidence: Math.round(clamp(Math.max(holdScore, 38), 0, 100)),
    reason: 'Nenhum especialista encontrou sinal forte o suficiente',
  }
}

function createBotAnalysisRuntime() {
  return {
    analyzeBot({ bot, marketSnapshots, includeSocialOverlay = false }) {
      const primarySpecialist = resolvePrimarySpecialist(bot)
      const opportunities = (marketSnapshots || []).map((snapshot) => {
        const specialistResults = [
          analyzeSpecialist(primarySpecialist, snapshot, bot.parameters || {}),
        ]

        if (includeSocialOverlay && snapshot.socialSignal) {
          specialistResults.push(
            analyzeSpecialist('social_discovery', snapshot, {
              ...(bot.parameters || {}),
              minSocialScore: bot.minSocialScore,
              minMentions: bot.minMentions,
            }),
          )
        }

        const consensus = buildConsensus(primarySpecialist, specialistResults)

        return {
          pair: snapshot.pair,
          action: consensus.action,
          confidence: consensus.confidence,
          price: snapshot.currentPrice,
          reason: `${consensus.reason}. ${specialistResults.map((result) => `${result.specialist}: ${result.reason}`).join(' | ')}`,
          specialists: specialistResults,
        }
      })
        .sort((left, right) => {
          if (right.confidence !== left.confidence) {
            return right.confidence - left.confidence
          }

          return left.pair.localeCompare(right.pair, 'en')
        })

      const bestOpportunity = opportunities.find((entry) => entry.action !== 'hold' && entry.confidence >= 55)

      return {
        primarySpecialist,
        opportunities,
        bestOpportunity,
        summary: {
          analyzedPairs: opportunities.length,
          actionablePairs: opportunities.filter((entry) => entry.action !== 'hold').length,
          buySignals: opportunities.filter((entry) => entry.action === 'buy').length,
          sellSignals: opportunities.filter((entry) => entry.action === 'sell').length,
          holdSignals: opportunities.filter((entry) => entry.action === 'hold').length,
        },
      }
    },
  }
}

module.exports = {
  createBotAnalysisRuntime,
}
