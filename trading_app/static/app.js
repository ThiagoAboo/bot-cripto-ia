const state = {
  availableQuoteAssets: [],
  availableSymbols: [],
  selectedSymbols: new Set(),
  dashboard: null,
  refreshTimer: null,
  quoteAsset: "BRL",
  formDirty: false,
  strategyProfiles: {},
};

function formatAsset(value) {
  const amount = Number(value || 0);
  if (state.quoteAsset === "BRL") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return `${amount.toFixed(6)} ${state.quoteAsset}`;
}

function formatOptionalAsset(value) {
  if (value === null || value === undefined) {
    return "--";
  }
  return formatAsset(value);
}

function formatSignedAsset(value) {
  const amount = Number(value || 0);
  if (state.quoteAsset === "BRL") {
    const formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formatted = formatter.format(Math.abs(amount));
    if (amount > 0) {
      return `+${formatted}`;
    }
    if (amount < 0) {
      return `-${formatted}`;
    }
    return formatted;
  }
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${amount.toFixed(6)} ${state.quoteAsset}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined) {
    return "--";
  }
  if (value === "inf") {
    return "Inf";
  }
  return Number(value).toFixed(digits);
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatFeePercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${(Number(value) * 100).toFixed(3)}%`;
}

function formatDate(value) {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("pt-BR");
}

function formatDateParts(value) {
  if (!value) {
    return { date: "--", time: "--" };
  }
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("pt-BR"),
    time: date.toLocaleTimeString("pt-BR"),
  };
}

function formatPriceAsset(value) {
  const amount = Number(value || 0);
  if (state.quoteAsset === "BRL") {
    const absolute = Math.abs(amount);
    let digits = 2;
    if (absolute > 0 && absolute < 0.0001) {
      digits = 8;
    } else if (absolute < 0.01) {
      digits = 8;
    } else if (absolute < 1) {
      digits = 6;
    } else if (absolute < 100) {
      digits = 4;
    }
    return `R$ ${amount.toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }
  return `${amount.toFixed(amount < 1 ? 8 : 6)} ${state.quoteAsset}`;
}

function formatQuantityValue(value) {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount);
  let digits = 6;
  if (absolute >= 1_000_000) {
    digits = 3;
  } else if (absolute >= 1_000) {
    digits = 2;
  } else if (absolute >= 1) {
    digits = 4;
  } else if (absolute > 0 && absolute < 0.01) {
    digits = 8;
  }
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) {
    field.value = value;
  }
}

function toPercentInput(value, digits = 2) {
  return (Number(value || 0) * 100).toFixed(digits);
}

function readNumber(id) {
  return Number(document.getElementById(id).value);
}

function markFormDirty() {
  state.formDirty = true;
}

function clearFormDirty() {
  state.formDirty = false;
}

function toggleConfigHelpModal(shouldOpen) {
  const modal = document.getElementById("config-help-modal");
  if (!modal) {
    return;
  }
  modal.classList.toggle("is-open", shouldOpen);
  modal.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
  document.body.classList.toggle("modal-open", shouldOpen);
}

function focusHelpItem(targetId) {
  const helpItem = document.getElementById(targetId);
  if (!helpItem) {
    return;
  }
  document.querySelectorAll(".help-item.is-focused").forEach((node) => {
    node.classList.remove("is-focused");
  });
  helpItem.classList.add("is-focused");
  window.setTimeout(() => {
    helpItem.classList.remove("is-focused");
  }, 2200);
  helpItem.scrollIntoView({ behavior: "smooth", block: "start" });
}

function nearlyEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.0001;
}

