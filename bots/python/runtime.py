import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from engine import run_predict
except Exception:
    run_predict = None


TIMEFRAMES = ("1m", "5m", "15m", "1h", "4h", "1d")


def read_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def to_float(value: Any, fallback: float = 0.0) -> float:
    try:
        result = float(value)
        if math.isfinite(result):
            return result
    except Exception:
        pass
    return fallback


def average(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / float(len(values))


def get_last_valid(values: Sequence[Optional[float]]) -> Optional[float]:
    for value in reversed(list(values)):
        if isinstance(value, (int, float)) and math.isfinite(value):
            return float(value)
    return None


def standard_deviation(values: Sequence[float]) -> Optional[float]:
    mean = average(values)
    if mean is None:
        return None
    variance = sum((value - mean) ** 2 for value in values) / float(len(values))
    return math.sqrt(variance)


def calculate_ema_series(values: Sequence[float], period: int) -> List[Optional[float]]:
    if not values or period <= 0:
        return []

    multiplier = 2.0 / (period + 1.0)
    result: List[Optional[float]] = []
    previous: Optional[float] = None

    for index, value in enumerate(values):
        if index + 1 < period:
            result.append(None)
            continue

        if previous is None:
            previous = average(values[:period])
            result.append(previous)
            continue

        previous = ((value - previous) * multiplier) + previous
        result.append(previous)

    return result


def calculate_rsi(values: Sequence[float], period: int = 14) -> Optional[float]:
    if len(values) <= period:
        return None

    gains = 0.0
    losses = 0.0
    for index in range(len(values) - period, len(values)):
        previous_value = values[index - 1]
        current_value = values[index]
        change = current_value - previous_value
        if change >= 0:
            gains += change
        else:
            losses += abs(change)

    average_gain = gains / float(period)
    average_loss = losses / float(period)
    if average_loss == 0:
        return 100.0

    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def calculate_macd(values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, Optional[float]]:
    if len(values) < slow + signal:
        return {
            "macd": None,
            "signal": None,
            "histogram": None,
        }

    ema_fast = calculate_ema_series(values, fast)
    ema_slow = calculate_ema_series(values, slow)
    macd_series: List[Optional[float]] = []
    for index in range(len(values)):
        fast_value = ema_fast[index] if index < len(ema_fast) else None
        slow_value = ema_slow[index] if index < len(ema_slow) else None
        if fast_value is None or slow_value is None:
            macd_series.append(None)
            continue
        macd_series.append(fast_value - slow_value)

    compact_macd = [value for value in macd_series if isinstance(value, (int, float))]
    signal_series = calculate_ema_series(compact_macd, signal)
    signal_value = get_last_valid(signal_series)
    macd_value = get_last_valid(macd_series)

    if macd_value is None or signal_value is None:
        return {
            "macd": None,
            "signal": None,
            "histogram": None,
        }

    return {
        "macd": macd_value,
        "signal": signal_value,
        "histogram": macd_value - signal_value,
    }


def calculate_bollinger(values: Sequence[float], period: int = 20, std_dev: float = 2.0) -> Dict[str, Optional[float]]:
    if len(values) < period:
        return {
            "upper": None,
            "middle": None,
            "lower": None,
            "deviation": None,
        }

    window = list(values[-period:])
    middle = average(window)
    deviation = standard_deviation(window)
    if middle is None or deviation is None:
        return {
            "upper": None,
            "middle": None,
            "lower": None,
            "deviation": None,
        }

    return {
        "upper": middle + (std_dev * deviation),
        "middle": middle,
        "lower": middle - (std_dev * deviation),
        "deviation": deviation,
    }


def calculate_rate_of_change(values: Sequence[float], periods: int = 6) -> Optional[float]:
    if len(values) <= periods:
        return None

    current = values[-1]
    previous = values[-1 - periods]
    if previous == 0:
        return None

    return ((current / previous) - 1.0) * 100.0


def calculate_volume_ratio(volumes: Sequence[float], short_period: int = 5, long_period: int = 20) -> Optional[float]:
    if len(volumes) < max(short_period, long_period):
        return None

    recent = average(volumes[-short_period:])
    baseline = average(volumes[-long_period:])
    if recent is None or baseline in (None, 0):
        return None

    return recent / baseline


def calculate_slope(values: Sequence[Optional[float]], lookback: int = 5) -> Optional[float]:
    current = get_last_valid(values)
    if current is None or len(values) <= lookback:
        return None

    previous = values[-1 - lookback]
    if not isinstance(previous, (int, float)) or not math.isfinite(previous):
        return None

    return current - float(previous)


def calculate_z_score(values: Sequence[float], period: int = 20) -> Optional[float]:
    if len(values) < period:
        return None

    window = list(values[-period:])
    mean = average(window)
    deviation = standard_deviation(window)
    current = values[-1]

    if mean is None or deviation in (None, 0):
        return None

    return (current - mean) / deviation


def calculate_atr_ratio(candles: Sequence[Dict[str, Any]], period: int = 14, reference_price: Optional[float] = None) -> Optional[float]:
    if len(candles) <= period:
        return None

    true_ranges: List[float] = []
    for index in range(1, len(candles)):
        current = candles[index]
        previous = candles[index - 1]
        high = to_float(current.get("high"))
        low = to_float(current.get("low"))
        previous_close = to_float(previous.get("close"))
        true_range = max(
            high - low,
            abs(high - previous_close),
            abs(low - previous_close),
        )
        if math.isfinite(true_range):
            true_ranges.append(true_range)

    if len(true_ranges) < period:
        return None

    atr = average(true_ranges[-period:])
    price = reference_price if reference_price and reference_price > 0 else to_float(candles[-1].get("close"))
    if atr is None or price <= 0:
        return None

    return atr / price


def build_query_string(params: Dict[str, Any]) -> str:
    filtered = {key: value for key, value in params.items() if value is not None and value != ""}
    return urllib.parse.urlencode(filtered)


def request_json(
    base_url: str,
    token: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    timeout: float = 15.0,
    retries: int = 2,
    internal_key: Optional[str] = None,
) -> Any:
    query = build_query_string(params or {})
    url = f"{base_url.rstrip('/')}{path}"
    if query:
        url = f"{url}?{query}"

    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            encoded_body = json.dumps(body).encode("utf-8") if body is not None else None
            request = urllib.request.Request(url, data=encoded_body, method=method.upper())
            request.add_header("Authorization", f"Bearer {token}")
            if internal_key:
                request.add_header("x-bot-runtime-key", internal_key)
            request.add_header("Accept", "application/json")
            if encoded_body is not None:
                request.add_header("Content-Type", "application/json")
            response = urllib.request.urlopen(request, timeout=timeout)
            body = response.read().decode("utf-8")
            payload = json.loads(body) if body else {}

            if isinstance(payload, dict) and payload.get("success") is False:
                raise RuntimeError(str(payload.get("error") or payload.get("message") or "API request failed"))

            if isinstance(payload, dict) and "data" in payload:
                return payload["data"]

            return payload
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt >= retries:
                break

    raise RuntimeError(f"Failed to request {path}: {last_error}")


def best_effort_post_json(
    backend: Dict[str, Any],
    path: str,
    body: Dict[str, Any],
) -> None:
    try:
        request_json(
            backend["baseUrl"],
            backend["accessToken"],
            path,
            method="POST",
            body=body,
            timeout=backend.get("timeoutSeconds", 15.0),
            retries=0,
            internal_key=backend.get("runtimeKey"),
        )
    except Exception:
        return


def normalize_candle(entry: Dict[str, Any]) -> Dict[str, float]:
    return {
        "timestamp": entry.get("timestamp"),
        "open": to_float(entry.get("open")),
        "high": to_float(entry.get("high")),
        "low": to_float(entry.get("low")),
        "close": to_float(entry.get("close")),
        "volume": to_float(entry.get("volume")),
    }


def fetch_social_signals(backend: Dict[str, Any]) -> List[Dict[str, Any]]:
    data = request_json(
        backend["baseUrl"],
        backend["accessToken"],
        "/api/social/latest",
        timeout=backend.get("timeoutSeconds", 15.0),
        internal_key=backend.get("runtimeKey"),
    )

    signals: List[Dict[str, Any]] = []
    for item in data or []:
        if not isinstance(item, dict):
            continue
        signals.append({
            "symbol": item.get("symbol"),
            "pair": item.get("pair"),
            "score": to_float(item.get("score")),
            "mentions": int(round(to_float(item.get("mentions")))),
            "sentiment": item.get("sentiment") or "neutral",
            "sources": list(item.get("sources") or []),
            "references": list(item.get("references") or []),
        })
    return signals


def fetch_candles(backend: Dict[str, Any], pair: str, period: str, limit: int) -> List[Dict[str, Any]]:
    data = request_json(
        backend["baseUrl"],
        backend["accessToken"],
        "/api/exchange/candles",
        params={
            "pair": pair,
            "period": period,
            "limit": limit,
        },
        timeout=backend.get("timeoutSeconds", 15.0),
        internal_key=backend.get("runtimeKey"),
    )
    return [normalize_candle(entry) for entry in (data or []) if isinstance(entry, dict)]


def fetch_price(backend: Dict[str, Any], pair: str) -> float:
    data = request_json(
        backend["baseUrl"],
        backend["accessToken"],
        "/api/exchange/price",
        params={"pair": pair},
        timeout=backend.get("timeoutSeconds", 15.0),
        internal_key=backend.get("runtimeKey"),
    )
    return to_float((data or {}).get("price"))


def fetch_exchange_rate(backend: Dict[str, Any], from_currency: str, to_currency: str) -> float:
    data = request_json(
        backend["baseUrl"],
        backend["accessToken"],
        "/api/exchange/rate",
        params={
            "from": from_currency,
            "to": to_currency,
        },
        timeout=backend.get("timeoutSeconds", 15.0),
        internal_key=backend.get("runtimeKey"),
    )
    return to_float((data or {}).get("rate"))


def fetch_orderbook(backend: Dict[str, Any], pair: str, limit: int = 20) -> Dict[str, Any]:
    data = request_json(
        backend["baseUrl"],
        backend["accessToken"],
        "/api/exchange/orderbook",
        params={"pair": pair, "limit": limit},
        timeout=backend.get("timeoutSeconds", 15.0),
        internal_key=backend.get("runtimeKey"),
    )

    bids = []
    asks = []
    for side_name, target in (("bids", bids), ("asks", asks)):
        for level in (data or {}).get(side_name, []) or []:
            if not isinstance(level, (list, tuple)) or len(level) < 2:
                continue
            price = to_float(level[0])
            quantity = to_float(level[1])
            if price > 0 and quantity >= 0:
                target.append((price, quantity))

    return {
        "lastUpdateId": (data or {}).get("lastUpdateId"),
        "bids": bids,
        "asks": asks,
    }


def emit_runtime_log(
    backend: Dict[str, Any],
    level: str,
    module: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    best_effort_post_json(backend, "/api/logs", {
        "level": level,
        "module": module,
        "message": message,
        "details": details or {},
    })


def emit_runtime_trace(
    backend: Dict[str, Any],
    trace_id: str,
    function_name: str,
    message: str,
    duration_ms: float,
    bot: Dict[str, Any],
    level: str = "TRACE",
    current_pair: Optional[str] = None,
    recommended_action: Optional[str] = None,
    confidence: Optional[float] = None,
    error_flag: bool = False,
    stage: Optional[str] = None,
    snapshot: Optional[Dict[str, Any]] = None,
) -> None:
    best_effort_post_json(backend, "/api/traces", {
        "level": level,
        "module": "bot_runtime",
        "traceId": trace_id,
        "functionName": function_name,
        "message": message,
        "stage": stage,
        "snapshot": snapshot,
        "durationMs": max(0.0, duration_ms),
        "botId": bot.get("id"),
        "currentPair": current_pair,
        "recommendedAction": recommended_action,
        "confidence": confidence,
        "errorFlag": error_flag,
    })


def build_candidate_pairs(
    allowed_pairs: Sequence[str],
    focus_pair: Optional[str],
    social_signals: Sequence[Dict[str, Any]],
    limit: Optional[int],
) -> List[str]:
    ordered_pairs: List[str] = []
    seen = set()

    def push(pair: Optional[str]) -> None:
        if not pair:
            return
        normalized = str(pair).strip().upper()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        ordered_pairs.append(normalized)

    push(focus_pair)
    allowed_pair_set = {str(pair).strip().upper() for pair in allowed_pairs}
    for signal in social_signals:
        pair = str(signal.get("pair") or "").strip().upper()
        if pair in allowed_pair_set:
            push(pair)

    for pair in allowed_pairs:
        push(str(pair).strip().upper())

    if isinstance(limit, int) and limit > 0:
        return ordered_pairs[:limit]

    return ordered_pairs


def get_primary_candles(snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(snapshot.get("primaryCandles") or [])


def get_series(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    candles = get_primary_candles(snapshot)
    closes = [to_float(entry.get("close")) for entry in candles]
    volumes = [to_float(entry.get("volume")) for entry in candles]
    price = to_float(snapshot.get("currentPrice"), to_float(candles[-1].get("close")) if candles else 0.0)
    return {
        "candles": candles,
        "closes": closes,
        "volumes": volumes,
        "price": price,
    }


def build_orderbook_stats(snapshot: Dict[str, Any]) -> Dict[str, Optional[float]]:
    orderbook = snapshot.get("orderbook") or {}
    bids = list(orderbook.get("bids") or [])
    asks = list(orderbook.get("asks") or [])
    bid_liquidity = sum(to_float(level[1]) for level in bids[:10] if len(level) >= 2)
    ask_liquidity = sum(to_float(level[1]) for level in asks[:10] if len(level) >= 2)
    best_bid = to_float(bids[0][0]) if bids else None
    best_ask = to_float(asks[0][0]) if asks else None

    if not best_bid or not best_ask:
        return {
            "bidLiquidity": bid_liquidity,
            "askLiquidity": ask_liquidity,
            "imbalance": None,
            "spread": None,
            "mid": None,
        }

    total_liquidity = bid_liquidity + ask_liquidity
    mid = (best_bid + best_ask) / 2.0
    spread = (best_ask - best_bid) / mid if mid > 0 else None
    imbalance = ((bid_liquidity - ask_liquidity) / total_liquidity) if total_liquidity > 0 else None
    return {
        "bidLiquidity": bid_liquidity,
        "askLiquidity": ask_liquidity,
        "imbalance": imbalance,
        "spread": spread,
        "mid": mid,
    }


def normalize_confidence(value: float) -> int:
    return int(round(clamp(value, 0.0, 100.0)))


def create_insight(
    specialist: str,
    action: str,
    confidence: float,
    reason: str,
    indicators: Dict[str, Optional[float]],
) -> Dict[str, Any]:
    normalized_indicators: Dict[str, Optional[float]] = {}
    for key, value in indicators.items():
        if value is None:
            normalized_indicators[key] = None
        else:
            normalized_indicators[key] = round(float(value), 8)

    return {
        "specialist": specialist,
        "action": action,
        "confidence": normalize_confidence(confidence),
        "reason": reason,
        "indicators": normalized_indicators,
    }


def analyze_rsi_reversion(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    closes = series["closes"]
    price = series["price"]
    rsi_period = int(round(to_float(params.get("rsiPeriod"), 14)))
    rsi_oversold = to_float(params.get("rsiOversold", params.get("rsiLower", 32)))
    rsi_overbought = to_float(params.get("rsiOverbought", params.get("rsiUpper", 68)))
    bb_period = int(round(to_float(params.get("bbPeriod"), 20)))
    bb_std_dev = to_float(params.get("bbStdDev"), 2.0)
    rsi = calculate_rsi(closes, rsi_period)
    bollinger = calculate_bollinger(closes, bb_period, bb_std_dev)

    if rsi is None or bollinger["lower"] is None or bollinger["upper"] is None:
        return create_insight("rsi_reversion", "hold", 28, "Insufficient RSI/Bollinger data", {
            "rsi": rsi,
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
        })

    if price <= bollinger["lower"] and rsi <= rsi_oversold:
        confidence = 58 + ((rsi_oversold - rsi) * 1.1) + (((bollinger["lower"] - price) / bollinger["lower"]) * 1000)
        return create_insight("rsi_reversion", "buy", confidence, "Price stretched below lower band with oversold RSI", {
            "rsi": rsi,
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
        })

    if price >= bollinger["upper"] and rsi >= rsi_overbought:
        confidence = 58 + ((rsi - rsi_overbought) * 1.1) + (((price - bollinger["upper"]) / bollinger["upper"]) * 1000)
        return create_insight("rsi_reversion", "sell", confidence, "Price extended above upper band with overbought RSI", {
            "rsi": rsi,
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
        })

    return create_insight("rsi_reversion", "hold", 42, "RSI/Bollinger not stretched enough for reversion", {
        "rsi": rsi,
        "price": price,
        "bbLower": bollinger["lower"],
        "bbUpper": bollinger["upper"],
    })


def analyze_macd_momentum(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    closes = series["closes"]
    volumes = series["volumes"]
    price = series["price"]
    macd = calculate_macd(
        closes,
        int(round(to_float(params.get("macdFast"), 12))),
        int(round(to_float(params.get("macdSlow"), 26))),
        int(round(to_float(params.get("macdSignal"), 9))),
    )
    lookback_periods = params.get("lookbackPeriods") or [6]
    if isinstance(lookback_periods, list) and lookback_periods:
        lookback = int(round(to_float(lookback_periods[0], 6)))
    else:
        lookback = 6
    momentum = calculate_rate_of_change(closes, lookback)
    volume_ratio = calculate_volume_ratio(volumes, 5, 20)
    threshold = to_float(params.get("momentumThreshold"), 0.75)

    if macd["macd"] is None or macd["signal"] is None or momentum is None:
        return create_insight("macd_momentum", "hold", 24, "Insufficient MACD/momentum data", {
            "macd": macd["macd"],
            "signal": macd["signal"],
            "histogram": macd["histogram"],
            "momentum": momentum,
            "volumeRatio": volume_ratio,
            "price": price,
        })

    if macd["macd"] > macd["signal"] and (macd["histogram"] or 0) > 0 and momentum > threshold:
        confidence = 55 + ((macd["histogram"] or 0) * 35) + (momentum * 4) + ((volume_ratio or 1) * 6)
        return create_insight("macd_momentum", "buy", confidence, "Positive MACD crossover with acceleration and volume confirmation", {
            "macd": macd["macd"],
            "signal": macd["signal"],
            "histogram": macd["histogram"],
            "momentum": momentum,
            "volumeRatio": volume_ratio,
            "price": price,
        })

    if macd["macd"] < macd["signal"] and (macd["histogram"] or 0) < 0 and momentum < -threshold:
        confidence = 55 + (abs(macd["histogram"] or 0) * 35) + (abs(momentum) * 4) + ((volume_ratio or 1) * 6)
        return create_insight("macd_momentum", "sell", confidence, "MACD turned down with weakening momentum", {
            "macd": macd["macd"],
            "signal": macd["signal"],
            "histogram": macd["histogram"],
            "momentum": momentum,
            "volumeRatio": volume_ratio,
            "price": price,
        })

    return create_insight("macd_momentum", "hold", 45, "Momentum still lacks a clean directional edge", {
        "macd": macd["macd"],
        "signal": macd["signal"],
        "histogram": macd["histogram"],
        "momentum": momentum,
        "volumeRatio": volume_ratio,
        "price": price,
    })


def analyze_ema_trend(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    closes = series["closes"]
    price = series["price"]
    fast_period = int(round(to_float(params.get("fastEma"), 20)))
    slow_period = int(round(to_float(params.get("slowEma"), 50)))
    trend_period = int(round(to_float(params.get("trendEma"), 200)))
    fast_series = calculate_ema_series(closes, fast_period)
    slow_series = calculate_ema_series(closes, slow_period)
    trend_series = calculate_ema_series(closes, trend_period)
    fast = get_last_valid(fast_series)
    slow = get_last_valid(slow_series)
    trend = get_last_valid(trend_series)
    slope = calculate_slope(fast_series, 5)

    if fast is None or slow is None:
        return create_insight("ema_trend", "hold", 20, "Insufficient EMA trend data", {
            "emaFast": fast,
            "emaSlow": slow,
            "emaTrend": trend,
            "slope": slope,
            "price": price,
        })

    if price > slow and fast > slow and (slope or 0) > 0:
        confidence = 56 + (((fast - slow) / slow) * 1200) + ((slope or 0) * 40) + (8 if trend and price > trend else 0)
        return create_insight("ema_trend", "buy", confidence, "Uptrend confirmed by EMA structure and positive slope", {
            "emaFast": fast,
            "emaSlow": slow,
            "emaTrend": trend,
            "slope": slope,
            "price": price,
        })

    if price < slow and fast < slow and (slope or 0) < 0:
        confidence = 56 + (((slow - fast) / max(fast, 1.0)) * 1200) + (abs(slope or 0) * 40) + (8 if trend and price < trend else 0)
        return create_insight("ema_trend", "sell", confidence, "Downtrend confirmed by EMA structure and negative slope", {
            "emaFast": fast,
            "emaSlow": slow,
            "emaTrend": trend,
            "slope": slope,
            "price": price,
        })

    return create_insight("ema_trend", "hold", 43, "EMAs still compressed or transitioning without a dominant trend", {
        "emaFast": fast,
        "emaSlow": slow,
        "emaTrend": trend,
        "slope": slope,
        "price": price,
    })


def analyze_bollinger_reversion(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    closes = series["closes"]
    price = series["price"]
    bb_period = int(round(to_float(params.get("bbPeriod"), 20)))
    bb_std_dev = to_float(params.get("bbStdDev"), 2.0)
    z_score_threshold = to_float(params.get("zscoreThreshold"), 1.8)
    bollinger = calculate_bollinger(closes, bb_period, bb_std_dev)
    z_score = calculate_z_score(closes, bb_period)

    if bollinger["lower"] is None or bollinger["upper"] is None or z_score is None:
        return create_insight("bollinger_reversion", "hold", 26, "Insufficient z-score/Bollinger data", {
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
            "zScore": z_score,
        })

    if price <= bollinger["lower"] and z_score <= -z_score_threshold:
        confidence = 54 + (abs(z_score) * 10) + (((bollinger["lower"] - price) / bollinger["lower"]) * 900)
        return create_insight("bollinger_reversion", "buy", confidence, "Extreme downside deviation with mean-reversion potential", {
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
            "zScore": z_score,
        })

    if price >= bollinger["upper"] and z_score >= z_score_threshold:
        confidence = 54 + (abs(z_score) * 10) + (((price - bollinger["upper"]) / bollinger["upper"]) * 900)
        return create_insight("bollinger_reversion", "sell", confidence, "Extreme upside deviation with mean-reversion pressure", {
            "price": price,
            "bbLower": bollinger["lower"],
            "bbUpper": bollinger["upper"],
            "zScore": z_score,
        })

    return create_insight("bollinger_reversion", "hold", 44, "Price remains near the mean without an extreme stretch", {
        "price": price,
        "bbLower": bollinger["lower"],
        "bbUpper": bollinger["upper"],
        "zScore": z_score,
    })


def analyze_volume_breakout(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    candles = series["candles"]
    closes = series["closes"]
    volumes = series["volumes"]
    price = series["price"]
    lookback = max(5, int(round(to_float(params.get("breakoutLookback"), 20))))
    volume_multiplier = to_float(params.get("volumeMultiplier"), 1.8)
    volume_ratio = calculate_volume_ratio(volumes, 5, 20)
    atr_ratio = calculate_atr_ratio(candles, int(round(to_float(params.get("atrPeriod"), 14))), price)

    if len(candles) < lookback + 1 or volume_ratio is None:
        return create_insight("volume_breakout", "hold", 25, "Insufficient breakout/volume context", {
            "price": price,
            "volumeRatio": volume_ratio,
            "atrRatio": atr_ratio,
            "breakoutHigh": None,
            "breakoutLow": None,
        })

    breakout_window = candles[-(lookback + 1):-1]
    breakout_high = max(to_float(entry.get("high")) for entry in breakout_window)
    breakout_low = min(to_float(entry.get("low")) for entry in breakout_window)

    if price > breakout_high and volume_ratio >= volume_multiplier:
        confidence = 58 + ((volume_ratio - volume_multiplier) * 18) + (((price - breakout_high) / breakout_high) * 1200)
        if atr_ratio:
            confidence += min(10.0, atr_ratio * 250.0)
        return create_insight("volume_breakout", "buy", confidence, "Breakout above recent highs confirmed by expanding volume", {
            "price": price,
            "volumeRatio": volume_ratio,
            "atrRatio": atr_ratio,
            "breakoutHigh": breakout_high,
            "breakoutLow": breakout_low,
        })

    if price < breakout_low and volume_ratio >= volume_multiplier:
        confidence = 58 + ((volume_ratio - volume_multiplier) * 18) + (((breakout_low - price) / breakout_low) * 1200)
        if atr_ratio:
            confidence += min(10.0, atr_ratio * 250.0)
        return create_insight("volume_breakout", "sell", confidence, "Breakdown below recent lows confirmed by expanding volume", {
            "price": price,
            "volumeRatio": volume_ratio,
            "atrRatio": atr_ratio,
            "breakoutHigh": breakout_high,
            "breakoutLow": breakout_low,
        })

    return create_insight("volume_breakout", "hold", 46, "Volume is being monitored but no validated breakout is present", {
        "price": price,
        "volumeRatio": volume_ratio,
        "atrRatio": atr_ratio,
        "breakoutHigh": breakout_high,
        "breakoutLow": breakout_low,
    })


def analyze_scalper(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    minute_candles = list((snapshot.get("candlesByPeriod") or {}).get("1m") or [])
    price = to_float(snapshot.get("currentPrice"))
    orderbook_stats = build_orderbook_stats(snapshot)
    spread_percent = (orderbook_stats["spread"] or 0.0) * 100.0 if orderbook_stats["spread"] is not None else None
    volume_24h = to_float(snapshot.get("volume24h"))
    min_volume = to_float(params.get("minVolume"), 100000.0)
    max_spread_percent = to_float(params.get("maxSpreadPercent"), 0.1)
    micro_momentum_threshold = to_float(params.get("microMomentumThresholdPercent"), 0.1)
    order_imbalance_threshold = to_float(params.get("orderImbalanceThreshold"), 0.6)

    if len(minute_candles) < 6 or orderbook_stats["imbalance"] is None or spread_percent is None:
        return create_insight("scalper", "hold", 22, "Insufficient microstructure data for scalping", {
            "price": price,
            "spreadPercent": spread_percent,
            "microMomentumPercent": None,
            "orderImbalance": orderbook_stats["imbalance"],
            "volume24h": volume_24h,
        })

    reference_price = to_float(minute_candles[-6].get("close"))
    micro_momentum_percent = ((price / reference_price) - 1.0) * 100.0 if reference_price > 0 else 0.0
    imbalance = orderbook_stats["imbalance"] or 0.0

    if spread_percent <= max_spread_percent and volume_24h >= min_volume and micro_momentum_percent > micro_momentum_threshold and imbalance > order_imbalance_threshold:
        confidence = 62 + ((micro_momentum_percent - micro_momentum_threshold) * 90) + (imbalance * 24)
        return create_insight("scalper", "buy", confidence, "Tight spread, positive micro momentum and bid-side imbalance", {
            "price": price,
            "spreadPercent": spread_percent,
            "microMomentumPercent": micro_momentum_percent,
            "orderImbalance": imbalance,
            "volume24h": volume_24h,
        })

    if spread_percent <= max_spread_percent and volume_24h >= min_volume and micro_momentum_percent < -micro_momentum_threshold and imbalance < -order_imbalance_threshold:
        confidence = 62 + ((abs(micro_momentum_percent) - micro_momentum_threshold) * 90) + (abs(imbalance) * 24)
        return create_insight("scalper", "sell", confidence, "Tight spread, negative micro momentum and ask-side imbalance", {
            "price": price,
            "spreadPercent": spread_percent,
            "microMomentumPercent": micro_momentum_percent,
            "orderImbalance": imbalance,
            "volume24h": volume_24h,
        })

    return create_insight("scalper", "hold", 41, "Scalping conditions remain incomplete for a clean micro move", {
        "price": price,
        "spreadPercent": spread_percent,
        "microMomentumPercent": micro_momentum_percent,
        "orderImbalance": imbalance,
        "volume24h": volume_24h,
    })


def analyze_arbitrage(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    price = to_float(snapshot.get("currentPrice"))
    orderbook_stats = build_orderbook_stats(snapshot)
    liquidity = (orderbook_stats["bidLiquidity"] or 0.0) + (orderbook_stats["askLiquidity"] or 0.0)
    spread_percent = (orderbook_stats["spread"] or 0.0) * 100.0 if orderbook_stats["spread"] is not None else None
    imbalance = orderbook_stats["imbalance"]
    min_spread_percent = to_float(params.get("minSpreadPercent"), 0.5)
    min_liquidity = to_float(params.get("minLiquidity"), 50000.0)
    candles_5m = list((snapshot.get("candlesByPeriod") or {}).get("5m") or [])
    candles_1h = list((snapshot.get("candlesByPeriod") or {}).get("1h") or [])

    if not candles_5m or not candles_1h or spread_percent is None or imbalance is None:
        return create_insight("arbitrage", "hold", 19, "Insufficient cross-window pricing context for dislocation analysis", {
            "price": price,
            "spreadPercent": spread_percent,
            "liquidity": liquidity,
            "dislocationPercent": None,
            "imbalance": imbalance,
        })

    anchor_window = [to_float(entry.get("close")) for entry in candles_1h[-12:]]
    anchor_price = average(anchor_window)
    if anchor_price in (None, 0):
        return create_insight("arbitrage", "hold", 19, "Unable to compute anchor price for arbitrage view", {
            "price": price,
            "spreadPercent": spread_percent,
            "liquidity": liquidity,
            "dislocationPercent": None,
            "imbalance": imbalance,
        })

    dislocation_percent = ((price - anchor_price) / anchor_price) * 100.0

    if abs(dislocation_percent) >= min_spread_percent and liquidity >= min_liquidity and spread_percent <= max(0.35, min_spread_percent / 2.0):
        if dislocation_percent < 0 and imbalance > 0:
            confidence = 56 + ((abs(dislocation_percent) - min_spread_percent) * 18) + (imbalance * 14)
            return create_insight("arbitrage", "buy", confidence, "Pair is trading below its short-term anchor with supportive bid imbalance", {
                "price": price,
                "spreadPercent": spread_percent,
                "liquidity": liquidity,
                "dislocationPercent": dislocation_percent,
                "imbalance": imbalance,
            })

        if dislocation_percent > 0 and imbalance < 0:
            confidence = 56 + ((abs(dislocation_percent) - min_spread_percent) * 18) + (abs(imbalance) * 14)
            return create_insight("arbitrage", "sell", confidence, "Pair is trading above its short-term anchor with supportive ask imbalance", {
                "price": price,
                "spreadPercent": spread_percent,
                "liquidity": liquidity,
                "dislocationPercent": dislocation_percent,
                "imbalance": imbalance,
            })

    return create_insight("arbitrage", "hold", 39, "No exploitable price dislocation survived the spread/liquidity filter", {
        "price": price,
        "spreadPercent": spread_percent,
        "liquidity": liquidity,
        "dislocationPercent": dislocation_percent,
        "imbalance": imbalance,
    })


def analyze_social_discovery(snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    series = get_series(snapshot)
    closes = series["closes"]
    price = series["price"]
    signal = snapshot.get("socialSignal") or {}
    momentum = calculate_rate_of_change(closes, 6)
    min_mentions = int(round(to_float(params.get("minMentions"), 8)))
    min_social_score = to_float(params.get("minSocialScore"), 60)

    if not signal:
        return create_insight("social_discovery", "hold", 18, "No recent social signal for this asset", {
            "socialScore": None,
            "mentions": None,
            "sentiment": None,
            "momentum": momentum,
            "price": price,
        })

    sentiment = str(signal.get("sentiment") or "neutral")
    score = to_float(signal.get("score"))
    mentions = int(round(to_float(signal.get("mentions"))))

    if sentiment == "bullish" and score >= min_social_score and mentions >= min_mentions and (momentum or 0) >= -0.6:
        confidence = 45 + (score * 0.32) + (mentions * 0.4) + max(momentum or 0, 0) * 5
        return create_insight("social_discovery", "buy", confidence, "Positive social traction is reinforcing this asset", {
            "socialScore": score,
            "mentions": mentions,
            "sentiment": 1.0,
            "momentum": momentum,
            "price": price,
        })

    if sentiment == "bearish" and score >= min_social_score and mentions >= min_mentions:
        confidence = 42 + (score * 0.28) + (mentions * 0.35) + max(-(momentum or 0), 0) * 4
        return create_insight("social_discovery", "sell", confidence, "Negative social sentiment is suggesting defensive posture", {
            "socialScore": score,
            "mentions": mentions,
            "sentiment": -1.0,
            "momentum": momentum,
            "price": price,
        })

    return create_insight("social_discovery", "hold", 37, "Social signal is being monitored but remains below the action threshold", {
        "socialScore": score,
        "mentions": mentions,
        "sentiment": 0.0 if sentiment == "neutral" else (1.0 if sentiment == "bullish" else -1.0),
        "momentum": momentum,
        "price": price,
    })


SPECIALISTS = {
    "rsi_reversion": analyze_rsi_reversion,
    "macd_momentum": analyze_macd_momentum,
    "ema_trend": analyze_ema_trend,
    "bollinger_reversion": analyze_bollinger_reversion,
    "volume_breakout": analyze_volume_breakout,
    "scalper": analyze_scalper,
    "arbitrage": analyze_arbitrage,
    "social_discovery": analyze_social_discovery,
}


def resolve_primary_specialist(bot: Dict[str, Any]) -> str:
    specialization = str(bot.get("specialization") or "").strip().lower()
    if specialization in SPECIALISTS:
        return specialization

    indicator_type = str(bot.get("indicatorType") or "").strip().lower()
    if "rsi" in indicator_type:
        return "rsi_reversion"
    if "macd" in indicator_type:
        return "macd_momentum"
    if "ema" in indicator_type:
        return "ema_trend"
    if "bollinger" in indicator_type or "bb" in indicator_type:
        return "bollinger_reversion"
    if "volume" in indicator_type:
        return "volume_breakout"

    strategy_type = str(bot.get("strategyType") or "").strip().lower()
    if strategy_type == "scalper":
        return "scalper"
    if strategy_type == "momentum":
        return "macd_momentum"
    if strategy_type == "trend_follower":
        return "ema_trend"
    if strategy_type == "mean_reversion":
        return "bollinger_reversion"
    if strategy_type == "arbitrage":
        return "arbitrage"
    return "rsi_reversion"


def analyze_specialist(name: str, snapshot: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    specialist = SPECIALISTS.get(name)
    if specialist is None:
        return create_insight(name, "hold", 0, "Specialist is not configured", {})
    return specialist(snapshot, params)


def build_consensus(primary_specialist: str, specialist_results: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    votes = {
        "buy": 0.0,
        "sell": 0.0,
        "hold": 0.0,
    }

    for result in specialist_results:
        is_primary = result.get("specialist") == primary_specialist
        weight = 1.0 if is_primary else 0.42
        action = str(result.get("action") or "hold")
        votes[action] = votes.get(action, 0.0) + (to_float(result.get("confidence")) * weight)

    buy_score = votes["buy"]
    sell_score = votes["sell"]
    hold_score = votes["hold"]
    conflict = abs(buy_score - sell_score) < 12 and buy_score > 30 and sell_score > 30

    if conflict:
        return {
            "action": "hold",
            "confidence": normalize_confidence((hold_score * 0.3) + 46),
            "reason": "Specialists diverged, so the ensemble stayed flat",
        }

    if buy_score > sell_score and buy_score >= max(hold_score, 48):
        return {
            "action": "buy",
            "confidence": normalize_confidence(buy_score - (sell_score * 0.18)),
            "reason": "Consensus leaned toward buying among active specialists",
        }

    if sell_score > buy_score and sell_score >= max(hold_score, 48):
        return {
            "action": "sell",
            "confidence": normalize_confidence(sell_score - (buy_score * 0.18)),
            "reason": "Consensus leaned toward selling among active specialists",
        }

    return {
        "action": "hold",
        "confidence": normalize_confidence(max(hold_score, 38)),
        "reason": "No specialist produced a strong enough edge",
    }


def build_runtime_summary(opportunities: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "analyzedPairs": len(opportunities),
        "actionablePairs": len([entry for entry in opportunities if entry.get("action") != "hold"]),
        "buySignals": len([entry for entry in opportunities if entry.get("action") == "buy"]),
        "sellSignals": len([entry for entry in opportunities if entry.get("action") == "sell"]),
        "holdSignals": len([entry for entry in opportunities if entry.get("action") == "hold"]),
    }


def build_heuristic_analysis(
    bot: Dict[str, Any],
    market_snapshots: Sequence[Dict[str, Any]],
    include_social_overlay: bool,
) -> Dict[str, Any]:
    primary_specialist = resolve_primary_specialist(bot)
    opportunities = []

    for snapshot in market_snapshots:
        specialist_results = [
            analyze_specialist(primary_specialist, snapshot, dict(bot.get("parameters") or {})),
        ]

        if include_social_overlay and snapshot.get("socialSignal"):
            social_params = dict(bot.get("parameters") or {})
            social_params["minSocialScore"] = bot.get("minSocialScore")
            social_params["minMentions"] = bot.get("minMentions")
            specialist_results.append(
                analyze_specialist("social_discovery", snapshot, social_params)
            )

        consensus = build_consensus(primary_specialist, specialist_results)
        opportunities.append({
            "pair": snapshot.get("pair"),
            "action": consensus["action"],
            "confidence": consensus["confidence"],
            "price": round(to_float(snapshot.get("currentPrice")), 8),
            "reason": f"{consensus['reason']}. " + " | ".join(
                f"{entry['specialist']}: {entry['reason']}" for entry in specialist_results
            ),
            "specialists": specialist_results,
        })

    opportunities.sort(key=lambda item: (-to_float(item.get("confidence")), str(item.get("pair") or "")))
    best_opportunity = next(
        (
            entry for entry in opportunities
            if entry.get("action") != "hold" and to_float(entry.get("confidence")) >= 55
        ),
        None,
    )
    return {
        "primarySpecialist": primary_specialist,
        "opportunities": opportunities,
        "bestOpportunity": best_opportunity,
        "summary": build_runtime_summary(opportunities),
    }


def build_prediction_snapshots(market_snapshots: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    snapshots = []
    for snapshot in market_snapshots:
        snapshots.append({
            "pair": snapshot.get("pair"),
            "currentPrice": snapshot.get("currentPrice"),
            "candles": snapshot.get("primaryCandles") or [],
            "socialSignal": snapshot.get("socialSignal"),
        })
    return snapshots


def run_model_analysis(
    bot: Dict[str, Any],
    market_snapshots: Sequence[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    model_artifact_path = str(bot.get("modelArtifactPath") or "").strip()
    if not model_artifact_path or not os.path.exists(model_artifact_path) or run_predict is None:
        return None

    prediction = run_predict({
        "artifactPath": model_artifact_path,
        "marketSnapshots": build_prediction_snapshots(market_snapshots),
    })
    price_by_pair = {
        str(snapshot.get("pair")): round(to_float(snapshot.get("currentPrice")), 8)
        for snapshot in market_snapshots
    }
    opportunities = []
    for entry in prediction.get("opportunities", []) or []:
        pair = str(entry.get("pair") or "")
        reason = str(entry.get("reason") or "Model inference")
        confidence = normalize_confidence(to_float(entry.get("confidence")))
        action = str(entry.get("action") or "hold")
        opportunities.append({
            "pair": pair,
            "action": action,
            "confidence": confidence,
            "price": price_by_pair.get(pair, 0.0),
            "reason": reason,
            "specialists": [{
                "specialist": str(prediction.get("primarySpecialist") or "python_model"),
                "action": action,
                "confidence": confidence,
                "reason": reason,
                "indicators": {},
            }],
        })

    opportunities.sort(key=lambda item: (-to_float(item.get("confidence")), str(item.get("pair") or "")))
    best_opportunity = next(
        (
            entry for entry in opportunities
            if entry.get("action") != "hold" and to_float(entry.get("confidence")) >= 55
        ),
        None,
    )
    return {
        "primarySpecialist": str(prediction.get("primarySpecialist") or "python_model"),
        "opportunities": opportunities,
        "bestOpportunity": best_opportunity,
        "summary": build_runtime_summary(opportunities),
    }


def fetch_market_snapshot(
    backend: Dict[str, Any],
    pair: str,
    timeframe: str,
    social_signal_map: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    try:
        candle_limits = {
            "1m": 120,
            "5m": 120,
            "15m": 120,
            "1h": 120,
            "4h": 90,
            "1d": 60,
        }

        price = fetch_price(backend, pair)
        orderbook = fetch_orderbook(backend, pair, 20)
        candles_by_period: Dict[str, List[Dict[str, Any]]] = {}
        for period in TIMEFRAMES:
            candles_by_period[period] = fetch_candles(backend, pair, period, candle_limits.get(period, 120))

        primary_candles = list(candles_by_period.get(timeframe) or [])
        if len(primary_candles) < 20:
            return None

        price = price if price > 0 else to_float(primary_candles[-1].get("close"))
        volume_24h = 0.0
        daily_candles = list(candles_by_period.get("1d") or [])
        if daily_candles:
            volume_24h = to_float(daily_candles[-1].get("volume"))
        elif len(primary_candles) >= 24:
            volume_24h = sum(to_float(entry.get("volume")) for entry in primary_candles[-24:])

        return {
            "pair": pair,
            "currentPrice": price,
            "primaryCandles": primary_candles,
            "candlesByPeriod": candles_by_period,
            "orderbook": orderbook,
            "volume24h": volume_24h,
            "socialSignal": social_signal_map.get(pair),
        }
    except Exception:
        return None


def split_pair(pair: str) -> Tuple[str, str]:
    parts = [part.strip().upper() for part in str(pair or "").split("/")]
    if len(parts) >= 2:
        return parts[0], parts[1]
    if len(parts) == 1 and parts[0]:
        return parts[0], "USDT"
    return "", "USDT"


def round_quantity(value: float) -> float:
    return round(float(value), 8)


def parse_timestamp(value: Any) -> Optional[datetime]:
    if not value:
        return None

    try:
        normalized = str(value).strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def build_return_series(candles: Sequence[Dict[str, Any]], lookback: int) -> List[float]:
    if len(candles) < 3:
        return []

    closes = [to_float(entry.get("close")) for entry in candles if to_float(entry.get("close")) > 0]
    if len(closes) < 3:
        return []

    selected = closes[-max(lookback + 1, 3):]
    returns: List[float] = []
    for index in range(1, len(selected)):
        previous = selected[index - 1]
        current = selected[index]
        if previous <= 0:
            continue
        returns.append((current - previous) / previous)
    return returns


def calculate_pearson_correlation(left: Sequence[float], right: Sequence[float]) -> Optional[float]:
    size = min(len(left), len(right))
    if size < 3:
        return None

    left_values = list(left[-size:])
    right_values = list(right[-size:])
    mean_left = average(left_values)
    mean_right = average(right_values)
    if mean_left is None or mean_right is None:
        return None

    numerator = 0.0
    left_variance = 0.0
    right_variance = 0.0
    for index in range(size):
        left_delta = left_values[index] - mean_left
        right_delta = right_values[index] - mean_right
        numerator += left_delta * right_delta
        left_variance += left_delta ** 2
        right_variance += right_delta ** 2

    denominator = math.sqrt(left_variance * right_variance)
    if denominator <= 0:
        return None

    return numerator / denominator


def normalize_analysis_context(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[int], bool, str]:
    backend = payload.get("backend") or {}
    bot = payload.get("bot") or {}
    bot_parameters = bot.get("parameters") or {}
    requested_pair_limit = payload.get("pairLimit")
    if requested_pair_limit is None:
        requested_pair_limit = bot_parameters.get("maxPairsToAnalyze")
    pair_limit: Optional[int] = None
    if requested_pair_limit is not None:
        parsed_pair_limit = int(round(to_float(requested_pair_limit)))
        if parsed_pair_limit > 0:
            pair_limit = parsed_pair_limit
    include_social_overlay = bool(payload.get("includeSocialOverlay", True))
    timeframe = str(bot.get("timeframe") or bot.get("parameters", {}).get("timeframe") or "1h").strip()
    if timeframe not in TIMEFRAMES:
        timeframe = "1h"
    return backend, bot, pair_limit, include_social_overlay, timeframe


def collect_analysis_context(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any], str]:
    backend, bot, pair_limit, include_social_overlay, timeframe = normalize_analysis_context(payload)

    try:
        social_signals = fetch_social_signals(backend)
    except Exception:
        social_signals = []
    social_signal_map = {
        str(entry.get("pair") or "").strip().upper(): entry
        for entry in social_signals
        if entry.get("pair")
    }
    allowed_pairs = [str(pair).strip().upper() for pair in (bot.get("allowedPairs") or []) if str(pair).strip()]
    candidate_pairs = build_candidate_pairs(
        allowed_pairs,
        bot.get("focusPair") or bot.get("currentPair"),
        social_signals,
        pair_limit,
    )

    market_snapshots: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(6, max(1, len(candidate_pairs)))) as executor:
        futures = {
            executor.submit(fetch_market_snapshot, backend, pair, timeframe, social_signal_map): pair
            for pair in candidate_pairs
        }
        for future in as_completed(futures):
            snapshot = future.result()
            if snapshot is not None:
                market_snapshots.append(snapshot)

    market_snapshots.sort(key=lambda entry: candidate_pairs.index(str(entry.get("pair"))))

    runtime_analysis = run_model_analysis(bot, market_snapshots)
    if runtime_analysis is None:
        runtime_analysis = build_heuristic_analysis(bot, market_snapshots, include_social_overlay)

    analysis = {
        "timeframe": timeframe,
        "analyzedPairs": [snapshot.get("pair") for snapshot in market_snapshots],
        "primarySpecialist": runtime_analysis.get("primarySpecialist"),
        "summary": runtime_analysis.get("summary"),
        "bestOpportunity": runtime_analysis.get("bestOpportunity"),
        "opportunities": runtime_analysis.get("opportunities"),
        "socialSignals": social_signals,
    }
    return backend, bot, social_signals, market_snapshots, analysis, timeframe


def run_analysis(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend, bot, _, _, analysis, _ = collect_analysis_context(payload)
    trace_id = str(uuid.uuid4())
    emit_runtime_trace(
        backend,
        trace_id,
        "run_analysis",
        "Starting python bot analysis",
        0.0,
        bot,
        stage="python_analysis_started",
        snapshot={
            "timeframe": analysis.get("timeframe"),
            "analyzedPairs": analysis.get("analyzedPairs"),
            "summary": analysis.get("summary"),
        },
    )

    best_opportunity = analysis.get("bestOpportunity") or {}
    emit_runtime_log(
        backend,
        "INFO",
        "bot_runtime",
        f"Python bot analysis completed for {bot.get('name') or bot.get('id')}",
        {
            "botId": bot.get("id"),
            "primarySpecialist": analysis.get("primarySpecialist"),
            "analyzedPairs": analysis.get("analyzedPairs"),
            "bestOpportunity": best_opportunity,
        },
    )
    emit_runtime_trace(
        backend,
        trace_id,
        "run_analysis",
        "Finished python bot analysis",
        1.0,
        bot,
        current_pair=best_opportunity.get("pair"),
        recommended_action=best_opportunity.get("action"),
        confidence=to_float(best_opportunity.get("confidence")) if best_opportunity else None,
        stage="python_analysis_completed",
        snapshot={
            "timeframe": analysis.get("timeframe"),
            "primarySpecialist": analysis.get("primarySpecialist"),
            "summary": analysis.get("summary"),
            "bestOpportunity": best_opportunity,
            "topOpportunities": (analysis.get("opportunities") or [])[:5],
            "socialSignals": (analysis.get("socialSignals") or [])[:5],
        },
    )

    return analysis


def resolve_cycle_balances(cycle: Dict[str, Any]) -> Dict[str, float]:
    balances_by_currency: Dict[str, float] = {}
    for entry in cycle.get("balances") or []:
        if not isinstance(entry, dict):
            continue
        currency = str(entry.get("currency") or "").strip().upper()
        if not currency:
            continue
        balances_by_currency[currency] = to_float(entry.get("available"))
    return balances_by_currency


def resolve_open_positions(cycle: Dict[str, Any]) -> List[Dict[str, Any]]:
    positions: List[Dict[str, Any]] = []
    for entry in cycle.get("openPositions") or []:
        if not isinstance(entry, dict):
            continue
        pair = str(entry.get("pair") or "").strip().upper()
        if not pair:
            continue
        positions.append({
            "pair": pair,
            "quantity": to_float(entry.get("quantity")),
            "averageEntryPrice": to_float(entry.get("averageEntryPrice")),
            "currentPrice": to_float(entry.get("currentPrice")),
            "pnlPercent": to_float(entry.get("pnlPercent")),
            "exposureBrl": to_float(entry.get("exposureBrl")),
        })
    return positions


def evaluate_circuit_breaker(cycle: Dict[str, Any]) -> Optional[str]:
    risk_config = cycle.get("riskConfig") or {}
    recent_sells = list(cycle.get("recentSellTransactions") or [])
    if not recent_sells:
        return None

    cooldown_minutes = max(1, int(round(to_float(risk_config.get("circuitBreakerCooldownMinutes"), 60))))
    cooldown_threshold = datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)
    max_consecutive_losses = max(1, int(round(to_float(risk_config.get("maxConsecutiveLosses"), 3))))
    recent_loss_streak = recent_sells[:max_consecutive_losses]
    if len(recent_loss_streak) >= max_consecutive_losses:
        parsed_dates = [parse_timestamp(entry.get("date")) for entry in recent_loss_streak]
        if all(to_float(entry.get("profitBrl")) < 0 for entry in recent_loss_streak) and parsed_dates[0] and parsed_dates[0] >= cooldown_threshold:
            return f"Circuit breaker ativo após {max_consecutive_losses} perdas consecutivas"

    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_sells = [entry for entry in recent_sells if (parse_timestamp(entry.get("date")) or start_of_day) >= start_of_day]
    daily_pnl = sum(to_float(entry.get("profitBrl")) for entry in today_sells)
    if daily_pnl >= 0:
        return None

    total_portfolio_brl = to_float((cycle.get("portfolio") or {}).get("totalPortfolioBrl"))
    daily_loss_percent = to_float(risk_config.get("circuitBreakerDailyLossPercent"))
    threshold = total_portfolio_brl * (daily_loss_percent / 100.0)
    latest_loss = next((entry for entry in today_sells if to_float(entry.get("profitBrl")) < 0), None)
    latest_loss_date = parse_timestamp((latest_loss or {}).get("date"))

    if threshold > 0 and abs(daily_pnl) >= threshold and latest_loss_date and latest_loss_date >= cooldown_threshold:
        return f"Circuit breaker ativo por perda diária de R$ {abs(daily_pnl):.2f}"

    return None


def select_risk_override(open_positions: Sequence[Dict[str, Any]], risk_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    stop_loss_percent = to_float(risk_config.get("stopLossPercent"))
    take_profit_percent = to_float(risk_config.get("takeProfitPercent"))

    stop_loss_candidates = [
        position for position in open_positions
        if position.get("quantity", 0.0) > 0 and position.get("pnlPercent", 0.0) <= -stop_loss_percent
    ]
    stop_loss_candidates.sort(key=lambda entry: entry.get("pnlPercent", 0.0))
    if stop_loss_candidates:
        candidate = stop_loss_candidates[0]
        return {
            "pair": candidate.get("pair"),
            "action": "sell",
            "confidence": 100,
            "price": candidate.get("currentPrice"),
            "reason": f"Stop loss acionado em {candidate.get('pair')} ({candidate.get('pnlPercent'):.2f}%)",
        }

    take_profit_candidates = [
        position for position in open_positions
        if position.get("quantity", 0.0) > 0 and position.get("pnlPercent", 0.0) >= take_profit_percent
    ]
    take_profit_candidates.sort(key=lambda entry: entry.get("pnlPercent", 0.0), reverse=True)
    if take_profit_candidates:
        candidate = take_profit_candidates[0]
        return {
            "pair": candidate.get("pair"),
            "action": "sell",
            "confidence": 100,
            "price": candidate.get("currentPrice"),
            "reason": f"Take profit acionado em {candidate.get('pair')} ({candidate.get('pnlPercent'):.2f}%)",
        }

    return None


def is_in_cooldown(cycle: Dict[str, Any], pair: str, action: str) -> bool:
    trade_cooldown_ms = max(1, int(round(to_float(cycle.get("tradeCooldownMs"), 300000))))
    threshold = datetime.now(timezone.utc) - timedelta(milliseconds=trade_cooldown_ms)
    for entry in cycle.get("recentExecutions") or []:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("pair") or "").strip().upper() != pair:
            continue
        if str(entry.get("action") or "").strip().lower() != action:
            continue
        executed_at = parse_timestamp(entry.get("executedAt"))
        if executed_at and executed_at >= threshold:
            return True
    return False


def build_cycle_candidates(
    analysis: Dict[str, Any],
    risk_override: Optional[Dict[str, Any]],
) -> List[Tuple[Dict[str, Any], bool, str]]:
    candidates: List[Tuple[Dict[str, Any], bool, str]] = []
    seen = set()

    def push(opportunity: Optional[Dict[str, Any]], is_risk_override: bool, source: str) -> None:
        if not isinstance(opportunity, dict):
            return
        pair = str(opportunity.get("pair") or "").strip().upper()
        action = str(opportunity.get("action") or "hold").strip().lower()
        if not pair or action == "hold":
            return
        candidate_key = (pair, action)
        if candidate_key in seen:
            return
        seen.add(candidate_key)
        candidates.append((opportunity, is_risk_override, source))

    push(risk_override, True, "risk_override")
    for opportunity in analysis.get("opportunities") or []:
        push(opportunity, False, "analysis")

    return candidates


def build_plan_entry(
    status: str,
    reason: str,
    opportunity: Optional[Dict[str, Any]] = None,
    quantity: Optional[float] = None,
    is_risk_override: bool = False,
    paper_simulation: Optional[Dict[str, Any]] = None,
    source: str = "analysis",
    rank: Optional[int] = None,
) -> Dict[str, Any]:
    pair = str((opportunity or {}).get("pair") or "").strip().upper() or None
    action = str((opportunity or {}).get("action") or "").strip().lower() or None
    raw_confidence = (opportunity or {}).get("confidence")
    confidence = normalize_confidence(to_float(raw_confidence)) if raw_confidence is not None else None
    plan: Dict[str, Any] = {
        "status": status,
        "reason": str(reason),
        "pair": pair,
        "action": action,
        "confidence": confidence,
        "decisionPrice": to_float((opportunity or {}).get("price")) if opportunity else None,
        "quantity": quantity,
        "isRiskOverride": is_risk_override,
        "paperSimulation": paper_simulation,
        "source": source,
        "rank": rank,
    }
    return plan


def build_trade_plan(
    cycle: Dict[str, Any],
    opportunity: Dict[str, Any],
    snapshot: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    balances_by_currency = resolve_cycle_balances(cycle)
    execution_mode = str(cycle.get("executionMode") or "paper")
    max_trade_amount = to_float(cycle.get("maxTradeAmount"), 1000.0)
    max_trade_amount_unit = str(cycle.get("maxTradeAmountUnit") or "USDT").strip().lower()
    risk_config = cycle.get("riskConfig") or {}
    pair = str(opportunity.get("pair") or "").strip().upper()
    action = str(opportunity.get("action") or "hold").strip().lower()
    price = to_float(opportunity.get("price"))
    base_currency, quote_currency = split_pair(pair)

    if action == "buy":
        quote_available = balances_by_currency.get(quote_currency, 0.0)
        notes: List[str] = []
        if max_trade_amount_unit == "percent":
            quote_budget = quote_available * (max_trade_amount / 100.0)
        else:
            quote_budget = min(max_trade_amount, quote_available)

        max_position_size = to_float(risk_config.get("maxPositionSize"))
        if max_position_size > 0:
            capped_budget = min(quote_budget, max_position_size)
            if capped_budget + 1e-8 < quote_budget:
                notes.append(f"teto máximo por posição aplicado em {max_position_size:.2f} {quote_currency}")
            quote_budget = capped_budget

        atr_ratio = calculate_atr_ratio((snapshot or {}).get("primaryCandles") or [], int(round(to_float(risk_config.get("atrPeriod"), 14))), price)
        target_atr_percent = to_float(risk_config.get("targetAtrPercent"), 0.025)
        min_atr_position_factor = to_float(risk_config.get("minAtrPositionFactor"), 0.35)
        if atr_ratio is not None and atr_ratio > 0:
            atr_factor = clamp(target_atr_percent / atr_ratio, min_atr_position_factor, 1.0)
            if atr_factor + 1e-8 < 1.0:
                quote_budget *= atr_factor
                notes.append(
                    f"sizing por ATR reduziu a posição para {(atr_factor * 100):.0f}% do orçamento base (ATR {(atr_ratio * 100):.2f}%)"
                )

        if quote_budget <= 1e-8 or price <= 0:
            return {
                "shouldExecute": False,
                "reason": f"Saldo insuficiente em {quote_currency} para nova compra",
            }

        quantity = round_quantity(quote_budget / price)
        if quantity <= 1e-8:
            return {
                "shouldExecute": False,
                "reason": "Quantidade calculada ficou abaixo do mínimo operacional",
            }

        base_reason = "Sugestão gerada para revisão manual" if execution_mode == "semi_auto" else "Plano de compra pronto para execução"
        return {
            "shouldExecute": True,
            "reason": " · ".join([base_reason] + notes) if notes else base_reason,
            "quantity": quantity,
        }

    base_available = balances_by_currency.get(base_currency, 0.0)
    if max_trade_amount_unit == "percent":
        quantity = round_quantity(base_available * (max_trade_amount / 100.0))
    else:
        quantity = round_quantity(min(base_available, max_trade_amount / max(price, 1e-8)))

    if quantity <= 1e-8:
        return {
            "shouldExecute": False,
            "reason": f"Sem saldo disponível de {base_currency} para venda",
        }

    return {
        "shouldExecute": True,
        "reason": "Sugestão de venda gerada para revisão manual" if execution_mode == "semi_auto" else "Plano de venda pronto para execução",
        "quantity": quantity,
    }


def evaluate_portfolio_guard(
    backend: Dict[str, Any],
    bot: Dict[str, Any],
    cycle: Dict[str, Any],
    opportunity: Dict[str, Any],
    quantity: float,
    snapshot: Optional[Dict[str, Any]],
    open_positions: Sequence[Dict[str, Any]],
) -> Optional[str]:
    if str(opportunity.get("action") or "").lower() != "buy":
        return None

    risk_config = cycle.get("riskConfig") or {}
    portfolio = cycle.get("portfolio") or {}
    total_portfolio_brl = to_float(portfolio.get("totalPortfolioBrl"))
    if total_portfolio_brl <= 1e-8:
        return None

    pair = str(opportunity.get("pair") or "").strip().upper()
    price = to_float(opportunity.get("price"))
    _, quote_currency = split_pair(pair)
    quote_to_brl = fetch_exchange_rate(backend, quote_currency, "BRL")
    planned_exposure_brl = quantity * price * quote_to_brl
    if planned_exposure_brl <= 1e-8:
        return None

    current_pair_exposure_brl = sum(position.get("exposureBrl", 0.0) for position in open_positions if position.get("pair") == pair)
    is_new_position = current_pair_exposure_brl <= 1e-8
    open_positions_count = int(round(to_float(portfolio.get("openPositionsCount"), float(len(open_positions)))))
    max_concurrent_trades = max(1, int(round(to_float(risk_config.get("maxConcurrentTrades"), 5))))
    if is_new_position and open_positions_count >= max_concurrent_trades:
        return f"Limite de {max_concurrent_trades} posições simultâneas atingido"

    per_coin_limit = total_portfolio_brl * to_float(risk_config.get("maxExposurePerCoin"), 1.0)
    if per_coin_limit > 1e-8 and current_pair_exposure_brl + planned_exposure_brl > per_coin_limit + 1e-8:
        return f"Exposição máxima por moeda excedida para {pair}"

    total_exposure_limit = total_portfolio_brl * to_float(risk_config.get("maxTotalExposure"), 1.0)
    total_exposure_brl = to_float(portfolio.get("totalExposureBrl"))
    if total_exposure_limit > 1e-8 and total_exposure_brl + planned_exposure_brl > total_exposure_limit + 1e-8:
        return "Exposição total do portfólio excederia o limite configurado"

    correlation_threshold = to_float(risk_config.get("minCorrelationThreshold"))
    if correlation_threshold <= 0 or snapshot is None:
        return None

    comparison_positions = [position for position in open_positions if position.get("pair") != pair and position.get("quantity", 0.0) > 1e-8]
    if not comparison_positions:
        return None

    lookback = max(3, int(round(to_float(risk_config.get("correlationLookbackCandles"), 48))))
    candidate_returns = build_return_series((snapshot or {}).get("primaryCandles") or [], lookback)
    if len(candidate_returns) < 3:
        return None

    timeframe = str(bot.get("timeframe") or bot.get("parameters", {}).get("timeframe") or "1h").strip()
    highest: Optional[Tuple[str, float]] = None
    for position in comparison_positions:
        comparison_pair = str(position.get("pair") or "").strip().upper()
        comparison_candles = fetch_candles(backend, comparison_pair, timeframe, max(lookback + 1, 60))
        correlation = calculate_pearson_correlation(candidate_returns, build_return_series(comparison_candles, lookback))
        if correlation is None:
            continue
        if highest is None or abs(correlation) > abs(highest[1]):
            highest = (comparison_pair, correlation)

    if highest and abs(highest[1]) >= correlation_threshold:
        return f"Correlação de {(highest[1] * 100):.1f}% com {highest[0]} excede o limite de {(correlation_threshold * 100):.0f}%"

    return None


def build_paper_simulation(opportunity: Dict[str, Any], quantity: float) -> Dict[str, Any]:
    confidence = to_float(opportunity.get("confidence"))
    requested_quantity = round_quantity(quantity)
    reference_price = to_float(opportunity.get("price"))
    action = str(opportunity.get("action") or "hold")
    uncertainty_factor = clamp((100.0 - confidence) / 100.0, 0.0, 1.0)
    base_slippage_percent = clamp(to_float(os.environ.get("BOT_PAPER_SLIPPAGE_PERCENT"), 0.12), 0.0, 2.0)
    min_fill_percent = clamp(to_float(os.environ.get("BOT_PAPER_MIN_FILL_PERCENT"), 0.88), 0.5, 1.0)
    latency_ms = max(0, int(round(to_float(os.environ.get("BOT_PAPER_LATENCY_MS"), 350))))
    slippage_percent = clamp(base_slippage_percent + (uncertainty_factor * 0.18), base_slippage_percent, 0.6)
    simulated_fill_percent = clamp(1.0 - (uncertainty_factor * 0.22), min_fill_percent, 1.0)
    executed_quantity = round_quantity(requested_quantity * simulated_fill_percent)
    if executed_quantity <= 1e-8:
        executed_quantity = requested_quantity
    price_factor = 1.0 + (slippage_percent / 100.0) if action == "buy" else max(1e-6, 1.0 - (slippage_percent / 100.0))

    return {
        "requestedQuantity": requested_quantity,
        "executedQuantity": executed_quantity,
        "executionPrice": round(reference_price * price_factor, 8),
        "slippagePercent": round(slippage_percent, 4),
        "simulatedLatencyMs": int(round(latency_ms + (uncertainty_factor * 400.0))),
        "simulatedFillPercent": round(simulated_fill_percent, 4),
    }


def evaluate_cycle_candidate(
    backend: Dict[str, Any],
    bot: Dict[str, Any],
    cycle: Dict[str, Any],
    market_snapshots: Sequence[Dict[str, Any]],
    open_positions: Sequence[Dict[str, Any]],
    opportunity: Dict[str, Any],
    is_risk_override: bool,
    source: str,
    rank: int,
) -> Dict[str, Any]:
    pair = str(opportunity.get("pair") or "").strip().upper()
    action = str(opportunity.get("action") or "hold").strip().lower()
    confidence = normalize_confidence(to_float(opportunity.get("confidence")))
    minimum_confidence = normalize_confidence(to_float(cycle.get("minimumConfidence"), 68))

    if not pair or action == "hold":
        return build_plan_entry(
            "skipped",
            "Oportunidade inválida retornada pelo runtime",
            opportunity=opportunity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    if not is_risk_override and confidence < minimum_confidence:
        return build_plan_entry(
            "skipped",
            f"Confiança {confidence}% abaixo do mínimo configurado ({minimum_confidence}%)",
            opportunity=opportunity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    if not is_risk_override and is_in_cooldown(cycle, pair, action):
        return build_plan_entry(
            "skipped",
            "Cooldown ativo para evitar repetição da mesma ordem no mesmo par",
            opportunity=opportunity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    execution_mode = str(cycle.get("executionMode") or "paper")
    if execution_mode == "full_auto" and action == "buy":
        block_reason = str(cycle.get("fullAutoBuyBlockReason") or "").strip()
        if block_reason:
            return build_plan_entry(
                "skipped",
                block_reason,
                opportunity=opportunity,
                is_risk_override=is_risk_override,
                source=source,
                rank=rank,
            )

    if execution_mode == "full_auto" and not bool(cycle.get("exchangeCredentialsReady")):
        return build_plan_entry(
            "skipped",
            "Credenciais da Binance não configuradas para modo full_auto",
            opportunity=opportunity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    open_exchange_order = cycle.get("openExchangeOrder") or {}
    if isinstance(open_exchange_order, dict) and open_exchange_order.get("pair"):
        quantity = to_float(open_exchange_order.get("requestedQuantity")) or to_float(open_exchange_order.get("quantity"))
        status_label = "parcialmente executada" if str(open_exchange_order.get("status")) == "partially_filled" else "pendente"
        return build_plan_entry(
            "skipped",
            f"Ainda existe uma ordem {status_label} em {open_exchange_order.get('pair')}; o bot vai aguardar a reconciliação antes de abrir nova posição",
            opportunity=opportunity,
            quantity=quantity if quantity > 0 else None,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    snapshot = next((entry for entry in market_snapshots if str(entry.get("pair") or "").strip().upper() == pair), None)
    trade_plan = build_trade_plan(cycle, opportunity, snapshot)
    trade_quantity = to_float(trade_plan.get("quantity"))
    if not trade_plan.get("shouldExecute") or trade_quantity <= 1e-8:
        return build_plan_entry(
            "skipped",
            str(trade_plan.get("reason") or "Plano de trade inválido"),
            opportunity=opportunity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    portfolio_guard_reason = None
    if not is_risk_override:
        portfolio_guard_reason = evaluate_portfolio_guard(
            backend,
            bot,
            cycle,
            opportunity,
            trade_quantity,
            snapshot,
            open_positions,
        )

    if portfolio_guard_reason:
        return build_plan_entry(
            "skipped",
            portfolio_guard_reason,
            opportunity=opportunity,
            quantity=trade_quantity,
            is_risk_override=is_risk_override,
            source=source,
            rank=rank,
        )

    paper_simulation = build_paper_simulation(opportunity, trade_quantity) if execution_mode == "paper" else None
    if execution_mode == "semi_auto":
        status = "suggested"
        reason = opportunity.get("reason") if is_risk_override else trade_plan.get("reason")
    else:
        status = "execute"
        if execution_mode == "paper" and paper_simulation is not None:
            reason = (
                f"{opportunity.get('reason')} · ordem executada em modo paper"
                if is_risk_override
                else f"Executado automaticamente em modo paper · slippage {paper_simulation['slippagePercent']:.2f}% · fill {int(round(paper_simulation['simulatedFillPercent'] * 100))}%"
            )
        elif execution_mode == "full_auto":
            reason = (
                f"{opportunity.get('reason')} · ordem real executada na Binance"
                if is_risk_override
                else "Executado automaticamente em modo full_auto na Binance"
            )
        else:
            reason = str(trade_plan.get("reason") or "Plano aprovado para execução")

    return build_plan_entry(
        status,
        str(reason),
        opportunity=opportunity,
        quantity=trade_quantity,
        is_risk_override=is_risk_override,
        paper_simulation=paper_simulation,
        source=source,
        rank=rank,
    )


def apply_cycle_execution_limit(
    plans: Sequence[Dict[str, Any]],
    max_executable_opportunities: int,
) -> List[Dict[str, Any]]:
    if max_executable_opportunities <= 0:
        return list(plans)

    limited_plans: List[Dict[str, Any]] = []
    approved_count = 0
    for plan in plans:
        if str(plan.get("status") or "") in ("execute", "suggested"):
            approved_count += 1
            if approved_count > max_executable_opportunities:
                limited_plan = dict(plan)
                limited_plan["status"] = "skipped"
                limited_plan["reason"] = f"Limite de {max_executable_opportunities} oportunidades por ciclo atingido"
                limited_plans.append(limited_plan)
                continue

        limited_plans.append(plan)

    return limited_plans


def run_cycle(payload: Dict[str, Any]) -> Dict[str, Any]:
    backend, bot, _, market_snapshots, analysis, _ = collect_analysis_context(payload)
    cycle = payload.get("cycle") or {}
    trace_id = str(uuid.uuid4())
    emit_runtime_trace(
        backend,
        trace_id,
        "run_cycle",
        "Starting python bot cycle planning",
        0.0,
        bot,
        stage="python_cycle_started",
        snapshot={
            "executionMode": cycle.get("executionMode"),
            "minimumConfidence": cycle.get("minimumConfidence"),
            "portfolio": cycle.get("portfolio"),
            "riskConfig": cycle.get("riskConfig"),
            "openPositions": (cycle.get("openPositions") or [])[:8],
            "recentExecutions": (cycle.get("recentExecutions") or [])[:8],
        },
    )

    open_positions = resolve_open_positions(cycle)
    risk_override = select_risk_override(open_positions, cycle.get("riskConfig") or {})
    candidate_opportunities = build_cycle_candidates(analysis, risk_override)

    skip_reason = evaluate_circuit_breaker(cycle)
    if skip_reason:
        plan = {
            "status": "skipped",
            "reason": skip_reason,
        }
        result = {
            "analysis": analysis,
            "plan": plan,
            "plans": [],
        }
        emit_runtime_trace(
            backend,
            trace_id,
            "run_cycle",
            "Python bot cycle skipped by circuit breaker",
            1.0,
            bot,
            error_flag=False,
            stage="python_cycle_circuit_breaker",
            snapshot={
                "reason": skip_reason,
                "executionMode": cycle.get("executionMode"),
                "portfolio": cycle.get("portfolio"),
            },
        )
        return result

    if not candidate_opportunities:
        plan = {
            "status": "skipped",
            "reason": "Nenhuma oportunidade forte o suficiente para execução neste ciclo",
            "action": "hold",
        }
        return {
            "analysis": analysis,
            "plan": plan,
            "plans": [],
        }

    evaluated_plans = [
        evaluate_cycle_candidate(
            backend,
            bot,
            cycle,
            market_snapshots,
            open_positions,
            opportunity,
            is_risk_override,
            source,
            rank,
        )
        for rank, (opportunity, is_risk_override, source) in enumerate(candidate_opportunities, start=1)
    ]
    max_executable_opportunities = max(
        1,
        int(round(to_float(
            cycle.get("maxExecutableOpportunitiesPerCycle")
            if cycle.get("maxExecutableOpportunitiesPerCycle") is not None
            else (bot.get("parameters") or {}).get("maxExecutableOpportunitiesPerCycle"),
            1,
        ))),
    )
    plans = apply_cycle_execution_limit(evaluated_plans, max_executable_opportunities)
    plan = next((entry for entry in plans if str(entry.get("status") or "") != "skipped"), None)
    if plan is None and plans:
        plan = plans[0]
    if plan is None:
        plan = {
            "status": "skipped",
            "reason": "Nenhuma oportunidade forte o suficiente para execução neste ciclo",
            "action": "hold",
        }

    pair = str(plan.get("pair") or "").strip().upper() or None
    action = str(plan.get("action") or "").strip().lower() or None
    confidence = to_float(plan.get("confidence")) if plan.get("confidence") is not None else None

    emit_runtime_log(
        backend,
        "INFO",
        "bot_runtime",
        f"Python bot cycle planned for {bot.get('name') or bot.get('id')}",
        {
            "botId": bot.get("id"),
            "pair": pair,
            "action": action,
            "status": plan.get("status"),
            "reason": plan.get("reason"),
            "quantity": plan.get("quantity"),
            "plansCount": len(plans),
        },
    )
    emit_runtime_trace(
        backend,
        trace_id,
        "run_cycle",
        "Finished python bot cycle planning",
        1.0,
        bot,
        current_pair=pair,
        recommended_action=action,
        confidence=confidence if confidence is not None else None,
        stage="python_cycle_completed",
        snapshot={
            "executionMode": cycle.get("executionMode"),
            "summary": analysis.get("summary"),
            "plan": plan,
            "plans": plans[:5],
            "candidatePairs": [snapshot.get("pair") for snapshot in market_snapshots[:10]],
            "openPositionsCount": len(open_positions),
            "riskOverride": risk_override,
        },
    )

    return {
        "analysis": analysis,
        "plan": plan,
        "plans": plans,
    }


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "analyze"
    payload = read_payload()

    if command == "analyze":
        result = run_analysis(payload)
    elif command == "cycle":
        result = run_cycle(payload)
    else:
        raise ValueError(f"Unsupported command: {command}")
    sys.stdout.write(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
