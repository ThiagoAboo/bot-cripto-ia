from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Dict, Iterable, List, Optional

from .config import (
    BREAKOUT_CLOSE_LOCATION_MIN,
    BREAKOUT_CONFIRM_TREND_MIN,
    BREAKOUT_MOMENTUM_15_MIN,
    BREAKOUT_SCORE_DELTA,
    BREAKOUT_TREND_FAST_MIN,
    BREAKOUT_VOLUME_RATIO_MIN,
    COOLDOWN_AFTER_LOSS_CYCLES,
    DB_PATH,
    BUY_THRESHOLD,
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
    MAX_DIRECTION_FLIP_RATIO,
    MAX_POSITION_AGE_MINUTES,
    MAX_PRIMARY_VOLATILITY,
    MIN_WEAKNESS_EXIT_AGE_MINUTES,
    MIN_CANDLE_BODY_RATIO,
    MIN_TRADE_NOTIONAL,
    MIN_VOLUME_RATIO,
    RANGE_ENTRY_SIGNAL_QUALITY_MIN,
    REVERSAL_CLOSE_LOCATION_MIN,
    REVERSAL_CONFIRM_INTERVAL,
    REVERSAL_CONFIRM_LIMIT,
    REVERSAL_CONFIRM_TREND_FLOOR,
    REVERSAL_DISTANCE_FROM_LOW_MAX,
    REVERSAL_LOWER_WICK_MIN,
    REVERSAL_RSI_15M_MAX,
    REVERSAL_RSI_1M_MIN,
    REVERSAL_RSI_1M_MAX,
    REVERSAL_SCORE_FLOOR,
    REVERSAL_SWING_WINDOW,
    REVERSAL_VOLUME_RATIO_MIN,
    SELL_THRESHOLD,
    STOP_LOSS_RATIO,
    TAKE_PROFIT_RATIO,
    TREND_CONT_CONFIRM_TREND_MIN,
    TREND_CONFIRM_INTERVAL,
    TREND_CONFIRM_LIMIT,
    TREND_CONT_SCORE_DELTA,
    TREND_CONT_SIGNAL_QUALITY_MIN,
    TREND_CONT_VOLUME_RATIO_MIN,
)