function resolveStrategyProfileSelection() {
  const profiles = state.strategyProfiles || {};
  const buyThreshold = readNumber("buy-threshold");
  const sellThreshold = readNumber("sell-threshold");
  const takeProfitRatio = Math.abs(readNumber("take-profit-percent")) / 100;
  const stopLossRatio = -Math.abs(readNumber("stop-loss-percent")) / 100;
  const maxPositionAge = readNumber("max-position-age-minutes");
  const cooldownAfterLossCycles = readNumber("cooldown-after-loss-cycles");
  const maxPrimaryVolatility = readNumber("max-primary-volatility-percent") / 100;
  const maxDirectionFlipRatio = readNumber("max-direction-flip-ratio-percent") / 100;
  const minVolumeRatio = readNumber("min-volume-ratio");
  const minCandleBodyRatio = readNumber("min-candle-body-ratio-percent") / 100;
  const entryRsiLimit = readNumber("entry-rsi-limit");
  const entrySignalQualityMin = readNumber("entry-signal-quality-min-percent") / 100;
  const rangeEntrySignalQualityMin = readNumber("range-entry-signal-quality-min-percent") / 100;
  const entryConfirmTrendMin = readNumber("entry-confirm-trend-min-percent") / 100;
  const entryConfirmMomentumMin = readNumber("entry-confirm-momentum-min-percent") / 100;
  const breakoutScoreDelta = readNumber("breakout-score-delta");
  const breakoutTrendFastMin = readNumber("breakout-trend-fast-min-percent") / 100;
  const breakoutConfirmTrendMin = readNumber("breakout-confirm-trend-min-percent") / 100;
  const breakoutMomentum15Min = readNumber("breakout-momentum-15-min-percent") / 100;
  const breakoutVolumeRatioMin = readNumber("breakout-volume-ratio-min");
  const breakoutCloseLocationMin = readNumber("breakout-close-location-min-percent") / 100;
  const trendContScoreDelta = readNumber("trend-cont-score-delta");
  const trendContSignalQualityMin = readNumber("trend-cont-signal-quality-min-percent") / 100;
  const trendContConfirmTrendMin = readNumber("trend-cont-confirm-trend-min-percent") / 100;
  const trendContVolumeRatioMin = readNumber("trend-cont-volume-ratio-min");
  const reversalScoreFloor = readNumber("reversal-score-floor");
  const reversalConfirmTrendFloor = readNumber("reversal-confirm-trend-floor-percent") / 100;
  const reversalRsi15mMax = readNumber("reversal-rsi-15m-max");
  const reversalRsi1mMin = readNumber("reversal-rsi-1m-min");
  const reversalRsi1mMax = readNumber("reversal-rsi-1m-max");
  const reversalLowerWickMin = readNumber("reversal-lower-wick-min-percent") / 100;
  const reversalCloseLocationMin = readNumber("reversal-close-location-min-percent") / 100;
  const reversalDistanceFromLowMax = readNumber("reversal-distance-from-low-max-percent") / 100;
  const reversalVolumeRatioMin = readNumber("reversal-volume-ratio-min");
  const reversalSwingWindow = readNumber("reversal-swing-window");
  const minWeaknessExitAgeMinutes = readNumber("min-weakness-exit-age-minutes");

  for (const [profileKey, preset] of Object.entries(profiles)) {
    if (
      nearlyEqual(preset.buy_threshold, buyThreshold)
      && nearlyEqual(preset.sell_threshold, sellThreshold)
      && nearlyEqual(preset.take_profit_ratio, takeProfitRatio)
      && nearlyEqual(preset.stop_loss_ratio, stopLossRatio)
      && Number(preset.max_position_age_minutes) === Number(maxPositionAge)
      && Number(preset.cooldown_after_loss_cycles) === Number(cooldownAfterLossCycles)
      && nearlyEqual(preset.max_primary_volatility, maxPrimaryVolatility)
      && nearlyEqual(preset.max_direction_flip_ratio, maxDirectionFlipRatio)
      && nearlyEqual(preset.min_volume_ratio, minVolumeRatio)
      && nearlyEqual(preset.min_candle_body_ratio, minCandleBodyRatio)
      && nearlyEqual(preset.entry_rsi_limit, entryRsiLimit)
      && nearlyEqual(preset.entry_signal_quality_min, entrySignalQualityMin)
      && nearlyEqual(preset.range_entry_signal_quality_min, rangeEntrySignalQualityMin)
      && nearlyEqual(preset.entry_confirm_trend_min, entryConfirmTrendMin)
      && nearlyEqual(preset.entry_confirm_momentum_min, entryConfirmMomentumMin)
      && nearlyEqual(preset.breakout_score_delta, breakoutScoreDelta)
      && nearlyEqual(preset.breakout_trend_fast_min, breakoutTrendFastMin)
      && nearlyEqual(preset.breakout_confirm_trend_min, breakoutConfirmTrendMin)
      && nearlyEqual(preset.breakout_momentum_15_min, breakoutMomentum15Min)
      && nearlyEqual(preset.breakout_volume_ratio_min, breakoutVolumeRatioMin)
      && nearlyEqual(preset.breakout_close_location_min, breakoutCloseLocationMin)
      && nearlyEqual(preset.trend_cont_score_delta, trendContScoreDelta)
      && nearlyEqual(preset.trend_cont_signal_quality_min, trendContSignalQualityMin)
      && nearlyEqual(preset.trend_cont_confirm_trend_min, trendContConfirmTrendMin)
      && nearlyEqual(preset.trend_cont_volume_ratio_min, trendContVolumeRatioMin)
      && nearlyEqual(preset.reversal_score_floor, reversalScoreFloor)
      && nearlyEqual(preset.reversal_confirm_trend_floor, reversalConfirmTrendFloor)
      && nearlyEqual(preset.reversal_rsi_15m_max, reversalRsi15mMax)
      && nearlyEqual(preset.reversal_rsi_1m_min, reversalRsi1mMin)
      && nearlyEqual(preset.reversal_rsi_1m_max, reversalRsi1mMax)
      && nearlyEqual(preset.reversal_lower_wick_min, reversalLowerWickMin)
      && nearlyEqual(preset.reversal_close_location_min, reversalCloseLocationMin)
      && nearlyEqual(preset.reversal_distance_from_low_max, reversalDistanceFromLowMax)
      && nearlyEqual(preset.reversal_volume_ratio_min, reversalVolumeRatioMin)
      && Number(preset.reversal_swing_window) === Number(reversalSwingWindow)
      && nearlyEqual(preset.min_weakness_exit_age_minutes, minWeaknessExitAgeMinutes)
    ) {
      return profileKey;
    }
  }
  return "customizado";
}

function syncStrategyProfileSelection() {
  setFieldValue("strategy-profile", resolveStrategyProfileSelection());
}

