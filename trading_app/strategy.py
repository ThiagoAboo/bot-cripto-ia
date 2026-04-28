from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import mean, pstdev
from typing import Any, Dict, List, Optional

from .config import (
    BREAKOUT_CLOSE_LOCATION_MIN,
    BREAKOUT_CONFIRM_TREND_MIN,
    BREAKOUT_MOMENTUM_15_MIN,
    BREAKOUT_SCORE_DELTA,
    BREAKOUT_TREND_FAST_MIN,
    BREAKOUT_VOLUME_RATIO_MIN,
    BUY_THRESHOLD,
    ENTRY_CONFIRM_MOMENTUM_MIN,
    ENTRY_CONFIRM_TREND_MIN,
    ENTRY_RSI_LIMIT,
    ENTRY_SIGNAL_QUALITY_MIN,
    LEARNING_WARMUP_CYCLES,
    MAX_DIRECTION_FLIP_RATIO,
    MAX_POSITION_AGE_MINUTES,
    MAX_PRIMARY_VOLATILITY,
    MIN_CANDLE_BODY_RATIO,
    MIN_VOLUME_RATIO,
    SELL_THRESHOLD,
    STOP_LOSS_RATIO,
    TAKE_PROFIT_RATIO,
    TREND_CONT_CONFIRM_TREND_MIN,
    TREND_CONT_SCORE_DELTA,
    TREND_CONT_SIGNAL_QUALITY_MIN,
    TREND_CONT_VOLUME_RATIO_MIN,
)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def ema(values: List[float], period: int) -> float:
    if not values:
        raise ValueError("EMA requires values")
    multiplier = 2 / (period + 1)
    result = values[0]
    for value in values[1:]:
        result = (value - result) * multiplier + result
    return result


def rsi(values: List[float], period: int = 14) -> float:
    if len(values) <= period:
        return 50.0
    gains = []
    losses = []
    for current, previous in zip(values[1:], values[:-1]):
        delta = current - previous
        gains.append(max(delta, 0))
        losses.append(abs(min(delta, 0)))
    avg_gain = mean(gains[-period:]) if any(gains[-period:]) else 0
    avg_loss = mean(losses[-period:]) if any(losses[-period:]) else 0
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def direction_flip_ratio(returns: List[float]) -> float:
    signs = []
    for value in returns:
        if value > 0:
            signs.append(1)
        elif value < 0:
            signs.append(-1)
    if len(signs) < 2:
        return 0.0
    flips = sum(1 for current, previous in zip(signs[1:], signs[:-1]) if current != previous)
    return flips / (len(signs) - 1)


def candle_snapshot(kline: Dict[str, float]) -> Dict[str, float]:
    candle_range = max(kline["high"] - kline["low"], 1e-12)
    body = kline["close"] - kline["open"]
    upper_wick = kline["high"] - max(kline["open"], kline["close"])
    lower_wick = min(kline["open"], kline["close"]) - kline["low"]
    return {
        "body_ratio": abs(body) / candle_range,
        "candle_bias": clamp(body / candle_range, -1.0, 1.0),
        "close_location": clamp((kline["close"] - kline["low"]) / candle_range, 0.0, 1.0),
        "upper_wick_ratio": upper_wick / candle_range,
        "lower_wick_ratio": lower_wick / candle_range,
    }


@dataclass
class Decision:
    action: str
    score: float
    confidence: float
    price: float
    features: Dict[str, Any]
    rationale: str