SCHEMA_VERSION = "4"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.lock = RLock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterable[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.lock, self.connect() as conn:
            if self._needs_schema_reset(conn):
                self._drop_managed_tables(conn)

            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS portfolio (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    initial_capital REAL NOT NULL,
                    cash_balance REAL NOT NULL,
                    realized_pnl REAL NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS positions (
                    symbol TEXT PRIMARY KEY,
                    quantity REAL NOT NULL,
                    avg_price REAL NOT NULL,
                    opened_at TEXT NOT NULL,
                    last_decision TEXT,
                    cost_basis REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    action TEXT NOT NULL,
                    score REAL NOT NULL,
                    confidence REAL NOT NULL,
                    price REAL NOT NULL,
                    features_json TEXT NOT NULL,
                    rationale TEXT NOT NULL,
                    executed INTEGER NOT NULL,
                    execution_note TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    price REAL NOT NULL,
                    quantity REAL NOT NULL,
                    gross_value REAL NOT NULL,
                    fee REAL NOT NULL,
                    net_value REAL NOT NULL,
                    realized_pnl REAL NOT NULL,
                    balance_after REAL NOT NULL,
                    rationale TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS equity_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    total_balance REAL NOT NULL,
                    cash_balance REAL NOT NULL,
                    unrealized_pnl REAL NOT NULL,
                    realized_pnl REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS symbol_learning_state (
                    symbol TEXT PRIMARY KEY,
                    cycle_count INTEGER NOT NULL,
                    resolved_count INTEGER NOT NULL,
                    accuracy_ewma REAL NOT NULL,
                    edge_ewma REAL NOT NULL,
                    smoothed_confidence REAL NOT NULL,
                    cooldown_until_cycle INTEGER NOT NULL DEFAULT 0,
                    last_exit_reason TEXT NOT NULL DEFAULT '',
                    last_regime TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS symbol_cycle_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    cycle_index INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    price REAL NOT NULL,
                    action TEXT NOT NULL,
                    score REAL NOT NULL,
                    confidence_raw REAL NOT NULL,
                    confidence_stable REAL NOT NULL,
                    regime TEXT NOT NULL,
                    features_json TEXT NOT NULL,
                    resolved INTEGER NOT NULL DEFAULT 0,
                    future_price REAL,
                    future_return REAL,
                    outcome_score REAL,
                    net_edge REAL,
                    resolved_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_symbol_cycle_history_symbol_cycle
                ON symbol_cycle_history(symbol, cycle_index);

                CREATE INDEX IF NOT EXISTS idx_symbol_cycle_history_symbol_resolved
                ON symbol_cycle_history(symbol, resolved, cycle_index);
                """
            )
            self._ensure_symbol_learning_state_columns(conn)
            self._ensure_defaults(conn)

    def _ensure_symbol_learning_state_columns(self, conn: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(symbol_learning_state)"
            ).fetchall()
        }
        if "cooldown_until_cycle" not in columns:
            conn.execute(
                """
                ALTER TABLE symbol_learning_state
                ADD COLUMN cooldown_until_cycle INTEGER NOT NULL DEFAULT 0
                """
            )
        if "last_exit_reason" not in columns:
            conn.execute(
                """
                ALTER TABLE symbol_learning_state
                ADD COLUMN last_exit_reason TEXT NOT NULL DEFAULT ''
                """
            )

    def _needs_schema_reset(self, conn: sqlite3.Connection) -> bool:
        tables = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        if "portfolio" not in tables:
            return False

        portfolio_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(portfolio)").fetchall()
        }
        return "initial_capital_bnb" in portfolio_columns or "cash_balance_bnb" in portfolio_columns

    def _drop_managed_tables(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            DROP TABLE IF EXISTS settings;
            DROP TABLE IF EXISTS portfolio;
            DROP TABLE IF EXISTS positions;
            DROP TABLE IF EXISTS decisions;
            DROP TABLE IF EXISTS transactions;
            DROP TABLE IF EXISTS equity_history;
            DROP TABLE IF EXISTS symbol_learning_state;
            DROP TABLE IF EXISTS symbol_cycle_history;
            """
        )

    def _ensure_defaults(self, conn: sqlite3.Connection) -> None:
        defaults = {
            "selected_symbols": json.dumps(DEFAULT_SELECTED_SYMBOLS),
            "poll_seconds": str(DEFAULT_POLL_SECONDS),
            "running": "0",
            "quote_asset": DEFAULT_QUOTE_ASSET,
            "fee_rate": str(DEFAULT_FEE_RATE),
            "trade_size_fraction": str(DEFAULT_TRADE_SIZE_FRACTION),
            "time_exit_enabled": "1" if DEFAULT_TIME_EXIT_ENABLED else "0",
            "primary_kline_interval": DEFAULT_KLINE_INTERVAL,
            "primary_kline_limit": str(DEFAULT_KLINE_LIMIT),
            "confirm_kline_interval": TREND_CONFIRM_INTERVAL,
            "confirm_kline_limit": str(TREND_CONFIRM_LIMIT),
            "reversal_kline_interval": REVERSAL_CONFIRM_INTERVAL,
            "reversal_kline_limit": str(REVERSAL_CONFIRM_LIMIT),
            "learning_horizon_cycles": str(DEFAULT_LEARNING_HORIZON_CYCLES),
            "learning_warmup_cycles": str(LEARNING_WARMUP_CYCLES),
            "max_open_positions": str(DEFAULT_MAX_OPEN_POSITIONS),
            "buy_threshold": str(BUY_THRESHOLD),
            "sell_threshold": str(SELL_THRESHOLD),
            "take_profit_ratio": str(TAKE_PROFIT_RATIO),
            "stop_loss_ratio": str(STOP_LOSS_RATIO),
            "max_position_age_minutes": str(MAX_POSITION_AGE_MINUTES),
            "min_trade_notional": str(MIN_TRADE_NOTIONAL),
            "max_primary_volatility": str(MAX_PRIMARY_VOLATILITY),
            "max_direction_flip_ratio": str(MAX_DIRECTION_FLIP_RATIO),
            "min_volume_ratio": str(MIN_VOLUME_RATIO),
            "min_candle_body_ratio": str(MIN_CANDLE_BODY_RATIO),
            "entry_rsi_limit": str(ENTRY_RSI_LIMIT),
            "entry_signal_quality_min": str(ENTRY_SIGNAL_QUALITY_MIN),
            "range_entry_signal_quality_min": str(RANGE_ENTRY_SIGNAL_QUALITY_MIN),
            "entry_confirm_trend_min": str(ENTRY_CONFIRM_TREND_MIN),
            "entry_confirm_momentum_min": str(ENTRY_CONFIRM_MOMENTUM_MIN),
            "breakout_score_delta": str(BREAKOUT_SCORE_DELTA),
            "breakout_trend_fast_min": str(BREAKOUT_TREND_FAST_MIN),
            "breakout_confirm_trend_min": str(BREAKOUT_CONFIRM_TREND_MIN),
            "breakout_momentum_15_min": str(BREAKOUT_MOMENTUM_15_MIN),
            "breakout_volume_ratio_min": str(BREAKOUT_VOLUME_RATIO_MIN),
            "breakout_close_location_min": str(BREAKOUT_CLOSE_LOCATION_MIN),
            "trend_cont_score_delta": str(TREND_CONT_SCORE_DELTA),
            "trend_cont_signal_quality_min": str(TREND_CONT_SIGNAL_QUALITY_MIN),
            "trend_cont_confirm_trend_min": str(TREND_CONT_CONFIRM_TREND_MIN),
            "trend_cont_volume_ratio_min": str(TREND_CONT_VOLUME_RATIO_MIN),
            "reversal_score_floor": str(REVERSAL_SCORE_FLOOR),
            "reversal_confirm_trend_floor": str(REVERSAL_CONFIRM_TREND_FLOOR),
            "reversal_rsi_15m_max": str(REVERSAL_RSI_15M_MAX),
            "reversal_rsi_1m_min": str(REVERSAL_RSI_1M_MIN),
            "reversal_rsi_1m_max": str(REVERSAL_RSI_1M_MAX),
            "reversal_lower_wick_min": str(REVERSAL_LOWER_WICK_MIN),
            "reversal_close_location_min": str(REVERSAL_CLOSE_LOCATION_MIN),
            "reversal_distance_from_low_max": str(REVERSAL_DISTANCE_FROM_LOW_MAX),
            "reversal_volume_ratio_min": str(REVERSAL_VOLUME_RATIO_MIN),
            "reversal_swing_window": str(REVERSAL_SWING_WINDOW),
            "cooldown_after_loss_cycles": str(COOLDOWN_AFTER_LOSS_CYCLES),
            "min_weakness_exit_age_minutes": str(MIN_WEAKNESS_EXIT_AGE_MINUTES),
            "strategy_profile": DEFAULT_STRATEGY_PROFILE,
            "cycle_history_limit": str(DEFAULT_CYCLE_HISTORY_LIMIT),
            "schema_version": SCHEMA_VERSION,
        }
        for key, value in defaults.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )
        conn.execute(
            "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
            ("schema_version", SCHEMA_VERSION),
        )

        row = conn.execute("SELECT COUNT(*) AS total FROM portfolio").fetchone()
        if row["total"] == 0:
            conn.execute(
                """
                INSERT INTO portfolio(
                    id,
                    initial_capital,
                    cash_balance,
                    realized_pnl,
                    updated_at
                )
                VALUES(1, ?, ?, 0, ?)
                """,
                (DEFAULT_INITIAL_CAPITAL, DEFAULT_INITIAL_CAPITAL, utc_now_iso()),
            )

    def get_settings(self) -> Dict[str, Any]:
        with self.lock, self.connect() as conn:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
        data = {row["key"]: row["value"] for row in rows}
        return {
            "selected_symbols": json.loads(
                data.get("selected_symbols", json.dumps(DEFAULT_SELECTED_SYMBOLS))
            ),
            "poll_seconds": int(float(data.get("poll_seconds", DEFAULT_POLL_SECONDS))),
            "running": data.get("running", "0") == "1",
            "quote_asset": data.get("quote_asset", DEFAULT_QUOTE_ASSET),
            "fee_rate": float(data.get("fee_rate", DEFAULT_FEE_RATE)),
            "trade_size_fraction": float(
                data.get("trade_size_fraction", DEFAULT_TRADE_SIZE_FRACTION)
            ),
            "time_exit_enabled": data.get(
                "time_exit_enabled",
                "1" if DEFAULT_TIME_EXIT_ENABLED else "0",
            ) == "1",
            "primary_kline_interval": data.get(
                "primary_kline_interval",
                DEFAULT_KLINE_INTERVAL,
            ),
            "primary_kline_limit": int(float(data.get("primary_kline_limit", DEFAULT_KLINE_LIMIT))),
            "confirm_kline_interval": data.get(
                "confirm_kline_interval",
                TREND_CONFIRM_INTERVAL,
            ),
            "confirm_kline_limit": int(float(data.get("confirm_kline_limit", TREND_CONFIRM_LIMIT))),
            "reversal_kline_interval": data.get(
                "reversal_kline_interval",
                REVERSAL_CONFIRM_INTERVAL,
            ),
            "reversal_kline_limit": int(
                float(data.get("reversal_kline_limit", REVERSAL_CONFIRM_LIMIT))
            ),
            "learning_horizon_cycles": int(
                float(data.get("learning_horizon_cycles", DEFAULT_LEARNING_HORIZON_CYCLES))
            ),
            "learning_warmup_cycles": int(
                float(data.get("learning_warmup_cycles", LEARNING_WARMUP_CYCLES))
            ),
            "max_open_positions": int(
                float(data.get("max_open_positions", DEFAULT_MAX_OPEN_POSITIONS))
            ),
            "buy_threshold": float(data.get("buy_threshold", BUY_THRESHOLD)),
            "sell_threshold": float(data.get("sell_threshold", SELL_THRESHOLD)),
            "take_profit_ratio": float(data.get("take_profit_ratio", TAKE_PROFIT_RATIO)),
            "stop_loss_ratio": float(data.get("stop_loss_ratio", STOP_LOSS_RATIO)),
            "max_position_age_minutes": int(
                float(data.get("max_position_age_minutes", MAX_POSITION_AGE_MINUTES))
            ),
            "min_trade_notional": float(data.get("min_trade_notional", MIN_TRADE_NOTIONAL)),
            "max_primary_volatility": float(
                data.get("max_primary_volatility", MAX_PRIMARY_VOLATILITY)
            ),
            "max_direction_flip_ratio": float(
                data.get("max_direction_flip_ratio", MAX_DIRECTION_FLIP_RATIO)
            ),
            "min_volume_ratio": float(data.get("min_volume_ratio", MIN_VOLUME_RATIO)),
            "min_candle_body_ratio": float(
                data.get("min_candle_body_ratio", MIN_CANDLE_BODY_RATIO)
            ),
            "entry_rsi_limit": float(data.get("entry_rsi_limit", ENTRY_RSI_LIMIT)),
            "entry_signal_quality_min": float(
                data.get("entry_signal_quality_min", ENTRY_SIGNAL_QUALITY_MIN)
            ),
            "range_entry_signal_quality_min": float(
                data.get(
                    "range_entry_signal_quality_min",
                    RANGE_ENTRY_SIGNAL_QUALITY_MIN,
                )
            ),
            "entry_confirm_trend_min": float(
                data.get("entry_confirm_trend_min", ENTRY_CONFIRM_TREND_MIN)
            ),
            "entry_confirm_momentum_min": float(
                data.get("entry_confirm_momentum_min", ENTRY_CONFIRM_MOMENTUM_MIN)
            ),
            "breakout_score_delta": float(
                data.get("breakout_score_delta", BREAKOUT_SCORE_DELTA)
            ),
            "breakout_trend_fast_min": float(
                data.get("breakout_trend_fast_min", BREAKOUT_TREND_FAST_MIN)
            ),
            "breakout_confirm_trend_min": float(
                data.get("breakout_confirm_trend_min", BREAKOUT_CONFIRM_TREND_MIN)
            ),
            "breakout_momentum_15_min": float(
                data.get("breakout_momentum_15_min", BREAKOUT_MOMENTUM_15_MIN)
            ),
            "breakout_volume_ratio_min": float(
                data.get("breakout_volume_ratio_min", BREAKOUT_VOLUME_RATIO_MIN)
            ),
            "breakout_close_location_min": float(
                data.get("breakout_close_location_min", BREAKOUT_CLOSE_LOCATION_MIN)
            ),
            "trend_cont_score_delta": float(
                data.get("trend_cont_score_delta", TREND_CONT_SCORE_DELTA)
            ),
            "trend_cont_signal_quality_min": float(
                data.get(
                    "trend_cont_signal_quality_min",
                    TREND_CONT_SIGNAL_QUALITY_MIN,
                )
            ),
            "trend_cont_confirm_trend_min": float(
                data.get(
                    "trend_cont_confirm_trend_min",
                    TREND_CONT_CONFIRM_TREND_MIN,
                )
            ),
            "trend_cont_volume_ratio_min": float(
                data.get("trend_cont_volume_ratio_min", TREND_CONT_VOLUME_RATIO_MIN)
            ),
            "reversal_score_floor": float(
                data.get("reversal_score_floor", REVERSAL_SCORE_FLOOR)
            ),
            "reversal_confirm_trend_floor": float(
                data.get(
                    "reversal_confirm_trend_floor",
                    REVERSAL_CONFIRM_TREND_FLOOR,
                )
            ),
            "reversal_rsi_15m_max": float(
                data.get("reversal_rsi_15m_max", REVERSAL_RSI_15M_MAX)
            ),
            "reversal_rsi_1m_min": float(
                data.get("reversal_rsi_1m_min", REVERSAL_RSI_1M_MIN)
            ),
            "reversal_rsi_1m_max": float(
                data.get("reversal_rsi_1m_max", REVERSAL_RSI_1M_MAX)
            ),
            "reversal_lower_wick_min": float(
                data.get("reversal_lower_wick_min", REVERSAL_LOWER_WICK_MIN)
            ),
            "reversal_close_location_min": float(
                data.get(
                    "reversal_close_location_min",
                    REVERSAL_CLOSE_LOCATION_MIN,
                )
            ),
            "reversal_distance_from_low_max": float(
                data.get(
                    "reversal_distance_from_low_max",
                    REVERSAL_DISTANCE_FROM_LOW_MAX,
                )
            ),
            "reversal_volume_ratio_min": float(
                data.get("reversal_volume_ratio_min", REVERSAL_VOLUME_RATIO_MIN)
            ),
            "reversal_swing_window": int(
                float(data.get("reversal_swing_window", REVERSAL_SWING_WINDOW))
            ),
            "cooldown_after_loss_cycles": int(
                float(data.get("cooldown_after_loss_cycles", COOLDOWN_AFTER_LOSS_CYCLES))
            ),
            "min_weakness_exit_age_minutes": float(
                data.get(
                    "min_weakness_exit_age_minutes",
                    MIN_WEAKNESS_EXIT_AGE_MINUTES,
                )
            ),
            "strategy_profile": data.get(
                "strategy_profile",
                DEFAULT_STRATEGY_PROFILE,
            ),
            "cycle_history_limit": int(
                float(data.get("cycle_history_limit", DEFAULT_CYCLE_HISTORY_LIMIT))
            ),
            "schema_version": data.get("schema_version", SCHEMA_VERSION),
        }

    def update_settings(
        self,
        *,
        selected_symbols: Optional[List[str]] = None,
        poll_seconds: Optional[int] = None,
        running: Optional[bool] = None,
        trade_size_fraction: Optional[float] = None,
        cycle_history_limit: Optional[int] = None,
        quote_asset: Optional[str] = None,
        fee_rate: Optional[float] = None,
        time_exit_enabled: Optional[bool] = None,
        primary_kline_interval: Optional[str] = None,
        primary_kline_limit: Optional[int] = None,
        confirm_kline_interval: Optional[str] = None,
        confirm_kline_limit: Optional[int] = None,
        reversal_kline_interval: Optional[str] = None,
        reversal_kline_limit: Optional[int] = None,
        learning_horizon_cycles: Optional[int] = None,
        learning_warmup_cycles: Optional[int] = None,
        max_open_positions: Optional[int] = None,
        buy_threshold: Optional[float] = None,
        sell_threshold: Optional[float] = None,
        take_profit_ratio: Optional[float] = None,
        stop_loss_ratio: Optional[float] = None,
        max_position_age_minutes: Optional[int] = None,
        min_trade_notional: Optional[float] = None,
        max_primary_volatility: Optional[float] = None,
        max_direction_flip_ratio: Optional[float] = None,
        min_volume_ratio: Optional[float] = None,
        min_candle_body_ratio: Optional[float] = None,
        entry_rsi_limit: Optional[float] = None,
        entry_signal_quality_min: Optional[float] = None,
        range_entry_signal_quality_min: Optional[float] = None,
        entry_confirm_trend_min: Optional[float] = None,
        entry_confirm_momentum_min: Optional[float] = None,
        breakout_score_delta: Optional[float] = None,
        breakout_trend_fast_min: Optional[float] = None,
        breakout_confirm_trend_min: Optional[float] = None,
        breakout_momentum_15_min: Optional[float] = None,
        breakout_volume_ratio_min: Optional[float] = None,
        breakout_close_location_min: Optional[float] = None,
        trend_cont_score_delta: Optional[float] = None,
        trend_cont_signal_quality_min: Optional[float] = None,
        trend_cont_confirm_trend_min: Optional[float] = None,
        trend_cont_volume_ratio_min: Optional[float] = None,
        reversal_score_floor: Optional[float] = None,
        reversal_confirm_trend_floor: Optional[float] = None,
        reversal_rsi_15m_max: Optional[float] = None,
        reversal_rsi_1m_min: Optional[float] = None,
        reversal_rsi_1m_max: Optional[float] = None,
        reversal_lower_wick_min: Optional[float] = None,
        reversal_close_location_min: Optional[float] = None,
        reversal_distance_from_low_max: Optional[float] = None,
        reversal_volume_ratio_min: Optional[float] = None,
        reversal_swing_window: Optional[int] = None,
        cooldown_after_loss_cycles: Optional[int] = None,
        min_weakness_exit_age_minutes: Optional[float] = None,
        strategy_profile: Optional[str] = None,
    ) -> None:
        with self.lock, self.connect() as conn:
            if selected_symbols is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("selected_symbols", json.dumps(selected_symbols)),
                )
            if poll_seconds is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("poll_seconds", str(poll_seconds)),
                )
            if running is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("running", "1" if running else "0"),
                )
            if trade_size_fraction is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("trade_size_fraction", str(trade_size_fraction)),
                )
            if cycle_history_limit is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("cycle_history_limit", str(cycle_history_limit)),
                )
            if quote_asset is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("quote_asset", quote_asset),
                )
            if fee_rate is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("fee_rate", str(fee_rate)),
                )
            if time_exit_enabled is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("time_exit_enabled", "1" if time_exit_enabled else "0"),
                )
            if primary_kline_interval is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("primary_kline_interval", primary_kline_interval),
                )
            if primary_kline_limit is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("primary_kline_limit", str(primary_kline_limit)),
                )
            if confirm_kline_interval is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("confirm_kline_interval", confirm_kline_interval),
                )
            if confirm_kline_limit is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("confirm_kline_limit", str(confirm_kline_limit)),
                )
            if reversal_kline_interval is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_kline_interval", reversal_kline_interval),
                )
            if reversal_kline_limit is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_kline_limit", str(reversal_kline_limit)),
                )
            if learning_horizon_cycles is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("learning_horizon_cycles", str(learning_horizon_cycles)),
                )
            if learning_warmup_cycles is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("learning_warmup_cycles", str(learning_warmup_cycles)),
                )
            if max_open_positions is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("max_open_positions", str(max_open_positions)),
                )
            if buy_threshold is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("buy_threshold", str(buy_threshold)),
                )
            if sell_threshold is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("sell_threshold", str(sell_threshold)),
                )
            if take_profit_ratio is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("take_profit_ratio", str(take_profit_ratio)),
                )
            if stop_loss_ratio is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("stop_loss_ratio", str(stop_loss_ratio)),
                )
            if max_position_age_minutes is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("max_position_age_minutes", str(max_position_age_minutes)),
                )
            if min_trade_notional is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("min_trade_notional", str(min_trade_notional)),
                )
            if max_primary_volatility is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("max_primary_volatility", str(max_primary_volatility)),
                )
            if max_direction_flip_ratio is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("max_direction_flip_ratio", str(max_direction_flip_ratio)),
                )
            if min_volume_ratio is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("min_volume_ratio", str(min_volume_ratio)),
                )
            if min_candle_body_ratio is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("min_candle_body_ratio", str(min_candle_body_ratio)),
                )
            if entry_rsi_limit is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("entry_rsi_limit", str(entry_rsi_limit)),
                )
            if entry_signal_quality_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("entry_signal_quality_min", str(entry_signal_quality_min)),
                )
            if range_entry_signal_quality_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    (
                        "range_entry_signal_quality_min",
                        str(range_entry_signal_quality_min),
                    ),
                )
            if entry_confirm_trend_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("entry_confirm_trend_min", str(entry_confirm_trend_min)),
                )
            if entry_confirm_momentum_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("entry_confirm_momentum_min", str(entry_confirm_momentum_min)),
                )
            if breakout_score_delta is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_score_delta", str(breakout_score_delta)),
                )
            if breakout_trend_fast_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_trend_fast_min", str(breakout_trend_fast_min)),
                )
            if breakout_confirm_trend_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_confirm_trend_min", str(breakout_confirm_trend_min)),
                )
            if breakout_momentum_15_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_momentum_15_min", str(breakout_momentum_15_min)),
                )
            if breakout_volume_ratio_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_volume_ratio_min", str(breakout_volume_ratio_min)),
                )
            if breakout_close_location_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("breakout_close_location_min", str(breakout_close_location_min)),
                )
            if trend_cont_score_delta is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("trend_cont_score_delta", str(trend_cont_score_delta)),
                )
            if trend_cont_signal_quality_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    (
                        "trend_cont_signal_quality_min",
                        str(trend_cont_signal_quality_min),
                    ),
                )
            if trend_cont_confirm_trend_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    (
                        "trend_cont_confirm_trend_min",
                        str(trend_cont_confirm_trend_min),
                    ),
                )
            if trend_cont_volume_ratio_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("trend_cont_volume_ratio_min", str(trend_cont_volume_ratio_min)),
                )
            if reversal_score_floor is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_score_floor", str(reversal_score_floor)),
                )
            if reversal_confirm_trend_floor is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_confirm_trend_floor", str(reversal_confirm_trend_floor)),
                )
            if reversal_rsi_15m_max is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_rsi_15m_max", str(reversal_rsi_15m_max)),
                )
            if reversal_rsi_1m_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_rsi_1m_min", str(reversal_rsi_1m_min)),
                )
            if reversal_rsi_1m_max is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_rsi_1m_max", str(reversal_rsi_1m_max)),
                )
            if reversal_lower_wick_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_lower_wick_min", str(reversal_lower_wick_min)),
                )
            if reversal_close_location_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_close_location_min", str(reversal_close_location_min)),
                )
            if reversal_distance_from_low_max is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_distance_from_low_max", str(reversal_distance_from_low_max)),
                )
            if reversal_volume_ratio_min is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_volume_ratio_min", str(reversal_volume_ratio_min)),
                )
            if reversal_swing_window is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("reversal_swing_window", str(reversal_swing_window)),
                )
            if cooldown_after_loss_cycles is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("cooldown_after_loss_cycles", str(cooldown_after_loss_cycles)),
                )
            if min_weakness_exit_age_minutes is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    (
                        "min_weakness_exit_age_minutes",
                        str(min_weakness_exit_age_minutes),
                    ),
                )
            if strategy_profile is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    ("strategy_profile", strategy_profile),
                )

    def reset_simulation(
        self,
        initial_capital: float,
        selected_symbols: Optional[List[str]] = None,
        poll_seconds: Optional[int] = None,
        trade_size_fraction: Optional[float] = None,
        cycle_history_limit: Optional[int] = None,
        quote_asset: Optional[str] = None,
        fee_rate: Optional[float] = None,
        time_exit_enabled: Optional[bool] = None,
        primary_kline_interval: Optional[str] = None,
        primary_kline_limit: Optional[int] = None,
        confirm_kline_interval: Optional[str] = None,
        confirm_kline_limit: Optional[int] = None,
        reversal_kline_interval: Optional[str] = None,
        reversal_kline_limit: Optional[int] = None,
        learning_horizon_cycles: Optional[int] = None,
        learning_warmup_cycles: Optional[int] = None,
        max_open_positions: Optional[int] = None,
        buy_threshold: Optional[float] = None,
        sell_threshold: Optional[float] = None,
        take_profit_ratio: Optional[float] = None,
        stop_loss_ratio: Optional[float] = None,
        max_position_age_minutes: Optional[int] = None,
        min_trade_notional: Optional[float] = None,
        max_primary_volatility: Optional[float] = None,
        max_direction_flip_ratio: Optional[float] = None,
        min_volume_ratio: Optional[float] = None,
        min_candle_body_ratio: Optional[float] = None,
        entry_rsi_limit: Optional[float] = None,
        entry_signal_quality_min: Optional[float] = None,
        range_entry_signal_quality_min: Optional[float] = None,
        entry_confirm_trend_min: Optional[float] = None,
        entry_confirm_momentum_min: Optional[float] = None,
        breakout_score_delta: Optional[float] = None,
        breakout_trend_fast_min: Optional[float] = None,
        breakout_confirm_trend_min: Optional[float] = None,
        breakout_momentum_15_min: Optional[float] = None,
        breakout_volume_ratio_min: Optional[float] = None,
        breakout_close_location_min: Optional[float] = None,
        trend_cont_score_delta: Optional[float] = None,
        trend_cont_signal_quality_min: Optional[float] = None,
        trend_cont_confirm_trend_min: Optional[float] = None,
        trend_cont_volume_ratio_min: Optional[float] = None,
        reversal_score_floor: Optional[float] = None,
        reversal_confirm_trend_floor: Optional[float] = None,
        reversal_rsi_15m_max: Optional[float] = None,
        reversal_rsi_1m_min: Optional[float] = None,
        reversal_rsi_1m_max: Optional[float] = None,
        reversal_lower_wick_min: Optional[float] = None,
        reversal_close_location_min: Optional[float] = None,
        reversal_distance_from_low_max: Optional[float] = None,
        reversal_volume_ratio_min: Optional[float] = None,
        reversal_swing_window: Optional[int] = None,
        cooldown_after_loss_cycles: Optional[int] = None,
        min_weakness_exit_age_minutes: Optional[float] = None,
        strategy_profile: Optional[str] = None,
        clear_learning: bool = False,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute("DELETE FROM positions")
            conn.execute("DELETE FROM decisions")
            conn.execute("DELETE FROM transactions")
            conn.execute("DELETE FROM equity_history")
            if clear_learning:
                conn.execute("DELETE FROM symbol_learning_state")
                conn.execute("DELETE FROM symbol_cycle_history")
            conn.execute(
                """
                UPDATE portfolio
                SET initial_capital = ?, cash_balance = ?, realized_pnl = 0,
                    updated_at = ?
                WHERE id = 1
                """,
                (initial_capital, initial_capital, utc_now_iso()),
            )
        self.update_settings(
            selected_symbols=selected_symbols,
            poll_seconds=poll_seconds,
            running=False,
            trade_size_fraction=trade_size_fraction,
            cycle_history_limit=cycle_history_limit,
            quote_asset=quote_asset,
            fee_rate=fee_rate,
            time_exit_enabled=time_exit_enabled,
            primary_kline_interval=primary_kline_interval,
            primary_kline_limit=primary_kline_limit,
            confirm_kline_interval=confirm_kline_interval,
            confirm_kline_limit=confirm_kline_limit,
            reversal_kline_interval=reversal_kline_interval,
            reversal_kline_limit=reversal_kline_limit,
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
            range_entry_signal_quality_min=range_entry_signal_quality_min,
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
            reversal_score_floor=reversal_score_floor,
            reversal_confirm_trend_floor=reversal_confirm_trend_floor,
            reversal_rsi_15m_max=reversal_rsi_15m_max,
            reversal_rsi_1m_min=reversal_rsi_1m_min,
            reversal_rsi_1m_max=reversal_rsi_1m_max,
            reversal_lower_wick_min=reversal_lower_wick_min,
            reversal_close_location_min=reversal_close_location_min,
            reversal_distance_from_low_max=reversal_distance_from_low_max,
            reversal_volume_ratio_min=reversal_volume_ratio_min,
            reversal_swing_window=reversal_swing_window,
            cooldown_after_loss_cycles=cooldown_after_loss_cycles,
            min_weakness_exit_age_minutes=min_weakness_exit_age_minutes,
            strategy_profile=strategy_profile,
        )

    def clear_learning_state(self) -> None:
        with self.lock, self.connect() as conn:
            conn.execute("DELETE FROM symbol_learning_state")
            conn.execute("DELETE FROM symbol_cycle_history")

    def update_initial_capital_reference(self, initial_capital: float) -> None:
        with self.lock, self.connect() as conn:
            portfolio = conn.execute(
                "SELECT initial_capital, cash_balance, realized_pnl FROM portfolio WHERE id = 1"
            ).fetchone()
            transaction_count = conn.execute(
                "SELECT COUNT(*) AS total FROM transactions"
            ).fetchone()["total"]
            open_positions = conn.execute(
                "SELECT COUNT(*) AS total FROM positions WHERE quantity > 0"
            ).fetchone()["total"]

            next_cash_balance = float(portfolio["cash_balance"])
            next_realized_pnl = float(portfolio["realized_pnl"])
            if transaction_count == 0 and open_positions == 0:
                next_cash_balance = initial_capital
                next_realized_pnl = 0.0

            conn.execute(
                """
                UPDATE portfolio
                SET initial_capital = ?, cash_balance = ?, realized_pnl = ?, updated_at = ?
                WHERE id = 1
                """,
                (
                    initial_capital,
                    next_cash_balance,
                    next_realized_pnl,
                    utc_now_iso(),
                ),
            )

    def get_portfolio(self) -> Dict[str, float]:
        with self.lock, self.connect() as conn:
            row = conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone()
        return dict(row)

    def reconcile_portfolio_with_transactions(self) -> Dict[str, float]:
        with self.lock, self.connect() as conn:
            portfolio_row = conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone()
            portfolio = dict(portfolio_row)
            transaction_rows = conn.execute(
                "SELECT side, net_value, realized_pnl FROM transactions ORDER BY id ASC"
            ).fetchall()

            expected_cash = portfolio["initial_capital"]
            expected_realized = 0.0
            for row in transaction_rows:
                if row["side"] == "buy":
                    expected_cash -= row["net_value"]
                elif row["side"] == "sell":
                    expected_cash += row["net_value"]
                    expected_realized += row["realized_pnl"]

            if (
                abs(portfolio["cash_balance"] - expected_cash) > 1e-9
                or abs(portfolio["realized_pnl"] - expected_realized) > 1e-9
            ):
                conn.execute(
                    """
                    UPDATE portfolio
                    SET cash_balance = ?, realized_pnl = ?, updated_at = ?
                    WHERE id = 1
                    """,
                    (expected_cash, expected_realized, utc_now_iso()),
                )
                portfolio["cash_balance"] = expected_cash
                portfolio["realized_pnl"] = expected_realized
            return portfolio

    def update_cash_balance(self, cash_balance: float, realized_pnl: float) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                UPDATE portfolio
                SET cash_balance = ?, realized_pnl = ?, updated_at = ?
                WHERE id = 1
                """,
                (cash_balance, realized_pnl, utc_now_iso()),
            )

    def record_buy(
        self,
        *,
        symbol: str,
        quantity: float,
        avg_price: float,
        opened_at: str,
        last_decision: str,
        cost_basis: float,
        gross_value: float,
        fee: float,
        rationale: str,
    ) -> Dict[str, float]:
        with self.lock, self.connect() as conn:
            portfolio = dict(conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone())
            new_cash_balance = portfolio["cash_balance"] - cost_basis
            if new_cash_balance < -1e-9:
                raise ValueError("Saldo insuficiente para registrar a compra.")

            conn.execute(
                """
                UPDATE portfolio
                SET cash_balance = ?, updated_at = ?
                WHERE id = 1
                """,
                (new_cash_balance, utc_now_iso()),
            )
            conn.execute(
                """
                INSERT INTO positions(
                    symbol, quantity, avg_price, opened_at, last_decision, cost_basis
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    quantity = excluded.quantity,
                    avg_price = excluded.avg_price,
                    opened_at = excluded.opened_at,
                    last_decision = excluded.last_decision,
                    cost_basis = excluded.cost_basis
                """,
                (symbol, quantity, avg_price, opened_at, last_decision, cost_basis),
            )
            conn.execute(
                """
                INSERT INTO transactions(
                    timestamp, symbol, side, price, quantity, gross_value,
                    fee, net_value, realized_pnl, balance_after, rationale
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now_iso(),
                    symbol,
                    "buy",
                    avg_price,
                    quantity,
                    gross_value,
                    fee,
                    cost_basis,
                    0.0,
                    new_cash_balance,
                    rationale,
                ),
            )
            portfolio["cash_balance"] = new_cash_balance
            return portfolio

    def record_sell(
        self,
        *,
        symbol: str,
        quantity: float,
        price: float,
        gross_value: float,
        fee: float,
        net_value: float,
        realized_pnl: float,
        rationale: str,
    ) -> Dict[str, float]:
        with self.lock, self.connect() as conn:
            portfolio = dict(conn.execute("SELECT * FROM portfolio WHERE id = 1").fetchone())
            new_cash_balance = portfolio["cash_balance"] + net_value
            new_realized_pnl = portfolio["realized_pnl"] + realized_pnl

            conn.execute(
                """
                UPDATE portfolio
                SET cash_balance = ?, realized_pnl = ?, updated_at = ?
                WHERE id = 1
                """,
                (new_cash_balance, new_realized_pnl, utc_now_iso()),
            )
            conn.execute("DELETE FROM positions WHERE symbol = ?", (symbol,))
            conn.execute(
                """
                INSERT INTO transactions(
                    timestamp, symbol, side, price, quantity, gross_value,
                    fee, net_value, realized_pnl, balance_after, rationale
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now_iso(),
                    symbol,
                    "sell",
                    price,
                    quantity,
                    gross_value,
                    fee,
                    net_value,
                    realized_pnl,
                    new_cash_balance,
                    rationale,
                ),
            )
            portfolio["cash_balance"] = new_cash_balance
            portfolio["realized_pnl"] = new_realized_pnl
            return portfolio

    def get_learning_state(self, symbol: str) -> Dict[str, Any]:
        with self.lock, self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM symbol_learning_state WHERE symbol = ?",
                (symbol,),
            ).fetchone()
        if row:
            return dict(row)
        return {
            "symbol": symbol,
            "cycle_count": 0,
            "resolved_count": 0,
            "accuracy_ewma": 0.5,
            "edge_ewma": 0.0,
            "smoothed_confidence": 0.18,
            "cooldown_until_cycle": 0,
            "last_exit_reason": "",
            "last_regime": "cold-start",
            "updated_at": utc_now_iso(),
        }

    def upsert_learning_state(self, state: Dict[str, Any]) -> None:
        normalized_state = {
            "symbol": state["symbol"],
            "cycle_count": int(state.get("cycle_count", 0)),
            "resolved_count": int(state.get("resolved_count", 0)),
            "accuracy_ewma": float(state.get("accuracy_ewma", 0.5)),
            "edge_ewma": float(state.get("edge_ewma", 0.0)),
            "smoothed_confidence": float(state.get("smoothed_confidence", 0.18)),
            "cooldown_until_cycle": int(state.get("cooldown_until_cycle", 0)),
            "last_exit_reason": str(state.get("last_exit_reason", "")),
            "last_regime": str(state.get("last_regime", "cold-start")),
            "updated_at": state.get("updated_at", utc_now_iso()),
        }
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO symbol_learning_state(
                    symbol, cycle_count, resolved_count, accuracy_ewma,
                    edge_ewma, smoothed_confidence, cooldown_until_cycle,
                    last_exit_reason, last_regime, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    cycle_count = excluded.cycle_count,
                    resolved_count = excluded.resolved_count,
                    accuracy_ewma = excluded.accuracy_ewma,
                    edge_ewma = excluded.edge_ewma,
                    smoothed_confidence = excluded.smoothed_confidence,
                    cooldown_until_cycle = excluded.cooldown_until_cycle,
                    last_exit_reason = excluded.last_exit_reason,
                    last_regime = excluded.last_regime,
                    updated_at = excluded.updated_at
                """,
                (
                    normalized_state["symbol"],
                    normalized_state["cycle_count"],
                    normalized_state["resolved_count"],
                    normalized_state["accuracy_ewma"],
                    normalized_state["edge_ewma"],
                    normalized_state["smoothed_confidence"],
                    normalized_state["cooldown_until_cycle"],
                    normalized_state["last_exit_reason"],
                    normalized_state["last_regime"],
                    normalized_state["updated_at"],
                ),
            )

    def add_cycle_snapshot(
        self,
        *,
        symbol: str,
        cycle_index: int,
        price: float,
        action: str,
        score: float,
        confidence_raw: float,
        confidence_stable: float,
        regime: str,
        features: Dict[str, Any],
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO symbol_cycle_history(
                    symbol, cycle_index, timestamp, price, action, score,
                    confidence_raw, confidence_stable, regime, features_json, resolved
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    symbol,
                    cycle_index,
                    utc_now_iso(),
                    price,
                    action,
                    score,
                    confidence_raw,
                    confidence_stable,
                    regime,
                    json.dumps(features),
                ),
            )

    def list_resolvable_cycle_snapshots(
        self,
        symbol: str,
        max_cycle_index: int,
    ) -> List[Dict[str, Any]]:
        if max_cycle_index < 1:
            return []
        with self.lock, self.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM symbol_cycle_history
                WHERE symbol = ? AND resolved = 0 AND cycle_index <= ?
                ORDER BY cycle_index ASC
                """,
                (symbol, max_cycle_index),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["features"] = json.loads(item.pop("features_json"))
            results.append(item)
        return results

    def resolve_cycle_snapshot(
        self,
        snapshot_id: int,
        *,
        future_price: float,
        future_return: float,
        outcome_score: float,
        net_edge: float,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                UPDATE symbol_cycle_history
                SET resolved = 1,
                    future_price = ?,
                    future_return = ?,
                    outcome_score = ?,
                    net_edge = ?,
                    resolved_at = ?
                WHERE id = ?
                """,
                (
                    future_price,
                    future_return,
                    outcome_score,
                    net_edge,
                    utc_now_iso(),
                    snapshot_id,
                ),
            )

    def prune_cycle_history(self, symbol: str, keep_limit: int) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                DELETE FROM symbol_cycle_history
                WHERE symbol = ?
                  AND id NOT IN (
                    SELECT id
                    FROM symbol_cycle_history
                    WHERE symbol = ?
                    ORDER BY cycle_index DESC
                    LIMIT ?
                  )
                """,
                (symbol, symbol, keep_limit),
            )

    def get_learning_summary(self, warmup_cycles: int = LEARNING_WARMUP_CYCLES) -> Dict[str, Any]:
        with self.lock, self.connect() as conn:
            snapshot_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_snapshots,
                    SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) AS resolved_snapshots
                FROM symbol_cycle_history
                """
            ).fetchone()
            symbol_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_symbols,
                    SUM(CASE WHEN resolved_count >= ? THEN 1 ELSE 0 END) AS warmed_symbols,
                    AVG(accuracy_ewma) AS avg_accuracy
                FROM symbol_learning_state
                """,
                (max(1, warmup_cycles),),
            ).fetchone()

        return {
            "total_snapshots": int(snapshot_row["total_snapshots"] or 0),
            "resolved_snapshots": int(snapshot_row["resolved_snapshots"] or 0),
            "total_symbols": int(symbol_row["total_symbols"] or 0),
            "warmed_symbols": int(symbol_row["warmed_symbols"] or 0),
            "avg_accuracy": float(symbol_row["avg_accuracy"]) if symbol_row["avg_accuracy"] is not None else None,
        }

    def list_positions(self) -> List[Dict[str, Any]]:
        with self.lock, self.connect() as conn:
            rows = conn.execute("SELECT * FROM positions ORDER BY opened_at ASC").fetchall()
        return [dict(row) for row in rows]

    def get_position(self, symbol: str) -> Optional[Dict[str, Any]]:
        with self.lock, self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM positions WHERE symbol = ?",
                (symbol,),
            ).fetchone()
        return dict(row) if row else None

    def upsert_position(
        self,
        *,
        symbol: str,
        quantity: float,
        avg_price: float,
        opened_at: str,
        last_decision: str,
        cost_basis: float,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO positions(
                    symbol, quantity, avg_price, opened_at, last_decision, cost_basis
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    quantity = excluded.quantity,
                    avg_price = excluded.avg_price,
                    opened_at = excluded.opened_at,
                    last_decision = excluded.last_decision,
                    cost_basis = excluded.cost_basis
                """,
                (symbol, quantity, avg_price, opened_at, last_decision, cost_basis),
            )

    def delete_position(self, symbol: str) -> None:
        with self.lock, self.connect() as conn:
            conn.execute("DELETE FROM positions WHERE symbol = ?", (symbol,))

    def add_decision(
        self,
        *,
        symbol: str,
        action: str,
        score: float,
        confidence: float,
        price: float,
        features: Dict[str, Any],
        rationale: str,
        executed: bool,
        execution_note: str,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO decisions(
                    timestamp, symbol, action, score, confidence, price,
                    features_json, rationale, executed, execution_note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now_iso(),
                    symbol,
                    action,
                    score,
                    confidence,
                    price,
                    json.dumps(features),
                    rationale,
                    1 if executed else 0,
                    execution_note,
                ),
            )

    def add_transaction(
        self,
        *,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        gross_value: float,
        fee: float,
        net_value: float,
        realized_pnl: float,
        balance_after: float,
        rationale: str,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO transactions(
                    timestamp, symbol, side, price, quantity, gross_value,
                    fee, net_value, realized_pnl, balance_after, rationale
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now_iso(),
                    symbol,
                    side,
                    price,
                    quantity,
                    gross_value,
                    fee,
                    net_value,
                    realized_pnl,
                    balance_after,
                    rationale,
                ),
            )

    def add_equity_snapshot(
        self,
        *,
        total_balance: float,
        cash_balance: float,
        unrealized_pnl: float,
        realized_pnl: float,
    ) -> None:
        with self.lock, self.connect() as conn:
            conn.execute(
                """
                INSERT INTO equity_history(
                    timestamp, total_balance, cash_balance,
                    unrealized_pnl, realized_pnl
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    utc_now_iso(),
                    total_balance,
                    cash_balance,
                    unrealized_pnl,
                    realized_pnl,
                ),
            )

    def list_transactions(self, limit: int = 200) -> List[Dict[str, Any]]:
        with self.lock, self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM transactions ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_transaction_summary_by_symbol(self, symbols: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
        query = "SELECT symbol, side, price, realized_pnl FROM transactions"
        params: List[Any] = []
        if symbols:
            placeholders = ", ".join("?" for _ in symbols)
            query += f" WHERE symbol IN ({placeholders})"
            params.extend(symbols)
        query += " ORDER BY id ASC"

        with self.lock, self.connect() as conn:
            rows = conn.execute(query, params).fetchall()

        summary: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            symbol = row["symbol"]
            item = summary.setdefault(
                symbol,
                {
                    "last_buy_price": None,
                    "last_sell_price": None,
                    "realized_pnl_total": 0.0,
                },
            )
            if row["side"] == "buy":
                item["last_buy_price"] = row["price"]
            elif row["side"] == "sell":
                item["last_sell_price"] = row["price"]
                item["realized_pnl_total"] += row["realized_pnl"]
        return summary

    def list_decisions(self, limit: int = 200) -> List[Dict[str, Any]]:
        with self.lock, self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM decisions ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["features"] = json.loads(item.pop("features_json"))
            results.append(item)
        return results

    def list_equity_history(self, limit: int = 300) -> List[Dict[str, Any]]:
        with self.lock, self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM equity_history ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]