function applyStrategyProfile(profileKey, shouldMarkDirty = true) {
  const preset = state.strategyProfiles?.[profileKey];
  if (!preset) {
    return;
  }
  setFieldValue("buy-threshold", Number(preset.buy_threshold).toFixed(2));
  setFieldValue("sell-threshold", Number(preset.sell_threshold).toFixed(2));
  setFieldValue("take-profit-percent", toPercentInput(preset.take_profit_ratio, 2));
  setFieldValue("stop-loss-percent", Math.abs(Number(preset.stop_loss_ratio || 0) * 100).toFixed(2));
  setFieldValue("max-position-age-minutes", preset.max_position_age_minutes);
  setFieldValue("cooldown-after-loss-cycles", preset.cooldown_after_loss_cycles);
  setFieldValue("max-primary-volatility-percent", toPercentInput(preset.max_primary_volatility, 2));
  setFieldValue(
    "max-direction-flip-ratio-percent",
    toPercentInput(preset.max_direction_flip_ratio, 1)
  );
  setFieldValue("min-volume-ratio", Number(preset.min_volume_ratio).toFixed(2));
  setFieldValue(
    "min-candle-body-ratio-percent",
    toPercentInput(preset.min_candle_body_ratio, 1)
  );
  setFieldValue("entry-rsi-limit", Number(preset.entry_rsi_limit).toFixed(1));
  setFieldValue(
    "entry-signal-quality-min-percent",
    toPercentInput(preset.entry_signal_quality_min, 1)
  );
  setFieldValue(
    "range-entry-signal-quality-min-percent",
    toPercentInput(preset.range_entry_signal_quality_min, 1)
  );
  setFieldValue(
    "entry-confirm-trend-min-percent",
    toPercentInput(preset.entry_confirm_trend_min, 3)
  );
  setFieldValue(
    "entry-confirm-momentum-min-percent",
    toPercentInput(preset.entry_confirm_momentum_min, 2)
  );
  setFieldValue("breakout-score-delta", Number(preset.breakout_score_delta).toFixed(2));
  setFieldValue(
    "breakout-trend-fast-min-percent",
    toPercentInput(preset.breakout_trend_fast_min, 3)
  );
  setFieldValue(
    "breakout-confirm-trend-min-percent",
    toPercentInput(preset.breakout_confirm_trend_min, 3)
  );
  setFieldValue(
    "breakout-momentum-15-min-percent",
    toPercentInput(preset.breakout_momentum_15_min, 2)
  );
  setFieldValue(
    "breakout-volume-ratio-min",
    Number(preset.breakout_volume_ratio_min).toFixed(2)
  );
  setFieldValue(
    "breakout-close-location-min-percent",
    toPercentInput(preset.breakout_close_location_min, 1)
  );
  setFieldValue("trend-cont-score-delta", Number(preset.trend_cont_score_delta).toFixed(2));
  setFieldValue(
    "trend-cont-signal-quality-min-percent",
    toPercentInput(preset.trend_cont_signal_quality_min, 1)
  );
  setFieldValue(
    "trend-cont-confirm-trend-min-percent",
    toPercentInput(preset.trend_cont_confirm_trend_min, 3)
  );
  setFieldValue(
    "trend-cont-volume-ratio-min",
    Number(preset.trend_cont_volume_ratio_min).toFixed(2)
  );
  setFieldValue("reversal-score-floor", Number(preset.reversal_score_floor).toFixed(2));
  setFieldValue(
    "reversal-confirm-trend-floor-percent",
    toPercentInput(preset.reversal_confirm_trend_floor, 3)
  );
  setFieldValue("reversal-rsi-15m-max", Number(preset.reversal_rsi_15m_max).toFixed(1));
  setFieldValue("reversal-rsi-1m-min", Number(preset.reversal_rsi_1m_min).toFixed(1));
  setFieldValue("reversal-rsi-1m-max", Number(preset.reversal_rsi_1m_max).toFixed(1));
  setFieldValue(
    "reversal-lower-wick-min-percent",
    toPercentInput(preset.reversal_lower_wick_min, 1)
  );
  setFieldValue(
    "reversal-close-location-min-percent",
    toPercentInput(preset.reversal_close_location_min, 1)
  );
  setFieldValue(
    "reversal-distance-from-low-max-percent",
    toPercentInput(preset.reversal_distance_from_low_max, 2)
  );
  setFieldValue(
    "reversal-volume-ratio-min",
    Number(preset.reversal_volume_ratio_min).toFixed(2)
  );
  setFieldValue("reversal-swing-window", preset.reversal_swing_window);
  setFieldValue(
    "min-weakness-exit-age-minutes",
    Number(preset.min_weakness_exit_age_minutes).toFixed(1)
  );
  setFieldValue("strategy-profile", profileKey);
  if (shouldMarkDirty) {
    markFormDirty();
  }
}

function buildSettingsPayload(action) {
  return {
    action,
    initial_capital: readNumber("initial-capital"),
    quote_asset: document.getElementById("quote-asset").value,
    fee_rate: readNumber("fee-rate-percent") / 100,
    poll_seconds: readNumber("poll-seconds"),
    trade_size_fraction: readNumber("trade-size-fraction") / 100,
    max_open_positions: readNumber("max-open-positions"),
    min_trade_notional: readNumber("min-trade-notional"),
    primary_kline_interval: document.getElementById("primary-kline-interval").value.trim(),
    primary_kline_limit: readNumber("primary-kline-limit"),
    confirm_kline_interval: document.getElementById("confirm-kline-interval").value.trim(),
    confirm_kline_limit: readNumber("confirm-kline-limit"),
    reversal_kline_interval: document.getElementById("reversal-kline-interval").value.trim(),
    reversal_kline_limit: readNumber("reversal-kline-limit"),
    cycle_history_limit: readNumber("cycle-history-limit"),
    learning_horizon_cycles: readNumber("learning-horizon-cycles"),
    learning_warmup_cycles: readNumber("learning-warmup-cycles"),
    strategy_profile: document.getElementById("strategy-profile").value,
    buy_threshold: readNumber("buy-threshold"),
    sell_threshold: readNumber("sell-threshold"),
    take_profit_ratio: Math.abs(readNumber("take-profit-percent")) / 100,
    stop_loss_ratio: -Math.abs(readNumber("stop-loss-percent")) / 100,
    max_position_age_minutes: readNumber("max-position-age-minutes"),
    cooldown_after_loss_cycles: readNumber("cooldown-after-loss-cycles"),
    max_primary_volatility: readNumber("max-primary-volatility-percent") / 100,
    max_direction_flip_ratio: readNumber("max-direction-flip-ratio-percent") / 100,
    min_volume_ratio: readNumber("min-volume-ratio"),
    min_candle_body_ratio: readNumber("min-candle-body-ratio-percent") / 100,
    entry_rsi_limit: readNumber("entry-rsi-limit"),
    entry_signal_quality_min: readNumber("entry-signal-quality-min-percent") / 100,
    range_entry_signal_quality_min: readNumber("range-entry-signal-quality-min-percent") / 100,
    entry_confirm_trend_min: readNumber("entry-confirm-trend-min-percent") / 100,
    entry_confirm_momentum_min: readNumber("entry-confirm-momentum-min-percent") / 100,
    breakout_score_delta: readNumber("breakout-score-delta"),
    breakout_trend_fast_min: readNumber("breakout-trend-fast-min-percent") / 100,
    breakout_confirm_trend_min: readNumber("breakout-confirm-trend-min-percent") / 100,
    breakout_momentum_15_min: readNumber("breakout-momentum-15-min-percent") / 100,
    breakout_volume_ratio_min: readNumber("breakout-volume-ratio-min"),
    breakout_close_location_min: readNumber("breakout-close-location-min-percent") / 100,
    trend_cont_score_delta: readNumber("trend-cont-score-delta"),
    trend_cont_signal_quality_min: readNumber("trend-cont-signal-quality-min-percent") / 100,
    trend_cont_confirm_trend_min: readNumber("trend-cont-confirm-trend-min-percent") / 100,
    trend_cont_volume_ratio_min: readNumber("trend-cont-volume-ratio-min"),
    reversal_score_floor: readNumber("reversal-score-floor"),
    reversal_confirm_trend_floor: readNumber("reversal-confirm-trend-floor-percent") / 100,
    reversal_rsi_15m_max: readNumber("reversal-rsi-15m-max"),
    reversal_rsi_1m_min: readNumber("reversal-rsi-1m-min"),
    reversal_rsi_1m_max: readNumber("reversal-rsi-1m-max"),
    reversal_lower_wick_min: readNumber("reversal-lower-wick-min-percent") / 100,
    reversal_close_location_min: readNumber("reversal-close-location-min-percent") / 100,
    reversal_distance_from_low_max: readNumber("reversal-distance-from-low-max-percent") / 100,
    reversal_volume_ratio_min: readNumber("reversal-volume-ratio-min"),
    reversal_swing_window: readNumber("reversal-swing-window"),
    min_weakness_exit_age_minutes: readNumber("min-weakness-exit-age-minutes"),
    selected_symbols: Array.from(state.selectedSymbols),
  };
}