class MicroTradeStrategy:
    def build_decision(
        self,
        *,
        symbol: str,
        primary_klines: List[Dict[str, float]],
        confirm_klines: List[Dict[str, float]],
        existing_position: Optional[Dict[str, float]],
        learning_state: Optional[Dict[str, Any]] = None,
        fee_rate: float = 0.0,
        time_exit_enabled: bool = False,
        strategy_settings: Optional[Dict[str, Any]] = None,
    ) -> Decision:
        strategy_settings = strategy_settings or {}
        buy_threshold = float(strategy_settings.get("buy_threshold", BUY_THRESHOLD))
        sell_threshold = float(strategy_settings.get("sell_threshold", SELL_THRESHOLD))
        take_profit_ratio = float(
            strategy_settings.get("take_profit_ratio", TAKE_PROFIT_RATIO)
        )
        stop_loss_ratio = float(strategy_settings.get("stop_loss_ratio", STOP_LOSS_RATIO))
        max_position_age_minutes = int(
            strategy_settings.get("max_position_age_minutes", MAX_POSITION_AGE_MINUTES)
        )
        time_exit_active = bool(time_exit_enabled) and max_position_age_minutes > 0
        max_primary_volatility = float(
            strategy_settings.get("max_primary_volatility", MAX_PRIMARY_VOLATILITY)
        )
        max_direction_flip_ratio = float(
            strategy_settings.get("max_direction_flip_ratio", MAX_DIRECTION_FLIP_RATIO)
        )
        min_volume_ratio = float(strategy_settings.get("min_volume_ratio", MIN_VOLUME_RATIO))
        min_candle_body_ratio = float(
            strategy_settings.get("min_candle_body_ratio", MIN_CANDLE_BODY_RATIO)
        )
        entry_rsi_limit = float(strategy_settings.get("entry_rsi_limit", ENTRY_RSI_LIMIT))
        entry_signal_quality_min = float(
            strategy_settings.get("entry_signal_quality_min", ENTRY_SIGNAL_QUALITY_MIN)
        )
        entry_confirm_trend_min = float(
            strategy_settings.get("entry_confirm_trend_min", ENTRY_CONFIRM_TREND_MIN)
        )
        entry_confirm_momentum_min = float(
            strategy_settings.get(
                "entry_confirm_momentum_min",
                ENTRY_CONFIRM_MOMENTUM_MIN,
            )
        )
        breakout_score_delta = float(
            strategy_settings.get("breakout_score_delta", BREAKOUT_SCORE_DELTA)
        )
        breakout_trend_fast_min = float(
            strategy_settings.get(
                "breakout_trend_fast_min",
                BREAKOUT_TREND_FAST_MIN,
            )
        )
        breakout_confirm_trend_min = float(
            strategy_settings.get(
                "breakout_confirm_trend_min",
                BREAKOUT_CONFIRM_TREND_MIN,
            )
        )
        breakout_momentum_15_min = float(
            strategy_settings.get(
                "breakout_momentum_15_min",
                BREAKOUT_MOMENTUM_15_MIN,
            )
        )
        breakout_volume_ratio_min = float(
            strategy_settings.get(
                "breakout_volume_ratio_min",
                BREAKOUT_VOLUME_RATIO_MIN,
            )
        )
        breakout_close_location_min = float(
            strategy_settings.get(
                "breakout_close_location_min",
                BREAKOUT_CLOSE_LOCATION_MIN,
            )
        )
        trend_cont_score_delta = float(
            strategy_settings.get("trend_cont_score_delta", TREND_CONT_SCORE_DELTA)
        )
        trend_cont_signal_quality_min = float(
            strategy_settings.get(
                "trend_cont_signal_quality_min",
                TREND_CONT_SIGNAL_QUALITY_MIN,
            )
        )
        trend_cont_confirm_trend_min = float(
            strategy_settings.get(
                "trend_cont_confirm_trend_min",
                TREND_CONT_CONFIRM_TREND_MIN,
            )
        )
        trend_cont_volume_ratio_min = float(
            strategy_settings.get(
                "trend_cont_volume_ratio_min",
                TREND_CONT_VOLUME_RATIO_MIN,
            )
        )
        learning_warmup_cycles = max(
            1,
            int(strategy_settings.get("learning_warmup_cycles", LEARNING_WARMUP_CYCLES)),
        )
        learning_state = learning_state or {}
        resolved_count = int(learning_state.get("resolved_count", 0))
        learning_accuracy = float(learning_state.get("accuracy_ewma", 0.5))
        learning_edge = float(learning_state.get("edge_ewma", 0.0))
        smoothed_confidence_prev = float(learning_state.get("smoothed_confidence", 0.18))
        warmup_progress = clamp(resolved_count / learning_warmup_cycles, 0.0, 1.0)

        if len(primary_klines) < 60 or len(confirm_klines) < 60:
            last_price = primary_klines[-1]["close"] if primary_klines else 0.0
            return Decision(
                action="hold",
                score=0.0,
                confidence=0.1,
                price=last_price,
                features={
                    "primary_candles_available": len(primary_klines),
                    "confirm_candles_available": len(confirm_klines),
                    "regime": "insufficient-data",
                    "confidence_raw": 0.1,
                    "confidence_stable": 0.1,
                    "learning_resolved_count": resolved_count,
                    "learning_accuracy": round(learning_accuracy, 4),
                    "learning_edge": round(learning_edge, 6),
                    "learning_warmup_progress": round(warmup_progress, 4),
                },
                rationale="historico insuficiente para montar a leitura multi-timeframe da estrategia",
            )

        closes = [item["close"] for item in primary_klines]
        volumes = [item["volume"] for item in primary_klines]
        price = closes[-1]

        fast_ema = ema(closes[-21:], 9)
        slow_ema = ema(closes[-55:], 21)
        trend_ema = ema(closes[-89:], 55)
        current_rsi = rsi(closes, 14)
        momentum_5 = (price / closes[-6]) - 1
        momentum_15 = (price / closes[-16]) - 1
        trend_fast = (fast_ema / slow_ema) - 1
        trend_slow = (slow_ema / trend_ema) - 1
        average_volume = mean(volumes[-20:]) if len(volumes) >= 20 else 0.0
        volume_ratio = volumes[-1] / average_volume if average_volume > 0 else 1.0
        returns = [(current / previous) - 1 for current, previous in zip(closes[1:], closes[:-1])]
        volatility = pstdev(returns[-20:]) if len(returns) >= 20 else 0.0
        flip_ratio = direction_flip_ratio(returns[-20:])
        latest_candle = candle_snapshot(primary_klines[-1])

        confirm_closes = [item["close"] for item in confirm_klines]
        confirm_price = confirm_closes[-1]
        confirm_fast_ema = ema(confirm_closes[-21:], 9)
        confirm_slow_ema = ema(confirm_closes[-55:], 21)
        confirm_rsi = rsi(confirm_closes, 14)
        confirm_trend = (confirm_fast_ema / confirm_slow_ema) - 1
        confirm_momentum = (confirm_price / confirm_closes[-7]) - 1
        trend_alignment = (
            1.0
            if trend_fast > 0 and confirm_trend > 0
            else -1.0 if trend_fast < 0 and confirm_trend < 0 else 0.0
        )

        if confirm_trend > 0.0012 and flip_ratio < 0.42:
            regime = "trend"
        elif latest_candle["close_location"] > 0.78 and volume_ratio > 1.18 and momentum_5 > 0.0025:
            regime = "breakout"
        elif flip_ratio > 0.58 or volatility > 0.0105:
            regime = "chop"
        else:
            regime = "range"

        score = (
            clamp(trend_fast * 180, -1.4, 1.4)
            + clamp(trend_slow * 120, -1.0, 1.0)
            + clamp(confirm_trend * 240, -1.2, 1.2)
            + clamp(confirm_momentum * 90, -0.7, 0.7)
            + clamp(momentum_5 * 85, -0.9, 0.9)
            + clamp(momentum_15 * 60, -0.8, 0.8)
            + clamp((volume_ratio - 1) * 0.45, -0.4, 0.4)
            + clamp(latest_candle["candle_bias"] * 0.55, -0.35, 0.35)
            + clamp((latest_candle["close_location"] - 0.5) * 0.5, -0.18, 0.18)
            + clamp((latest_candle["body_ratio"] - 0.35) * 0.45, -0.12, 0.15)
            - clamp((current_rsi - 68) / 28, -0.5, 0.8)
            - clamp((confirm_rsi - 70) / 32, -0.2, 0.55)
            - clamp((flip_ratio - 0.42) * 1.8, 0.0, 0.55)
            - clamp(volatility * 150, 0.0, 0.5)
        )
        score = round(score, 4)

        alignment_votes = sum(
            [
                1 if trend_fast > 0 else 0,
                1 if trend_slow > 0 else 0,
                1 if confirm_trend > 0 else 0,
                1 if confirm_momentum > 0 else 0,
                1 if volume_ratio >= min_volume_ratio else 0,
                1 if latest_candle["close_location"] > 0.55 else 0,
                1 if latest_candle["body_ratio"] >= min_candle_body_ratio else 0,
            ]
        )
        agreement_ratio = alignment_votes / 7
        noise_penalty = clamp((flip_ratio - 0.44) * 1.5, 0.0, 0.45) + clamp(
            (volatility - 0.0085) * 70,
            0.0,
            0.35,
        )
        raw_confidence = round(
            clamp((abs(score) / 2.2) * 0.55 + agreement_ratio * 0.45 - noise_penalty, 0.05, 0.99),
            4,
        )
        signal_quality = round(clamp(agreement_ratio - noise_penalty * 0.55, 0.0, 1.0), 4)

        historical_reliability = clamp(
            learning_accuracy * 0.72
            + clamp(0.5 + learning_edge * 42, 0.0, 1.0) * 0.28,
            0.05,
            0.99,
        )
        regime_adjustment = 0.025 if regime in {"trend", "breakout"} else -0.03 if regime == "chop" else 0.0
        confidence = round(
            clamp(
                raw_confidence * (1 - 0.42 * warmup_progress)
                + historical_reliability * (0.24 * warmup_progress)
                + smoothed_confidence_prev * (0.26 * warmup_progress)
                + signal_quality * (0.08 * warmup_progress)
                + regime_adjustment * warmup_progress,
                0.05,
                0.99,
            ),
            4,
        )

        pnl_ratio = None
        age_minutes = 0.0
        break_even_price = None
        if existing_position:
            pnl_ratio = (price / existing_position["avg_price"]) - 1
            opened_at = datetime.fromisoformat(existing_position["opened_at"])
            age_minutes = (
                datetime.now(timezone.utc) - opened_at.astimezone(timezone.utc)
            ).total_seconds() / 60
            quantity = float(existing_position.get("quantity", 0.0) or 0.0)
            cost_basis = float(existing_position.get("cost_basis", 0.0) or 0.0)
            if quantity > 0 and cost_basis > 0 and fee_rate < 1:
                break_even_price = cost_basis / (quantity * (1 - fee_rate))

        action = "hold"
        decision_path = "hold"
        reason_parts = [
            f"score={score:+.3f}",
            f"rsi1m={current_rsi:.1f}",
            f"rsi5m={confirm_rsi:.1f}",
            f"mom5={momentum_5 * 100:+.2f}%",
            f"mom15={momentum_15 * 100:+.2f}%",
            f"trend5m={confirm_trend * 100:+.2f}%",
            f"volRatio={volume_ratio:.2f}",
            f"flip={flip_ratio:.2f}",
            f"regime={regime}",
            f"learnN={resolved_count}",
        ]

        strong_breakout = (
            score >= buy_threshold + breakout_score_delta
            and trend_fast > breakout_trend_fast_min
            and confirm_trend > breakout_confirm_trend_min
            and momentum_15 > breakout_momentum_15_min
            and volume_ratio >= breakout_volume_ratio_min
            and latest_candle["close_location"] > breakout_close_location_min
        )
        trend_continuation = (
            score >= buy_threshold + trend_cont_score_delta
            and signal_quality >= trend_cont_signal_quality_min
            and confirm_trend > trend_cont_confirm_trend_min
            and regime == "trend"
            and volume_ratio >= trend_cont_volume_ratio_min
        )
        bullish_alignment = (
            trend_fast > 0
            and trend_slow > -0.0003
            and confirm_trend > entry_confirm_trend_min
            and confirm_momentum > entry_confirm_momentum_min
        )
        candle_ok = (
            latest_candle["body_ratio"] >= min_candle_body_ratio
            and latest_candle["close_location"] > 0.56
            and latest_candle["candle_bias"] > 0.12
        )
        market_clean = (
            volume_ratio >= min_volume_ratio
            and volatility <= max_primary_volatility
            and flip_ratio <= max_direction_flip_ratio
        )
        standard_entry_ready = (
            current_rsi < entry_rsi_limit
            and candle_ok
            and signal_quality >= entry_signal_quality_min
        )
        standard_entry_allowed = standard_entry_ready and regime != "chop"

        if existing_position:
            reason_parts.append(f"pnl={pnl_ratio * 100:+.2f}%")
            reason_parts.append(f"age={age_minutes:.1f}m")
            if break_even_price is not None:
                reason_parts.append(f"breakeven={break_even_price:.4f}")
            favorable_continuation = (
                confirm_trend > 0
                and momentum_5 >= -0.0002
                and score >= 0.12
                and signal_quality >= 0.38
                and regime in {"trend", "breakout", "range"}
            )
            if pnl_ratio >= take_profit_ratio:
                if favorable_continuation:
                    reason_parts.append("lucro acima da meta, mantendo por continuidade favoravel")
                else:
                    action = "sell"
                    decision_path = "take_profit_exit"
                    reason_parts.append("take-profit acionado")
            elif pnl_ratio <= stop_loss_ratio:
                action = "sell"
                decision_path = "stop_loss_exit"
                reason_parts.append("stop-loss acionado")
            elif confirm_trend < -0.0008 and momentum_5 < 0:
                action = "sell"
                decision_path = "confirm_reversal_exit"
                reason_parts.append("confirmacao 5m virou contra a posicao")
            elif max_position_age_minutes > 0 and age_minutes >= max_position_age_minutes and score < 0.2:
                if not time_exit_active:
                    reason_parts.append("saida por tempo desativada")
                elif break_even_price is not None and price < break_even_price:
                    reason_parts.append("tempo ignorado: preco ainda abaixo do break-even liquido")
                else:
                    action = "sell"
                    decision_path = "time_exit"
                    reason_parts.append("saida por tempo de exposicao")
            elif flip_ratio > 0.65 and score < 0.15:
                action = "sell"
                decision_path = "chop_exit"
                reason_parts.append("mercado entrou em chop apos a entrada")
            elif score <= sell_threshold and confirm_trend <= 0:
                action = "sell"
                decision_path = "weakness_exit"
                reason_parts.append("forca vendedora detectada")
        elif score >= buy_threshold and bullish_alignment and market_clean and (
            standard_entry_allowed or strong_breakout or trend_continuation
        ):
            action = "buy"
            if standard_entry_allowed:
                decision_path = "standard_entry"
                reason_parts.append("entrada com alinhamento 1m/5m e candle favoravel")
            elif strong_breakout:
                decision_path = "breakout_entry"
                reason_parts.append("entrada por breakout forte confirmado em 5m")
            else:
                decision_path = "trend_continuation_entry"
                reason_parts.append("entrada por continuacao de tendencia com alta confianca")
        elif score >= buy_threshold and not bullish_alignment:
            reason_parts.append("compra bloqueada por falta de alinhamento 5m")
        elif score >= buy_threshold and not market_clean:
            reason_parts.append("compra bloqueada por ruido, volume fraco ou volatilidade alta")
        elif score >= buy_threshold:
            final_blockers = []
            if current_rsi >= entry_rsi_limit:
                final_blockers.append(f"rsi1m acima de {entry_rsi_limit:.1f}")
            if signal_quality < entry_signal_quality_min:
                final_blockers.append(
                    f"qualidade abaixo de {entry_signal_quality_min:.2f}"
                )
            if not candle_ok:
                final_blockers.append("candle sem estrutura minima")
            if regime == "chop" and standard_entry_ready:
                final_blockers.append("entrada padrao bloqueada em regime chop")
            if not strong_breakout:
                final_blockers.append("breakout sem confirmacao suficiente")
            if not trend_continuation:
                final_blockers.append("continuidade 5m insuficiente")
            if final_blockers:
                reason_parts.append(
                    "compra bloqueada pelos gatilhos finais: "
                    + ", ".join(final_blockers[:4])
                )

        return Decision(
            action=action,
            score=score,
            confidence=confidence,
            price=price,
            features={
                "fast_ema": round(fast_ema, 8),
                "slow_ema": round(slow_ema, 8),
                "trend_ema": round(trend_ema, 8),
                "rsi_1m": round(current_rsi, 4),
                "rsi_5m": round(confirm_rsi, 4),
                "momentum_5": round(momentum_5, 6),
                "momentum_15": round(momentum_15, 6),
                "trend_fast": round(trend_fast, 6),
                "trend_slow": round(trend_slow, 6),
                "confirm_trend": round(confirm_trend, 6),
                "confirm_momentum": round(confirm_momentum, 6),
                "volume_ratio": round(volume_ratio, 6),
                "volatility": round(volatility, 6),
                "flip_ratio": round(flip_ratio, 6),
                "body_ratio": round(latest_candle["body_ratio"], 6),
                "close_location": round(latest_candle["close_location"], 6),
                "candle_bias": round(latest_candle["candle_bias"], 6),
                "trend_alignment": trend_alignment,
                "signal_quality": signal_quality,
                "regime": regime,
                "bullish_alignment": bullish_alignment,
                "market_clean": market_clean,
                "standard_entry_ready": standard_entry_ready,
                "standard_entry_allowed": standard_entry_allowed,
                "strong_breakout": strong_breakout,
                "trend_continuation": trend_continuation,
                "decision_path": decision_path,
                "confidence_raw": raw_confidence,
                "confidence_stable": confidence,
                "learning_resolved_count": resolved_count,
                "learning_accuracy": round(learning_accuracy, 4),
                "learning_edge": round(learning_edge, 6),
                "learning_warmup_progress": round(warmup_progress, 4),
                "break_even_price": round(break_even_price, 8) if break_even_price is not None else None,
                "time_exit_enabled": time_exit_active,
            },
            rationale=" | ".join(reason_parts),
        )
