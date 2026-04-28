from __future__ import annotations

from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request

from .config import (
    BREAKOUT_CLOSE_LOCATION_MIN,
    BREAKOUT_CONFIRM_TREND_MIN,
    BREAKOUT_MOMENTUM_15_MIN,
    BREAKOUT_SCORE_DELTA,
    BREAKOUT_TREND_FAST_MIN,
    BREAKOUT_VOLUME_RATIO_MIN,
    BUY_THRESHOLD,
    COOLDOWN_AFTER_LOSS_CYCLES,
    DEFAULT_CYCLE_HISTORY_LIMIT,
    DEFAULT_FEE_RATE,
    DEFAULT_INITIAL_CAPITAL,
    DEFAULT_KLINE_INTERVAL,
    DEFAULT_KLINE_LIMIT,
    DEFAULT_LEARNING_HORIZON_CYCLES,
    DEFAULT_MAX_OPEN_POSITIONS,
    DEFAULT_POLL_SECONDS,
    DEFAULT_QUOTE_ASSET,
    DEFAULT_SELECTED_SYMBOLS,
    DEFAULT_STRATEGY_PROFILE,
    DEFAULT_TRADE_SIZE_FRACTION,
    DEFAULT_TIME_EXIT_ENABLED,
    ENTRY_CONFIRM_MOMENTUM_MIN,
    ENTRY_CONFIRM_TREND_MIN,
    ENTRY_RSI_LIMIT,
    ENTRY_SIGNAL_QUALITY_MIN,
    LEARNING_WARMUP_CYCLES,
    MAX_FEE_RATE,
    MAX_DIRECTION_FLIP_RATIO,
    MAX_POSITION_AGE_MINUTES,
    MAX_PRIMARY_VOLATILITY,
    MIN_CANDLE_BODY_RATIO,
    MIN_TRADE_NOTIONAL,
    MIN_VOLUME_RATIO,
    SELL_THRESHOLD,
    STOP_LOSS_RATIO,
    STRATEGY_PROFILES,
    TAKE_PROFIT_RATIO,
    TREND_CONT_CONFIRM_TREND_MIN,
    TREND_CONFIRM_INTERVAL,
    TREND_CONFIRM_LIMIT,
    TREND_CONT_SCORE_DELTA,
    TREND_CONT_SIGNAL_QUALITY_MIN,
    TREND_CONT_VOLUME_RATIO_MIN,
)
from .database import Database
from .market import BinanceMarketClient, MarketDataError
from .simulator import TradingSimulator
from .strategy import MicroTradeStrategy


CUSTOM_STRATEGY_PROFILE = "customizado"


def build_strategy_profiles_payload() -> Dict[str, Dict[str, Any]]:
    payload = {}
    for key, values in STRATEGY_PROFILES.items():
        payload[key] = {
            "label": values["label"],
            "buy_threshold": float(values["buy_threshold"]),
            "sell_threshold": float(values["sell_threshold"]),
            "take_profit_ratio": float(values["take_profit_ratio"]),
            "stop_loss_ratio": float(values["stop_loss_ratio"]),
            "max_position_age_minutes": int(values["max_position_age_minutes"]),
            "max_primary_volatility": float(values["max_primary_volatility"]),
            "max_direction_flip_ratio": float(values["max_direction_flip_ratio"]),
            "min_volume_ratio": float(values["min_volume_ratio"]),
            "min_candle_body_ratio": float(values["min_candle_body_ratio"]),
            "entry_rsi_limit": float(values["entry_rsi_limit"]),
            "entry_signal_quality_min": float(values["entry_signal_quality_min"]),
            "entry_confirm_trend_min": float(values["entry_confirm_trend_min"]),
            "entry_confirm_momentum_min": float(values["entry_confirm_momentum_min"]),
            "breakout_score_delta": float(values["breakout_score_delta"]),
            "breakout_trend_fast_min": float(values["breakout_trend_fast_min"]),
            "breakout_confirm_trend_min": float(values["breakout_confirm_trend_min"]),
            "breakout_momentum_15_min": float(values["breakout_momentum_15_min"]),
            "breakout_volume_ratio_min": float(values["breakout_volume_ratio_min"]),
            "breakout_close_location_min": float(values["breakout_close_location_min"]),
            "trend_cont_score_delta": float(values["trend_cont_score_delta"]),
            "trend_cont_signal_quality_min": float(values["trend_cont_signal_quality_min"]),
            "trend_cont_confirm_trend_min": float(values["trend_cont_confirm_trend_min"]),
            "trend_cont_volume_ratio_min": float(values["trend_cont_volume_ratio_min"]),
            "cooldown_after_loss_cycles": int(values["cooldown_after_loss_cycles"]),
        }
    return payload