function buildSettingsStatusMessage(meta = {}) {
  const action = meta.action || "save";
  let message = "Configuracao salva.";
  if (action === "restart") {
    message = "Configuracao reaplicada mantendo os dados.";
  } else if (action === "reset") {
    message = "Simulador resetado para o default do projeto.";
  }

  if (meta.learning_reset && action !== "reset") {
    message += " O aprendizado foi reiniciado por causa da taxa configurada.";
  }
  if (Number(meta.protected_symbols_added || 0) > 0) {
    message += ` ${meta.protected_symbols_added} moeda(s) com posicao aberta foram mantidas na selecao.`;
  }
  return message;
}

function setStatus(message, isError = false) {
  const target = document.getElementById("status-line");
  target.textContent = message;
  target.className = isError ? "status-line loss" : "status-line";
}

function actionPill(action) {
  const normalized = String(action || "hold").toLowerCase();
  const label = normalized === "buy" ? "compra" : normalized === "sell" ? "venda" : "hold";
  return `<span class="pill pill-${normalized}">${label}</span>`;
}

function updateQuoteAssetLabels() {
  document.querySelectorAll("[data-quote-asset]").forEach((node) => {
    node.textContent = state.quoteAsset;
  });
}

function activateHistoryTab(targetId, description) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.tabTarget === targetId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("is-active", pane.id === targetId);
  });

  const descriptionTarget = document.getElementById("tab-description");
  if (descriptionTarget && description) {
    descriptionTarget.textContent = description;
  }
}

function mountMetrics(metrics, performance, running, learningSummary) {
  const learning = learningSummary || {};
  const metricDefinitions = [
    ["Capital inicial", formatAsset(metrics.initial_capital)],
    ["Saldo total", formatAsset(metrics.total_balance)],
    ["PnL liquido", formatSignedAsset(metrics.net_pnl)],
    ["Caixa livre", formatAsset(metrics.cash_balance)],
    ["PnL realizado", formatSignedAsset(metrics.realized_pnl)],
    ["PnL em aberto", formatSignedAsset(metrics.unrealized_pnl)],
    ["Valor em posicoes", formatAsset(metrics.positions_market_value)],
    ["Posicoes abertas", String(metrics.open_positions)],
    ["Trades fechados", String(performance.closed_trades ?? 0)],
    ["Taxa de acerto", formatPercent(performance.win_rate)],
    ["Profit factor", formatDecimal(performance.profit_factor, 2)],
    ["Taxa por trade", formatFeePercent(state.dashboard?.settings?.fee_rate)],
    ["Ciclos gravados", formatInteger(learning.total_snapshots)],
    ["Ciclos resolvidos", formatInteger(learning.resolved_snapshots)],
    ["Moedas aquecidas", `${formatInteger(learning.warmed_symbols)}/${formatInteger(learning.total_symbols)}`],
    ["Acuracia media IA", formatPercent(learning.avg_accuracy)],
    ["Status", running ? "Rodando" : "Pausado"],
  ];

  document.getElementById("metrics-grid").innerHTML = metricDefinitions
    .map(([label, value]) => {
      const tone = String(label).includes("PnL") && String(value).startsWith("-")
        ? "loss"
        : String(label).includes("PnL") && String(value).startsWith("+")
          ? "gain"
          : "";
      return `
        <article class="metric-card">
          <span>${label}</span>
          <strong class="${tone}">${value}</strong>
        </article>
      `;
    })
    .join("");
}

function mountPositions(positions) {
  const target = document.getElementById("positions-body");
  if (!positions.length) {
    target.innerHTML = `<tr><td colspan="9" class="muted">Nenhum par selecionado para monitoramento no momento.</td></tr>`;
    return;
  }

  const orderedPositions = [...positions].sort((left, right) => {
    const quantityDiff = Number(right.quantity || 0) - Number(left.quantity || 0);
    if (quantityDiff !== 0) {
      return quantityDiff;
    }
    return String(left.symbol || "").localeCompare(String(right.symbol || ""));
  });

  target.innerHTML = orderedPositions
    .map((position) => `
      <tr>
        <td>${position.symbol}</td>
        <td>${Number(position.quantity).toFixed(6)}</td>
        <td>${formatAsset(position.market_price)}</td>
        <td>${formatOptionalAsset(position.buy_price)}</td>
        <td>${formatOptionalAsset(position.sell_price)}</td>
        <td>${formatAsset(position.market_value)}</td>
        <td class="${position.realized_pnl >= 0 ? "gain" : "loss"}">${formatSignedAsset(position.realized_pnl)}</td>
        <td class="${position.unrealized_pnl >= 0 ? "gain" : "loss"}">${formatSignedAsset(position.unrealized_pnl)}</td>
        <td class="${position.total_pnl >= 0 ? "gain" : "loss"}">${formatSignedAsset(position.total_pnl)}</td>
      </tr>
    `)
    .join("");
}