def infer_strategy_profile(
    buy_threshold: float,
    sell_threshold: float,
    take_profit_ratio: float,
    stop_loss_ratio: float,
    max_position_age_minutes: int,
    max_primary_volatility: float,
    max_direction_flip_ratio: float,
    min_volume_ratio: float,
    min_candle_body_ratio: float,
    entry_rsi_limit: float,
    entry_signal_quality_min: float,
    entry_confirm_trend_min: float,
    entry_confirm_momentum_min: float,
    breakout_score_delta: float,
    breakout_trend_fast_min: float,
    breakout_confirm_trend_min: float,
    breakout_momentum_15_min: float,
    breakout_volume_ratio_min: float,
    breakout_close_location_min: float,
    trend_cont_score_delta: float,
    trend_cont_signal_quality_min: float,
    trend_cont_confirm_trend_min: float,
    trend_cont_volume_ratio_min: float,
    cooldown_after_loss_cycles: int,
    requested_profile: str,
) -> str:
    normalized = requested_profile.lower().strip()
    if normalized in STRATEGY_PROFILES:
        preset = STRATEGY_PROFILES[normalized]
        if (
            abs(float(preset["buy_threshold"]) - buy_threshold) < 1e-9
            and abs(float(preset["sell_threshold"]) - sell_threshold) < 1e-9
            and abs(float(preset["take_profit_ratio"]) - take_profit_ratio) < 1e-9
            and abs(float(preset["stop_loss_ratio"]) - stop_loss_ratio) < 1e-9
            and int(preset["max_position_age_minutes"]) == max_position_age_minutes
            and abs(float(preset["max_primary_volatility"]) - max_primary_volatility) < 1e-9
            and abs(float(preset["max_direction_flip_ratio"]) - max_direction_flip_ratio) < 1e-9
            and abs(float(preset["min_volume_ratio"]) - min_volume_ratio) < 1e-9
            and abs(float(preset["min_candle_body_ratio"]) - min_candle_body_ratio) < 1e-9
            and abs(float(preset["entry_rsi_limit"]) - entry_rsi_limit) < 1e-9
            and abs(float(preset["entry_signal_quality_min"]) - entry_signal_quality_min) < 1e-9
            and abs(float(preset["entry_confirm_trend_min"]) - entry_confirm_trend_min) < 1e-9
            and abs(float(preset["entry_confirm_momentum_min"]) - entry_confirm_momentum_min) < 1e-9
            and abs(float(preset["breakout_score_delta"]) - breakout_score_delta) < 1e-9
            and abs(float(preset["breakout_trend_fast_min"]) - breakout_trend_fast_min) < 1e-9
            and abs(float(preset["breakout_confirm_trend_min"]) - breakout_confirm_trend_min) < 1e-9
            and abs(float(preset["breakout_momentum_15_min"]) - breakout_momentum_15_min) < 1e-9
            and abs(float(preset["breakout_volume_ratio_min"]) - breakout_volume_ratio_min) < 1e-9
            and abs(float(preset["breakout_close_location_min"]) - breakout_close_location_min) < 1e-9
            and abs(float(preset["trend_cont_score_delta"]) - trend_cont_score_delta) < 1e-9
            and abs(float(preset["trend_cont_signal_quality_min"]) - trend_cont_signal_quality_min) < 1e-9
            and abs(float(preset["trend_cont_confirm_trend_min"]) - trend_cont_confirm_trend_min) < 1e-9
            and abs(float(preset["trend_cont_volume_ratio_min"]) - trend_cont_volume_ratio_min) < 1e-9
            and int(preset["cooldown_after_loss_cycles"]) == cooldown_after_loss_cycles
        ):
            return normalized

    for key, preset in STRATEGY_PROFILES.items():
        if (
            abs(float(preset["buy_threshold"]) - buy_threshold) < 1e-9
            and abs(float(preset["sell_threshold"]) - sell_threshold) < 1e-9
            and abs(float(preset["take_profit_ratio"]) - take_profit_ratio) < 1e-9
            and abs(float(preset["stop_loss_ratio"]) - stop_loss_ratio) < 1e-9
            and int(preset["max_position_age_minutes"]) == max_position_age_minutes
            and abs(float(preset["max_primary_volatility"]) - max_primary_volatility) < 1e-9
            and abs(float(preset["max_direction_flip_ratio"]) - max_direction_flip_ratio) < 1e-9
            and abs(float(preset["min_volume_ratio"]) - min_volume_ratio) < 1e-9
            and abs(float(preset["min_candle_body_ratio"]) - min_candle_body_ratio) < 1e-9
            and abs(float(preset["entry_rsi_limit"]) - entry_rsi_limit) < 1e-9
            and abs(float(preset["entry_signal_quality_min"]) - entry_signal_quality_min) < 1e-9
            and abs(float(preset["entry_confirm_trend_min"]) - entry_confirm_trend_min) < 1e-9
            and abs(float(preset["entry_confirm_momentum_min"]) - entry_confirm_momentum_min) < 1e-9
            and abs(float(preset["breakout_score_delta"]) - breakout_score_delta) < 1e-9
            and abs(float(preset["breakout_trend_fast_min"]) - breakout_trend_fast_min) < 1e-9
            and abs(float(preset["breakout_confirm_trend_min"]) - breakout_confirm_trend_min) < 1e-9
            and abs(float(preset["breakout_momentum_15_min"]) - breakout_momentum_15_min) < 1e-9
            and abs(float(preset["breakout_volume_ratio_min"]) - breakout_volume_ratio_min) < 1e-9
            and abs(float(preset["breakout_close_location_min"]) - breakout_close_location_min) < 1e-9
            and abs(float(preset["trend_cont_score_delta"]) - trend_cont_score_delta) < 1e-9
            and abs(float(preset["trend_cont_signal_quality_min"]) - trend_cont_signal_quality_min) < 1e-9
            and abs(float(preset["trend_cont_confirm_trend_min"]) - trend_cont_confirm_trend_min) < 1e-9
            and abs(float(preset["trend_cont_volume_ratio_min"]) - trend_cont_volume_ratio_min) < 1e-9
            and int(preset["cooldown_after_loss_cycles"]) == cooldown_after_loss_cycles
        ):
            return key
    return CUSTOM_STRATEGY_PROFILE


def merge_selected_symbols(
    selected_symbols: List[str],
    locked_symbols: List[str],
) -> List[str]:
    merged = []
    seen = set()
    for symbol in [*selected_symbols, *locked_symbols]:
        normalized = str(symbol).upper().strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)
    return merged


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False

    database = Database()
    market_client = BinanceMarketClient()
    strategy = MicroTradeStrategy()
    simulator = TradingSimulator(database, market_client, strategy)
    simulator.start_background()

    app.extensions["database"] = database
    app.extensions["market_client"] = market_client
    app.extensions["simulator"] = simulator

    @app.get("/")
    def index():
        return render_template("index.html", quote_asset=database.get_settings()["quote_asset"])

    @app.get("/api/dashboard")
    def dashboard():
        return jsonify(build_dashboard_payload(app))

    @app.get("/api/available-symbols")
    def available_symbols():
        try:
            quote_asset = (
                request.args.get("quote_asset")
                or database.get_settings()["quote_asset"]
            ).upper()
            symbols = app.extensions["market_client"].list_quote_pairs(quote_asset)
            return jsonify({"symbols": symbols, "error": None})
        except MarketDataError as exc:
            return jsonify({"symbols": [], "error": str(exc)}), 503

    @app.get("/api/available-quote-assets")
    def available_quote_assets():
        try:
            quote_assets = app.extensions["market_client"].list_quote_assets()
            return jsonify({"quote_assets": quote_assets, "error": None})
        except MarketDataError as exc:
            return jsonify({"quote_assets": [], "error": str(exc)}), 503

    @app.post("/api/settings")
    def save_settings():
        payload = request.get_json(force=True, silent=False) or {}
        action = str(payload.get("action", "save")).strip().lower()
        if action not in {"save", "restart", "reset"}:
            return jsonify({"error": "Acao de configuracao invalida."}), 400

        current_settings = database.get_settings()
        simulator: TradingSimulator = app.extensions["simulator"]

        if action == "reset":
            default_profile_values = STRATEGY_PROFILES[DEFAULT_STRATEGY_PROFILE]
            try:
                available_symbols = app.extensions["market_client"].list_quote_pairs(
                    DEFAULT_QUOTE_ASSET
                )
            except MarketDataError as exc:
                return jsonify({"error": str(exc)}), 503

            valid_default_symbols = {item["symbol"] for item in available_symbols}
            default_selected_symbols = [
                symbol for symbol in DEFAULT_SELECTED_SYMBOLS if symbol in valid_default_symbols
            ]
            if not default_selected_symbols:
                default_selected_symbols = [
                    item["symbol"] for item in available_symbols[: min(5, len(available_symbols))]
                ]

            database.reset_simulation(
                initial_capital=DEFAULT_INITIAL_CAPITAL,
                quote_asset=DEFAULT_QUOTE_ASSET,
                fee_rate=DEFAULT_FEE_RATE,
                selected_symbols=default_selected_symbols,
                poll_seconds=DEFAULT_POLL_SECONDS,
                trade_size_fraction=DEFAULT_TRADE_SIZE_FRACTION,
                time_exit_enabled=int(default_profile_values["max_position_age_minutes"]) > 0,
                primary_kline_interval=DEFAULT_KLINE_INTERVAL,
                primary_kline_limit=DEFAULT_KLINE_LIMIT,
                confirm_kline_interval=TREND_CONFIRM_INTERVAL,
                confirm_kline_limit=TREND_CONFIRM_LIMIT,
                learning_horizon_cycles=DEFAULT_LEARNING_HORIZON_CYCLES,
                learning_warmup_cycles=LEARNING_WARMUP_CYCLES,
                max_open_positions=DEFAULT_MAX_OPEN_POSITIONS,
                buy_threshold=float(default_profile_values["buy_threshold"]),
                sell_threshold=float(default_profile_values["sell_threshold"]),
                take_profit_ratio=float(default_profile_values["take_profit_ratio"]),
                stop_loss_ratio=float(default_profile_values["stop_loss_ratio"]),
                max_position_age_minutes=int(default_profile_values["max_position_age_minutes"]),
                min_trade_notional=MIN_TRADE_NOTIONAL,
                max_primary_volatility=float(default_profile_values["max_primary_volatility"]),
                max_direction_flip_ratio=float(default_profile_values["max_direction_flip_ratio"]),
                min_volume_ratio=float(default_profile_values["min_volume_ratio"]),
                min_candle_body_ratio=float(default_profile_values["min_candle_body_ratio"]),
                entry_rsi_limit=float(default_profile_values["entry_rsi_limit"]),
                entry_signal_quality_min=float(default_profile_values["entry_signal_quality_min"]),
                entry_confirm_trend_min=float(default_profile_values["entry_confirm_trend_min"]),
                entry_confirm_momentum_min=float(default_profile_values["entry_confirm_momentum_min"]),
                breakout_score_delta=float(default_profile_values["breakout_score_delta"]),
                breakout_trend_fast_min=float(default_profile_values["breakout_trend_fast_min"]),
                breakout_confirm_trend_min=float(default_profile_values["breakout_confirm_trend_min"]),
                breakout_momentum_15_min=float(default_profile_values["breakout_momentum_15_min"]),
                breakout_volume_ratio_min=float(default_profile_values["breakout_volume_ratio_min"]),
                breakout_close_location_min=float(default_profile_values["breakout_close_location_min"]),
                trend_cont_score_delta=float(default_profile_values["trend_cont_score_delta"]),
                trend_cont_signal_quality_min=float(default_profile_values["trend_cont_signal_quality_min"]),
                trend_cont_confirm_trend_min=float(default_profile_values["trend_cont_confirm_trend_min"]),
                trend_cont_volume_ratio_min=float(default_profile_values["trend_cont_volume_ratio_min"]),
                cooldown_after_loss_cycles=int(default_profile_values["cooldown_after_loss_cycles"]),
                strategy_profile=DEFAULT_STRATEGY_PROFILE,
                cycle_history_limit=DEFAULT_CYCLE_HISTORY_LIMIT,
                clear_learning=True,
            )
            simulator.reset_runtime_state()
            response_payload = build_dashboard_payload(app)
            response_payload["save_meta"] = {
                "action": "reset",
                "learning_reset": True,
                "protected_symbols_added": 0,
                "profile_applied": DEFAULT_STRATEGY_PROFILE,
            }
            return jsonify(response_payload)

        initial_capital = float(payload.get("initial_capital", DEFAULT_INITIAL_CAPITAL))
        quote_asset = str(payload.get("quote_asset", DEFAULT_QUOTE_ASSET)).upper().strip()
        fee_rate = float(payload.get("fee_rate", DEFAULT_FEE_RATE))
        selected_symbols = payload.get("selected_symbols") or []
        poll_seconds = int(payload.get("poll_seconds", DEFAULT_POLL_SECONDS))
        trade_size_fraction = float(
            payload.get("trade_size_fraction", DEFAULT_TRADE_SIZE_FRACTION)
        )
        time_exit_enabled = bool(
            payload.get(
                "time_exit_enabled",
                current_settings.get("time_exit_enabled", DEFAULT_TIME_EXIT_ENABLED),
            )
        )
        primary_kline_interval = str(
            payload.get("primary_kline_interval", DEFAULT_KLINE_INTERVAL)
        ).strip()
        primary_kline_limit = int(payload.get("primary_kline_limit", DEFAULT_KLINE_LIMIT))
        confirm_kline_interval = str(
            payload.get("confirm_kline_interval", TREND_CONFIRM_INTERVAL)
        ).strip()
        confirm_kline_limit = int(
            payload.get("confirm_kline_limit", TREND_CONFIRM_LIMIT)
        )
        learning_horizon_cycles = int(
            payload.get("learning_horizon_cycles", DEFAULT_LEARNING_HORIZON_CYCLES)
        )
        learning_warmup_cycles = int(
            payload.get("learning_warmup_cycles", LEARNING_WARMUP_CYCLES)
        )
        max_open_positions = int(
            payload.get("max_open_positions", DEFAULT_MAX_OPEN_POSITIONS)
        )
        buy_threshold = float(payload.get("buy_threshold", BUY_THRESHOLD))
        sell_threshold = float(payload.get("sell_threshold", SELL_THRESHOLD))
        take_profit_ratio = float(payload.get("take_profit_ratio", TAKE_PROFIT_RATIO))
        stop_loss_ratio = float(payload.get("stop_loss_ratio", STOP_LOSS_RATIO))
        max_position_age_minutes = int(
            payload.get("max_position_age_minutes", MAX_POSITION_AGE_MINUTES)
        )
        min_trade_notional = float(payload.get("min_trade_notional", MIN_TRADE_NOTIONAL))
        max_primary_volatility = float(
            payload.get("max_primary_volatility", MAX_PRIMARY_VOLATILITY)
        )
        max_direction_flip_ratio = float(
            payload.get("max_direction_flip_ratio", MAX_DIRECTION_FLIP_RATIO)
        )
        min_volume_ratio = float(payload.get("min_volume_ratio", MIN_VOLUME_RATIO))
        min_candle_body_ratio = float(
            payload.get("min_candle_body_ratio", MIN_CANDLE_BODY_RATIO)
        )
        entry_rsi_limit = float(payload.get("entry_rsi_limit", ENTRY_RSI_LIMIT))
        entry_signal_quality_min = float(
            payload.get("entry_signal_quality_min", ENTRY_SIGNAL_QUALITY_MIN)
        )
        entry_confirm_trend_min = float(
            payload.get("entry_confirm_trend_min", ENTRY_CONFIRM_TREND_MIN)
        )
        entry_confirm_momentum_min = float(
            payload.get("entry_confirm_momentum_min", ENTRY_CONFIRM_MOMENTUM_MIN)
        )
        breakout_score_delta = float(
            payload.get("breakout_score_delta", BREAKOUT_SCORE_DELTA)
        )
        breakout_trend_fast_min = float(
            payload.get("breakout_trend_fast_min", BREAKOUT_TREND_FAST_MIN)
        )
        breakout_confirm_trend_min = float(
            payload.get("breakout_confirm_trend_min", BREAKOUT_CONFIRM_TREND_MIN)
        )
        breakout_momentum_15_min = float(
            payload.get("breakout_momentum_15_min", BREAKOUT_MOMENTUM_15_MIN)
        )
        breakout_volume_ratio_min = float(
            payload.get("breakout_volume_ratio_min", BREAKOUT_VOLUME_RATIO_MIN)
        )
        breakout_close_location_min = float(
            payload.get("breakout_close_location_min", BREAKOUT_CLOSE_LOCATION_MIN)
        )
        trend_cont_score_delta = float(
            payload.get("trend_cont_score_delta", TREND_CONT_SCORE_DELTA)
        )
        trend_cont_signal_quality_min = float(
            payload.get(
                "trend_cont_signal_quality_min",
                TREND_CONT_SIGNAL_QUALITY_MIN,
            )
        )
        trend_cont_confirm_trend_min = float(
            payload.get(
                "trend_cont_confirm_trend_min",
                TREND_CONT_CONFIRM_TREND_MIN,
            )
        )
        trend_cont_volume_ratio_min = float(
            payload.get("trend_cont_volume_ratio_min", TREND_CONT_VOLUME_RATIO_MIN)
        )
        cooldown_after_loss_cycles = int(
            payload.get("cooldown_after_loss_cycles", COOLDOWN_AFTER_LOSS_CYCLES)
        )
        requested_strategy_profile = str(
            payload.get(
                "strategy_profile",
                current_settings.get("strategy_profile", DEFAULT_STRATEGY_PROFILE),
            )
        )
        cycle_history_limit = int(
            payload.get("cycle_history_limit", DEFAULT_CYCLE_HISTORY_LIMIT)
        )
        strategy_profile = infer_strategy_profile(
            buy_threshold,
            sell_threshold,
            take_profit_ratio,
            stop_loss_ratio,
            max_position_age_minutes,
            max_primary_volatility,
            max_direction_flip_ratio,
            min_volume_ratio,
            min_candle_body_ratio,
            entry_rsi_limit,
            entry_signal_quality_min,
            entry_confirm_trend_min,
            entry_confirm_momentum_min,
            breakout_score_delta,
            breakout_trend_fast_min,
            breakout_confirm_trend_min,
            breakout_momentum_15_min,
            breakout_volume_ratio_min,
            breakout_close_location_min,
            trend_cont_score_delta,
            trend_cont_signal_quality_min,
            trend_cont_confirm_trend_min,
            trend_cont_volume_ratio_min,
            cooldown_after_loss_cycles,
            requested_strategy_profile,
        )
        time_exit_enabled = time_exit_enabled and max_position_age_minutes > 0
        if "time_exit_enabled" not in payload:
            time_exit_enabled = max_position_age_minutes > 0

        if initial_capital <= 0:
            return jsonify({"error": "O capital inicial deve ser maior que zero."}), 400
        if not quote_asset or len(quote_asset) > 12:
            return jsonify({"error": "Informe uma moeda de cotacao valida."}), 400
        if not primary_kline_interval or not confirm_kline_interval:
            return jsonify({"error": "Os intervalos de candle nao podem ficar vazios."}), 400
        if not selected_symbols:
            return jsonify({"error": "Selecione pelo menos uma moeda para analise."}), 400
        if poll_seconds < 5:
            return jsonify({"error": "O intervalo minimo entre ciclos e de 5 segundos."}), 400
        if not 0.05 <= trade_size_fraction <= 0.9:
            return jsonify({"error": "A alocacao por trade deve ficar entre 5% e 90%."}), 400
        if not 50 <= cycle_history_limit <= 5000:
            return jsonify({"error": "O historico por moeda deve ficar entre 50 e 5000 ciclos."}), 400
        if not 0 <= fee_rate <= MAX_FEE_RATE:
            return jsonify({"error": "A taxa por transacao deve ficar entre 0% e 5%."}), 400
        if primary_kline_limit < 60 or confirm_kline_limit < 60:
            return jsonify({"error": "Os limites de candle devem ser de pelo menos 60."}), 400
        if not 1 <= learning_horizon_cycles <= 500:
            return jsonify({"error": "O horizonte de aprendizado deve ficar entre 1 e 500 ciclos."}), 400
        if not 5 <= learning_warmup_cycles <= 2000:
            return jsonify({"error": "O aquecimento da IA deve ficar entre 5 e 2000 ciclos."}), 400
        if not 1 <= max_open_positions <= 100:
            return jsonify({"error": "O numero maximo de posicoes deve ficar entre 1 e 100."}), 400
        if not 0.1 <= buy_threshold <= 10:
            return jsonify({"error": "O threshold de compra deve ficar entre 0.1 e 10."}), 400
        if not -10 <= sell_threshold <= -0.01:
            return jsonify({"error": "O threshold de venda deve ficar entre -10 e -0.01."}), 400
        if not 0.0001 <= take_profit_ratio <= 1:
            return jsonify({"error": "O take profit deve ficar entre 0.01% e 100%."}), 400
        if not -1 <= stop_loss_ratio <= -0.0001:
            return jsonify({"error": "O stop loss deve ficar entre -100% e -0.01%."}), 400
        if not 0 <= max_position_age_minutes <= 10080:
            return jsonify({"error": "A idade maxima da posicao deve ficar entre 0 e 10080 minutos."}), 400
        if min_trade_notional <= 0:
            return jsonify({"error": "O lote minimo fallback deve ser maior que zero."}), 400
        if not 0 < max_primary_volatility <= 1:
            return jsonify({"error": "A volatilidade maxima deve ficar entre 0 e 100%."}), 400
        if not 0 <= max_direction_flip_ratio <= 1:
            return jsonify({"error": "O flip ratio maximo deve ficar entre 0 e 1."}), 400
        if not 0 < min_volume_ratio <= 20:
            return jsonify({"error": "O volume relativo minimo deve ficar entre 0 e 20x."}), 400
        if not 0 < min_candle_body_ratio <= 1:
            return jsonify({"error": "O corpo minimo do candle deve ficar entre 0 e 100%."}), 400
        if not 40 <= entry_rsi_limit <= 100:
            return jsonify({"error": "O RSI maximo de entrada deve ficar entre 40 e 100."}), 400
        if not 0 <= entry_signal_quality_min <= 1:
            return jsonify({"error": "A qualidade minima do sinal deve ficar entre 0 e 100%."}), 400
        if not -0.05 <= entry_confirm_trend_min <= 0.05:
            return jsonify({"error": "O trend minimo da confirmacao deve ficar entre -5% e 5%."}), 400
        if not -0.1 <= entry_confirm_momentum_min <= 0.1:
            return jsonify({"error": "O momentum minimo da confirmacao deve ficar entre -10% e 10%."}), 400
        if not 0 <= breakout_score_delta <= 5:
            return jsonify({"error": "O delta de score do breakout deve ficar entre 0 e 5."}), 400
        if not -0.05 <= breakout_trend_fast_min <= 0.05:
            return jsonify({"error": "O trend rapido minimo do breakout deve ficar entre -5% e 5%."}), 400
        if not -0.05 <= breakout_confirm_trend_min <= 0.05:
            return jsonify({"error": "O trend de confirmacao do breakout deve ficar entre -5% e 5%."}), 400
        if not -0.1 <= breakout_momentum_15_min <= 0.2:
            return jsonify({"error": "O momentum do breakout deve ficar entre -10% e 20%."}), 400
        if not 0 <= breakout_volume_ratio_min <= 20:
            return jsonify({"error": "O volume minimo do breakout deve ficar entre 0 e 20x."}), 400
        if not 0 <= breakout_close_location_min <= 1:
            return jsonify({"error": "O fechamento minimo do breakout deve ficar entre 0 e 100%."}), 400
        if not 0 <= trend_cont_score_delta <= 5:
            return jsonify({"error": "O delta de score da continuidade deve ficar entre 0 e 5."}), 400
        if not 0 <= trend_cont_signal_quality_min <= 1:
            return jsonify({"error": "A qualidade minima da continuidade deve ficar entre 0 e 100%."}), 400
        if not -0.05 <= trend_cont_confirm_trend_min <= 0.05:
            return jsonify({"error": "O trend minimo da continuidade deve ficar entre -5% e 5%."}), 400
        if not 0 <= trend_cont_volume_ratio_min <= 20:
            return jsonify({"error": "O volume minimo da continuidade deve ficar entre 0 e 20x."}), 400
        if not 0 <= cooldown_after_loss_cycles <= 500:
            return jsonify({"error": "O cooldown apos saida ruim deve ficar entre 0 e 500 ciclos."}), 400
        if quote_asset != current_settings["quote_asset"]:
            return jsonify(
                {
                    "error": (
                        "Para trocar a moeda de cotacao mantendo os dados consistentes, "
                        "use Resetar."
                    )
                }
            ), 400

        open_position_symbols = [
            item["symbol"]
            for item in database.list_positions()
            if float(item.get("quantity", 0.0) or 0.0) > 0
        ]
        merged_symbols = merge_selected_symbols(selected_symbols, open_position_symbols)
        protected_symbols_added = max(0, len(merged_symbols) - len(selected_symbols))
        selected_symbols = merged_symbols
        if not selected_symbols:
            return jsonify({"error": "Selecione pelo menos uma moeda para analise."}), 400

        try:
            available_symbols = app.extensions["market_client"].list_quote_pairs(quote_asset)
        except MarketDataError as exc:
            return jsonify({"error": str(exc)}), 503

        valid_symbols = {item["symbol"] for item in available_symbols}
        if not valid_symbols:
            return jsonify({"error": f"Nao encontrei pares spot com cotacao em {quote_asset}."}), 400
        invalid_symbols = [item for item in selected_symbols if item not in valid_symbols]
        if invalid_symbols:
            return jsonify(
                {
                    "error": (
                        "Existem moedas fora do mercado selecionado: "
                        + ", ".join(invalid_symbols[:5])
                    )
                }
            ), 400

        learning_reset = abs(current_settings["fee_rate"] - fee_rate) > 1e-12

        database.update_initial_capital_reference(initial_capital)
        database.update_settings(
            selected_symbols=selected_symbols,
            poll_seconds=poll_seconds,
            trade_size_fraction=trade_size_fraction,
            cycle_history_limit=cycle_history_limit,
            quote_asset=quote_asset,
            fee_rate=fee_rate,
            time_exit_enabled=time_exit_enabled,
            primary_kline_interval=primary_kline_interval,
            primary_kline_limit=primary_kline_limit,
            confirm_kline_interval=confirm_kline_interval,
            confirm_kline_limit=confirm_kline_limit,
            learning_horizon_cycles=learning_horizon_cycles,
            learning_warmup_cycles=learning_warmup_cycles,
            max_open_positions=max_open_positions,
            buy_threshold=buy_threshold,
            sell_threshold=sell_threshold,
            take_profit_ratio=take_profit_ratio,
            stop_loss_ratio=stop_loss_ratio,
            max_position_age_minutes=max_position_age_minutes,
            min_trade_notional=min_trade_notional,
            max_primary_volatility=max_primary_volatility,
            max_direction_flip_ratio=max_direction_flip_ratio,
            min_volume_ratio=min_volume_ratio,
            min_candle_body_ratio=min_candle_body_ratio,
            entry_rsi_limit=entry_rsi_limit,
            entry_signal_quality_min=entry_signal_quality_min,
            entry_confirm_trend_min=entry_confirm_trend_min,
            entry_confirm_momentum_min=entry_confirm_momentum_min,
            breakout_score_delta=breakout_score_delta,
            breakout_trend_fast_min=breakout_trend_fast_min,
            breakout_confirm_trend_min=breakout_confirm_trend_min,
            breakout_momentum_15_min=breakout_momentum_15_min,
            breakout_volume_ratio_min=breakout_volume_ratio_min,
            breakout_close_location_min=breakout_close_location_min,
            trend_cont_score_delta=trend_cont_score_delta,
            trend_cont_signal_quality_min=trend_cont_signal_quality_min,
            trend_cont_confirm_trend_min=trend_cont_confirm_trend_min,
            trend_cont_volume_ratio_min=trend_cont_volume_ratio_min,
            cooldown_after_loss_cycles=cooldown_after_loss_cycles,
            strategy_profile=strategy_profile,
        )
        if learning_reset:
            database.clear_learning_state()
        if action == "restart":
            simulator.reset_runtime_state()

        response_payload = build_dashboard_payload(app)
        response_payload["save_meta"] = {
            "action": action,
            "learning_reset": learning_reset,
            "protected_symbols_added": protected_symbols_added,
            "profile_applied": strategy_profile,
        }
        return jsonify(response_payload)

    @app.post("/api/control")
    def control():
        payload = request.get_json(force=True, silent=False) or {}
        action = payload.get("action")

        try:
            if action == "start":
                database.update_settings(running=True)
            elif action == "stop":
                database.update_settings(running=False)
            elif action == "tick":
                simulator.run_cycle()
            else:
                return jsonify({"error": "Acao invalida."}), 400
        except Exception:
            return jsonify({"error": "Falha ao executar o ciclo da simulacao."}), 500

        return jsonify(build_dashboard_payload(app))

    return app