function mountDecisions(decisions) {
  const target = document.getElementById("decisions-body");
  if (!decisions.length) {
    target.innerHTML = `<tr><td colspan="8" class="muted">As decisoes aparecerao aqui depois do primeiro ciclo.</td></tr>`;
    return;
  }

  target.innerHTML = decisions
    .slice(0, 80)
    .map((decision) => `
      <tr>
        <td>${formatDate(decision.timestamp)}</td>
        <td>${decision.symbol}</td>
        <td>${actionPill(decision.action)}</td>
        <td>${Number(decision.score).toFixed(3)}</td>
        <td>
          <strong>${formatPercent(decision.features.confidence_stable ?? decision.confidence)}</strong>
          <br>
          <span class="muted">raw ${formatPercent(decision.features.confidence_raw)} | base ${formatInteger(decision.features.learning_resolved_count)}</span>
        </td>
        <td>${decision.features.regime || "--"}<br><span class="muted">ciclo ${formatInteger(decision.features.learning_cycle_index)}</span></td>
        <td>${decision.executed ? "sim" : "nao"}<br><span class="muted">${decision.execution_note}</span></td>
        <td>${decision.rationale}</td>
      </tr>
    `)
    .join("");
}

function mountTransactions(transactions) {
  const target = document.getElementById("transactions-body");
  if (!transactions.length) {
    target.innerHTML = `<tr><td colspan="8" class="muted">Nenhuma transacao simulada ate agora.</td></tr>`;
    return;
  }

  target.innerHTML = transactions
    .slice(0, 80)
    .map((tx) => {
      const parts = formatDateParts(tx.timestamp);
      return `
        <tr>
          <td class="cell-datetime">
            <span class="cell-primary">${parts.date}</span>
            <span class="cell-secondary">${parts.time}</span>
          </td>
          <td class="cell-symbol">${tx.symbol}</td>
          <td class="cell-side">${actionPill(tx.side)}</td>
          <td class="cell-money" title="${tx.price}">${formatPriceAsset(tx.price)}</td>
          <td class="cell-number" title="${tx.quantity}">${formatQuantityValue(tx.quantity)}</td>
          <td class="cell-money" title="${tx.fee}">${formatAsset(tx.fee)}</td>
          <td class="cell-money ${tx.realized_pnl >= 0 ? "gain" : "loss"}" title="${tx.realized_pnl}">${formatSignedAsset(tx.realized_pnl)}</td>
          <td class="cell-money" title="${tx.balance_after}">${formatAsset(tx.balance_after)}</td>
        </tr>
      `;
    })
    .join("");
}

function mountChart(history) {
  const target = document.getElementById("equity-chart");
  if (!history.length) {
    target.innerHTML = `<div class="chart-empty muted">A curva de patrimonio sera desenhada apos os primeiros ciclos.</div>`;
    return;
  }

  const width = 980;
  const height = 230;
  const left = 18;
  const right = width - 18;
  const balanceTop = 28;
  const balanceBottom = 118;
  const pnlTop = 146;
  const pnlBottom = 206;
  const totalValues = history.map((item) => Number(item.total_balance));
  const cashValues = history.map((item) => Number(item.cash_balance));
  const pnlValues = history.map((item) => Number(item.realized_pnl) + Number(item.unrealized_pnl));
  const latestTotal = totalValues[totalValues.length - 1];
  const latestCash = cashValues[cashValues.length - 1];
  const latestPnl = pnlValues[pnlValues.length - 1];
  const firstTimestamp = history[0]?.timestamp;
  const lastTimestamp = history[history.length - 1]?.timestamp;

  const scaleX = (index, length) => {
    if (length <= 1) {
      return left;
    }
    return left + (index * (right - left)) / (length - 1);
  };

  const computeRange = (values, includeZero = false) => {
    const pool = includeZero ? [...values, 0] : [...values];
    let min = Math.min(...pool);
    let max = Math.max(...pool);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      const base = Math.max(Math.abs(max), 1);
      min -= base * 0.08;
      max += base * 0.08;
    }
    const padding = (max - min) * (includeZero ? 0.18 : 0.12);
    return { min: min - padding, max: max + padding };
  };

  const scaleY = (value, range, top, bottom) => {
    const span = range.max - range.min || 1;
    return bottom - ((value - range.min) * (bottom - top)) / span;
  };

  const buildLinePath = (values, range, top, bottom) => values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${scaleX(index, values.length)} ${scaleY(value, range, top, bottom)}`)
    .join(" ");

  const buildAreaPath = (values, range, top, bottom, baselineValue) => {
    if (!values.length) {
      return "";
    }
    const baselineY = scaleY(baselineValue, range, top, bottom);
    const line = buildLinePath(values, range, top, bottom);
    const lastX = scaleX(values.length - 1, values.length);
    const firstX = scaleX(0, values.length);
    return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  };

  const renderGuides = (range, top, bottom, labels) => labels
    .map((value) => {
      const y = scaleY(value, range, top, bottom);
      return `
        <line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="rgba(93,106,115,0.14)" stroke-dasharray="4 6"></line>
        <text x="${right - 4}" y="${y - 6}" text-anchor="end" fill="#6a7782" font-size="11">${formatAsset(value)}</text>
      `;
    })
    .join("");

  const balanceRange = computeRange([...totalValues, ...cashValues], false);
  const pnlRange = computeRange(pnlValues, true);
  const pnlZeroY = scaleY(0, pnlRange, pnlTop, pnlBottom);
  const totalPath = buildLinePath(totalValues, balanceRange, balanceTop, balanceBottom);
  const cashPath = buildLinePath(cashValues, balanceRange, balanceTop, balanceBottom);
  const pnlPath = buildLinePath(pnlValues, pnlRange, pnlTop, pnlBottom);
  const totalArea = buildAreaPath(totalValues, balanceRange, balanceTop, balanceBottom, balanceRange.min);
  const pnlArea = buildAreaPath(pnlValues, pnlRange, pnlTop, pnlBottom, 0);
  const totalLastX = scaleX(totalValues.length - 1, totalValues.length);
  const totalLastY = scaleY(latestTotal, balanceRange, balanceTop, balanceBottom);
  const cashLastY = scaleY(latestCash, balanceRange, balanceTop, balanceBottom);
  const pnlLastY = scaleY(latestPnl, pnlRange, pnlTop, pnlBottom);
  const midBalance = (balanceRange.max + balanceRange.min) / 2;
  const positivePnl = Math.max(...pnlValues, 0);
  const negativePnl = Math.min(...pnlValues, 0);

  target.innerHTML = `
    <div class="chart-meta">
      <div class="chart-chip">
        <span>Total atual</span>
        <strong>${formatAsset(latestTotal)}</strong>
      </div>
      <div class="chart-chip">
        <span>Caixa atual</span>
        <strong>${formatAsset(latestCash)}</strong>
      </div>
      <div class="chart-chip">
        <span>PnL atual</span>
        <strong class="${latestPnl >= 0 ? "gain" : "loss"}">${formatSignedAsset(latestPnl)}</strong>
      </div>
      <div class="chart-chip">
        <span>Janela</span>
        <strong>${history.length} ciclos</strong>
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Curva de patrimonio">
      <defs>
        <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(240,185,11,0.22)"></stop>
          <stop offset="100%" stop-color="rgba(240,185,11,0.03)"></stop>
        </linearGradient>
        <linearGradient id="pnlFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(31,41,51,0.16)"></stop>
          <stop offset="100%" stop-color="rgba(31,41,51,0.03)"></stop>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="rgba(255,255,255,0.44)"></rect>
      <rect x="${left}" y="${balanceTop}" width="${right - left}" height="${balanceBottom - balanceTop}" rx="14" fill="rgba(255,255,255,0.58)"></rect>
      <rect x="${left}" y="${pnlTop}" width="${right - left}" height="${pnlBottom - pnlTop}" rx="14" fill="rgba(255,255,255,0.52)"></rect>

      ${renderGuides(balanceRange, balanceTop, balanceBottom, [balanceRange.max, midBalance, balanceRange.min])}
      ${renderGuides(pnlRange, pnlTop, pnlBottom, [positivePnl, 0, negativePnl])}

      <text x="${left}" y="${balanceTop - 10}" fill="#5d6a73" font-size="12">Patrimonio e caixa</text>
      <text x="${left}" y="${pnlTop - 10}" fill="#5d6a73" font-size="12">PnL acumulado</text>

      <path d="${totalArea}" fill="url(#equityFill)"></path>
      <path d="${pnlArea}" fill="url(#pnlFill)"></path>

      <path d="${totalPath}" fill="none" stroke="#f0b90b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${cashPath}" fill="none" stroke="#1f7a48" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 5"></path>
      <line x1="${left}" y1="${pnlZeroY}" x2="${right}" y2="${pnlZeroY}" stroke="rgba(31,41,51,0.3)" stroke-dasharray="5 5"></line>
      <path d="${pnlPath}" fill="none" stroke="#1f2933" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>

      <circle cx="${totalLastX}" cy="${totalLastY}" r="4.5" fill="#f0b90b"></circle>
      <circle cx="${totalLastX}" cy="${cashLastY}" r="4" fill="#1f7a48"></circle>
      <circle cx="${totalLastX}" cy="${pnlLastY}" r="4" fill="#1f2933"></circle>

      <text x="${left}" y="${height - 8}" fill="#6a7782" font-size="11">${firstTimestamp ? formatDate(firstTimestamp) : "--"}</text>
      <text x="${right}" y="${height - 8}" text-anchor="end" fill="#6a7782" font-size="11">${lastTimestamp ? formatDate(lastTimestamp) : "--"}</text>
    </svg>
  `;
}

function renderSymbolSelector(filterText = "") {
  const normalizedFilter = filterText.trim().toLowerCase();
  const target = document.getElementById("symbol-selector");
  const symbols = state.availableSymbols.filter((item) => {
    const haystack = `${item.base_asset} ${item.symbol}`.toLowerCase();
    return haystack.includes(normalizedFilter);
  });

  target.innerHTML = symbols
    .map((item) => `
      <label class="symbol-chip">
        <input type="checkbox" value="${item.symbol}" ${state.selectedSymbols.has(item.symbol) ? "checked" : ""}>
        <div>
          <strong>${item.base_asset}</strong>
          <small>${item.symbol}</small>
        </div>
      </label>
    `)
    .join("");

  target.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const symbol = event.target.value;
      if (event.target.checked) {
        state.selectedSymbols.add(symbol);
      } else {
        state.selectedSymbols.delete(symbol);
      }
      markFormDirty();
    });
  });
}

function renderQuoteAssetOptions() {
  const target = document.getElementById("quote-asset");
  if (!target) {
    return;
  }
  target.innerHTML = state.availableQuoteAssets
    .map(
      (item) => `
        <option value="${item.quote_asset}">${item.quote_asset} (${item.pair_count} pares)</option>
      `
    )
    .join("");
  if (state.quoteAsset) {
    target.value = state.quoteAsset;
  }
}

async function loadQuoteAssets() {
  const response = await fetch("/api/available-quote-assets");
  const payload = await response.json();
  state.availableQuoteAssets = payload.quote_assets || [];
  if (payload.error) {
    setStatus(payload.error, true);
  }
  renderQuoteAssetOptions();
}

async function loadSymbols(quoteAsset = state.quoteAsset) {
  const response = await fetch(`/api/available-symbols?quote_asset=${encodeURIComponent(quoteAsset)}`);
  const payload = await response.json();
  state.availableSymbols = payload.symbols || [];
  const validSymbols = new Set(state.availableSymbols.map((item) => item.symbol));
  state.selectedSymbols = new Set(
    Array.from(state.selectedSymbols).filter((symbol) => validSymbols.has(symbol))
  );
  if (payload.error) {
    setStatus(payload.error, true);
  }
  renderSymbolSelector(document.getElementById("symbol-search").value);
}

async function loadDashboard(showStatus = false) {
  const response = await fetch("/api/dashboard");
  const payload = await response.json();
  state.dashboard = payload;
  state.strategyProfiles = payload.strategy_profiles || {};
  const settings = payload.settings;
  state.quoteAsset = settings.quote_asset || "BRL";
  updateQuoteAssetLabels();
  if (!state.formDirty) {
    state.selectedSymbols = new Set(settings.selected_symbols || []);
    document.getElementById("initial-capital").value = Number(payload.metrics.initial_capital).toFixed(
      state.quoteAsset === "BRL" ? 2 : 6
    );
    setFieldValue("quote-asset", state.quoteAsset);
    setFieldValue("poll-seconds", settings.poll_seconds);
    setFieldValue("trade-size-fraction", Math.round(Number(settings.trade_size_fraction) * 100));
    setFieldValue("fee-rate-percent", toPercentInput(settings.fee_rate, 3));
    setFieldValue("max-open-positions", settings.max_open_positions);
    setFieldValue(
      "min-trade-notional",
      Number(settings.min_trade_notional).toFixed(state.quoteAsset === "BRL" ? 2 : 6)
    );
    setFieldValue("primary-kline-interval", settings.primary_kline_interval);
    setFieldValue("primary-kline-limit", settings.primary_kline_limit);
    setFieldValue("confirm-kline-interval", settings.confirm_kline_interval);
    setFieldValue("confirm-kline-limit", settings.confirm_kline_limit);
    setFieldValue("reversal-kline-interval", settings.reversal_kline_interval);
    setFieldValue("reversal-kline-limit", settings.reversal_kline_limit);
    setFieldValue("cycle-history-limit", settings.cycle_history_limit);
    setFieldValue("learning-horizon-cycles", settings.learning_horizon_cycles);
    setFieldValue("learning-warmup-cycles", settings.learning_warmup_cycles);
    setFieldValue("strategy-profile", settings.strategy_profile || "customizado");
    setFieldValue("buy-threshold", Number(settings.buy_threshold).toFixed(2));
    setFieldValue("sell-threshold", Number(settings.sell_threshold).toFixed(2));
    setFieldValue("take-profit-percent", toPercentInput(settings.take_profit_ratio, 2));
    setFieldValue(
      "stop-loss-percent",
      Math.abs(Number(settings.stop_loss_ratio || 0) * 100).toFixed(2)
    );
    setFieldValue(
      "max-position-age-minutes",
      settings.time_exit_enabled ? settings.max_position_age_minutes : 0
    );
    setFieldValue(
      "cooldown-after-loss-cycles",
      settings.cooldown_after_loss_cycles
    );
    setFieldValue(
      "max-primary-volatility-percent",
      toPercentInput(settings.max_primary_volatility, 2)
    );
    setFieldValue(
      "max-direction-flip-ratio-percent",
      toPercentInput(settings.max_direction_flip_ratio, 1)
    );
    setFieldValue("min-volume-ratio", Number(settings.min_volume_ratio).toFixed(2));
    setFieldValue(
      "min-candle-body-ratio-percent",
      toPercentInput(settings.min_candle_body_ratio, 1)
    );
    setFieldValue("entry-rsi-limit", Number(settings.entry_rsi_limit).toFixed(1));
    setFieldValue(
      "entry-signal-quality-min-percent",
      toPercentInput(settings.entry_signal_quality_min, 1)
    );
    setFieldValue(
      "range-entry-signal-quality-min-percent",
      toPercentInput(settings.range_entry_signal_quality_min, 1)
    );
    setFieldValue(
      "entry-confirm-trend-min-percent",
      toPercentInput(settings.entry_confirm_trend_min, 3)
    );
    setFieldValue(
      "entry-confirm-momentum-min-percent",
      toPercentInput(settings.entry_confirm_momentum_min, 2)
    );
    setFieldValue("breakout-score-delta", Number(settings.breakout_score_delta).toFixed(2));
    setFieldValue(
      "breakout-trend-fast-min-percent",
      toPercentInput(settings.breakout_trend_fast_min, 3)
    );
    setFieldValue(
      "breakout-confirm-trend-min-percent",
      toPercentInput(settings.breakout_confirm_trend_min, 3)
    );
    setFieldValue(
      "breakout-momentum-15-min-percent",
      toPercentInput(settings.breakout_momentum_15_min, 2)
    );
    setFieldValue(
      "breakout-volume-ratio-min",
      Number(settings.breakout_volume_ratio_min).toFixed(2)
    );
    setFieldValue(
      "breakout-close-location-min-percent",
      toPercentInput(settings.breakout_close_location_min, 1)
    );
    setFieldValue(
      "trend-cont-score-delta",
      Number(settings.trend_cont_score_delta).toFixed(2)
    );
    setFieldValue(
      "trend-cont-signal-quality-min-percent",
      toPercentInput(settings.trend_cont_signal_quality_min, 1)
    );
    setFieldValue(
      "trend-cont-confirm-trend-min-percent",
      toPercentInput(settings.trend_cont_confirm_trend_min, 3)
    );
    setFieldValue(
      "trend-cont-volume-ratio-min",
      Number(settings.trend_cont_volume_ratio_min).toFixed(2)
    );
    setFieldValue("reversal-score-floor", Number(settings.reversal_score_floor).toFixed(2));
    setFieldValue(
      "reversal-confirm-trend-floor-percent",
      toPercentInput(settings.reversal_confirm_trend_floor, 3)
    );
    setFieldValue("reversal-rsi-15m-max", Number(settings.reversal_rsi_15m_max).toFixed(1));
    setFieldValue("reversal-rsi-1m-min", Number(settings.reversal_rsi_1m_min).toFixed(1));
    setFieldValue("reversal-rsi-1m-max", Number(settings.reversal_rsi_1m_max).toFixed(1));
    setFieldValue(
      "reversal-lower-wick-min-percent",
      toPercentInput(settings.reversal_lower_wick_min, 1)
    );
    setFieldValue(
      "reversal-close-location-min-percent",
      toPercentInput(settings.reversal_close_location_min, 1)
    );
    setFieldValue(
      "reversal-distance-from-low-max-percent",
      toPercentInput(settings.reversal_distance_from_low_max, 2)
    );
    setFieldValue(
      "reversal-volume-ratio-min",
      Number(settings.reversal_volume_ratio_min).toFixed(2)
    );
    setFieldValue("reversal-swing-window", settings.reversal_swing_window);
    setFieldValue(
      "min-weakness-exit-age-minutes",
      Number(settings.min_weakness_exit_age_minutes).toFixed(1)
    );
    syncStrategyProfileSelection();
    renderSymbolSelector(document.getElementById("symbol-search").value);
  }
  mountMetrics(payload.metrics, payload.performance || {}, settings.running, payload.learning_summary || {});
  mountPositions(payload.metrics.positions || []);
  mountDecisions(payload.decisions || []);
  mountTransactions(payload.transactions || []);
  mountChart(payload.equity_history || []);

  if (showStatus) {
    const cycleText = payload.last_cycle_finished_at
      ? `Ultimo ciclo finalizado em ${formatDate(payload.last_cycle_finished_at)}.`
      : "Aguardando o primeiro ciclo da simulacao.";
    setStatus(cycleText);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Falha ao processar a solicitacao.");
  }
  return payload;
}

async function refreshAll(showStatus = false, includeQuoteAssets = false) {
  await loadDashboard(showStatus);
  if (!state.formDirty) {
    const tasks = [loadSymbols(state.quoteAsset)];
    if (includeQuoteAssets) {
      tasks.push(loadQuoteAssets());
    }
    await Promise.all(tasks);
  }
}

function bindEvents() {
  document.getElementById("symbol-search").addEventListener("input", (event) => {
    renderSymbolSelector(event.target.value);
  });

  document
    .querySelectorAll(".config-panel input, .config-panel select")
    .forEach((field) => {
      if (field.id === "symbol-search") {
        return;
      }
      const eventName = field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";
      field.addEventListener(eventName, () => {
        markFormDirty();
      });
    });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      activateHistoryTab(button.dataset.tabTarget, button.dataset.tabDescription || "");
    });
  });

  document.getElementById("open-config-help").addEventListener("click", () => {
    toggleConfigHelpModal(true);
  });

  document.getElementById("close-config-help").addEventListener("click", () => {
    toggleConfigHelpModal(false);
  });

  document.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      toggleConfigHelpModal(false);
    });
  });

  document.querySelectorAll("[data-field-help-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.fieldHelpTarget;
      toggleConfigHelpModal(true);
      window.setTimeout(() => {
        focusHelpItem(targetId);
      }, 40);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleConfigHelpModal(false);
    }
  });

  document.getElementById("strategy-profile").addEventListener("change", (event) => {
    const profileKey = String(event.target.value || "");
    if (profileKey === "customizado") {
      markFormDirty();
      return;
    }
    applyStrategyProfile(profileKey, true);
  });

  [
    "buy-threshold",
    "sell-threshold",
    "take-profit-percent",
    "stop-loss-percent",
    "max-position-age-minutes",
    "cooldown-after-loss-cycles",
    "max-primary-volatility-percent",
    "max-direction-flip-ratio-percent",
    "min-volume-ratio",
    "min-candle-body-ratio-percent",
    "entry-rsi-limit",
    "entry-signal-quality-min-percent",
    "range-entry-signal-quality-min-percent",
    "entry-confirm-trend-min-percent",
    "entry-confirm-momentum-min-percent",
    "breakout-score-delta",
    "breakout-trend-fast-min-percent",
    "breakout-confirm-trend-min-percent",
    "breakout-momentum-15-min-percent",
    "breakout-volume-ratio-min",
    "breakout-close-location-min-percent",
    "trend-cont-score-delta",
    "trend-cont-signal-quality-min-percent",
    "trend-cont-confirm-trend-min-percent",
    "trend-cont-volume-ratio-min",
    "reversal-score-floor",
    "reversal-confirm-trend-floor-percent",
    "reversal-rsi-15m-max",
    "reversal-rsi-1m-min",
    "reversal-rsi-1m-max",
    "reversal-lower-wick-min-percent",
    "reversal-close-location-min-percent",
    "reversal-distance-from-low-max-percent",
    "reversal-volume-ratio-min",
    "reversal-swing-window",
    "min-weakness-exit-age-minutes",
  ].forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("input", () => {
      syncStrategyProfileSelection();
    });
  });

  document.getElementById("quote-asset").addEventListener("change", async (event) => {
    const draftQuoteAsset = String(event.target.value || "").toUpperCase();
    state.selectedSymbols = new Set();
    markFormDirty();
    try {
      await loadSymbols(draftQuoteAsset);
      setStatus(`Mercado ${draftQuoteAsset} carregado. Escolha as moedas e salve para aplicar.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  async function submitSettingsAction(action) {
    try {
      const payload = await postJson("/api/settings", buildSettingsPayload(action));
      clearFormDirty();
      state.dashboard = payload;
      await refreshAll(false, true);
      setStatus(buildSettingsStatusMessage(payload.save_meta));
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  document.getElementById("save-settings").addEventListener("click", async () => {
    await submitSettingsAction("save");
  });

  document.getElementById("restart-settings").addEventListener("click", async () => {
    await submitSettingsAction("restart");
  });

  document.getElementById("reset-settings").addEventListener("click", async () => {
    if (!window.confirm("Resetar o simulador para o default do projeto? Isso limpa historico e aprendizado.")) {
      return;
    }
    try {
      const payload = await postJson("/api/settings", { action: "reset" });
      clearFormDirty();
      state.dashboard = payload;
      await refreshAll(false, true);
      setStatus(buildSettingsStatusMessage(payload.save_meta));
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.getElementById("start-sim").addEventListener("click", async () => {
    try {
      await postJson("/api/control", { action: "start" });
      await refreshAll(true);
      setStatus("Simulacao iniciada.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.getElementById("stop-sim").addEventListener("click", async () => {
    try {
      await postJson("/api/control", { action: "stop" });
      await refreshAll(true);
      setStatus("Simulacao pausada.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.getElementById("run-cycle").addEventListener("click", async () => {
    try {
      await postJson("/api/control", { action: "tick" });
      await refreshAll(true);
      setStatus("Ciclo executado manualmente.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

async function bootstrap() {
  bindEvents();
  await refreshAll(true, true);
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
  }
  state.refreshTimer = window.setInterval(() => refreshAll(false).catch(() => {}), 8000);
}

bootstrap().catch((error) => {
  setStatus(error.message, true);
});