def build_dashboard_payload(app: Flask) -> Dict[str, Any]:
    database: Database = app.extensions["database"]
    simulator: TradingSimulator = app.extensions["simulator"]
    settings = database.get_settings()
    metrics = simulator.calculate_metrics()
    transactions = database.list_transactions(limit=150)

    return {
        "settings": settings,
        "strategy_profiles": build_strategy_profiles_payload(),
        "metrics": metrics,
        "performance": build_performance_summary(transactions),
        "learning_summary": database.get_learning_summary(
            settings["learning_warmup_cycles"]
        ),
        "transactions": transactions,
        "decisions": database.list_decisions(limit=150),
        "equity_history": database.list_equity_history(limit=240),
        "last_cycle_finished_at": simulator.last_cycle_finished_at,
    }


def build_performance_summary(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    closed = [item for item in transactions if item["side"] == "sell"]
    gross_profit = sum(item["realized_pnl"] for item in closed if item["realized_pnl"] > 0)
    gross_loss = abs(sum(item["realized_pnl"] for item in closed if item["realized_pnl"] < 0))
    wins = sum(1 for item in closed if item["realized_pnl"] > 0)
    losses = sum(1 for item in closed if item["realized_pnl"] < 0)
    total_closed = len(closed)

    return {
        "closed_trades": total_closed,
        "wins": wins,
        "losses": losses,
        "win_rate": (wins / total_closed) if total_closed else None,
        "profit_factor": (gross_profit / gross_loss) if gross_loss > 0 else (None if gross_profit == 0 else "inf"),
        "avg_realized_pnl": (
            sum(item["realized_pnl"] for item in closed) / total_closed if total_closed else None
        ),
    }
