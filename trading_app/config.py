from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "trading_sim.db"

DEFAULT_QUOTE_ASSET = "BRL"
DEFAULT_FEE_RATE = 0.00075
QUOTE_ASSET = DEFAULT_QUOTE_ASSET
FEE_RATE = DEFAULT_FEE_RATE
DEFAULT_INITIAL_CAPITAL = 1000.0
DEFAULT_SELECTED_SYMBOLS = ["BTCBRL", "ETHBRL", "BNBBRL", "SOLBRL", "XRPBRL"]
DEFAULT_POLL_SECONDS = 20
DEFAULT_KLINE_INTERVAL = "1m"
DEFAULT_KLINE_LIMIT = 120
TREND_CONFIRM_INTERVAL = "5m"
TREND_CONFIRM_LIMIT = 120
REVERSAL_CONFIRM_INTERVAL = "15m"
REVERSAL_CONFIRM_LIMIT = 120
DEFAULT_CYCLE_HISTORY_LIMIT = 400
DEFAULT_LEARNING_HORIZON_CYCLES = 6
LEARNING_WARMUP_CYCLES = 30
DEFAULT_TRADE_SIZE_FRACTION = 0.22
DEFAULT_TIME_EXIT_ENABLED = False
DEFAULT_MAX_OPEN_POSITIONS = 4
BUY_THRESHOLD = 0.8
SELL_THRESHOLD = -0.55
TAKE_PROFIT_RATIO = 0.0065
STOP_LOSS_RATIO = -0.005
MAX_POSITION_AGE_MINUTES = 35
DEFAULT_STRATEGY_PROFILE = "equilibrado"
MIN_TRADE_NOTIONAL = 20.0
MAX_PRIMARY_VOLATILITY = 0.012
MAX_DIRECTION_FLIP_RATIO = 0.58
MIN_VOLUME_RATIO = 0.9
MIN_CANDLE_BODY_RATIO = 0.22
ENTRY_RSI_LIMIT = 78.0
ENTRY_SIGNAL_QUALITY_MIN = 0.42
RANGE_ENTRY_SIGNAL_QUALITY_MIN = 0.56
ENTRY_CONFIRM_TREND_MIN = -0.0003
ENTRY_CONFIRM_MOMENTUM_MIN = -0.003
BREAKOUT_SCORE_DELTA = 0.45
BREAKOUT_TREND_FAST_MIN = 0.0007
BREAKOUT_CONFIRM_TREND_MIN = -0.0002
BREAKOUT_MOMENTUM_15_MIN = 0.004
BREAKOUT_VOLUME_RATIO_MIN = 1.0
BREAKOUT_CLOSE_LOCATION_MIN = 0.66
TREND_CONT_SCORE_DELTA = 0.28
TREND_CONT_SIGNAL_QUALITY_MIN = 0.62
TREND_CONT_CONFIRM_TREND_MIN = 0.0006
TREND_CONT_VOLUME_RATIO_MIN = 1.0
REVERSAL_SCORE_FLOOR = 0.52
REVERSAL_CONFIRM_TREND_FLOOR = -0.0018
REVERSAL_RSI_15M_MAX = 54.0
REVERSAL_RSI_1M_MIN = 48.0
REVERSAL_RSI_1M_MAX = 66.0
REVERSAL_LOWER_WICK_MIN = 0.34
REVERSAL_CLOSE_LOCATION_MIN = 0.68
REVERSAL_DISTANCE_FROM_LOW_MAX = 0.012
REVERSAL_VOLUME_RATIO_MIN = 1.0
REVERSAL_SWING_WINDOW = 10
COOLDOWN_AFTER_LOSS_CYCLES = 24
MIN_WEAKNESS_EXIT_AGE_MINUTES = 6
MAX_FEE_RATE = 0.05

STRATEGY_PROFILES = {
    "conservador": {
        "label": "Conservador",
        "buy_threshold": 1.15,
        "sell_threshold": -0.35,
        "take_profit_ratio": 0.0045,
        "stop_loss_ratio": -0.0035,
        "max_position_age_minutes": 20,
        "max_primary_volatility": 0.0095,
        "max_direction_flip_ratio": 0.42,
        "min_volume_ratio": 1.05,
        "min_candle_body_ratio": 0.28,
        "entry_rsi_limit": 70.0,
        "entry_signal_quality_min": 0.5,
        "range_entry_signal_quality_min": 0.64,
        "entry_confirm_trend_min": 0.0,
        "entry_confirm_momentum_min": -0.0015,
        "breakout_score_delta": 0.6,
        "breakout_trend_fast_min": 0.001,
        "breakout_confirm_trend_min": 0.0,
        "breakout_momentum_15_min": 0.006,
        "breakout_volume_ratio_min": 1.08,
        "breakout_close_location_min": 0.72,
        "trend_cont_score_delta": 0.4,
        "trend_cont_signal_quality_min": 0.72,
        "trend_cont_confirm_trend_min": 0.0012,
        "trend_cont_volume_ratio_min": 1.1,
        "reversal_score_floor": 0.7,
        "reversal_confirm_trend_floor": -0.0008,
        "reversal_rsi_15m_max": 50.0,
        "reversal_rsi_1m_min": 52.0,
        "reversal_rsi_1m_max": 60.0,
        "reversal_lower_wick_min": 0.4,
        "reversal_close_location_min": 0.75,
        "reversal_distance_from_low_max": 0.009,
        "reversal_volume_ratio_min": 1.08,
        "reversal_swing_window": 8,
        "cooldown_after_loss_cycles": 36,
        "min_weakness_exit_age_minutes": 8,
    },
    "equilibrado": {
        "label": "Equilibrado",
        "buy_threshold": BUY_THRESHOLD,
        "sell_threshold": SELL_THRESHOLD,
        "take_profit_ratio": TAKE_PROFIT_RATIO,
        "stop_loss_ratio": STOP_LOSS_RATIO,
        "max_position_age_minutes": MAX_POSITION_AGE_MINUTES,
        "max_primary_volatility": MAX_PRIMARY_VOLATILITY,
        "max_direction_flip_ratio": MAX_DIRECTION_FLIP_RATIO,
        "min_volume_ratio": MIN_VOLUME_RATIO,
        "min_candle_body_ratio": MIN_CANDLE_BODY_RATIO,
        "entry_rsi_limit": ENTRY_RSI_LIMIT,
        "entry_signal_quality_min": ENTRY_SIGNAL_QUALITY_MIN,
        "range_entry_signal_quality_min": RANGE_ENTRY_SIGNAL_QUALITY_MIN,
        "entry_confirm_trend_min": ENTRY_CONFIRM_TREND_MIN,
        "entry_confirm_momentum_min": ENTRY_CONFIRM_MOMENTUM_MIN,
        "breakout_score_delta": BREAKOUT_SCORE_DELTA,
        "breakout_trend_fast_min": BREAKOUT_TREND_FAST_MIN,
        "breakout_confirm_trend_min": BREAKOUT_CONFIRM_TREND_MIN,
        "breakout_momentum_15_min": BREAKOUT_MOMENTUM_15_MIN,
        "breakout_volume_ratio_min": BREAKOUT_VOLUME_RATIO_MIN,
        "breakout_close_location_min": BREAKOUT_CLOSE_LOCATION_MIN,
        "trend_cont_score_delta": TREND_CONT_SCORE_DELTA,
        "trend_cont_signal_quality_min": TREND_CONT_SIGNAL_QUALITY_MIN,
        "trend_cont_confirm_trend_min": TREND_CONT_CONFIRM_TREND_MIN,
        "trend_cont_volume_ratio_min": TREND_CONT_VOLUME_RATIO_MIN,
        "reversal_score_floor": REVERSAL_SCORE_FLOOR,
        "reversal_confirm_trend_floor": REVERSAL_CONFIRM_TREND_FLOOR,
        "reversal_rsi_15m_max": REVERSAL_RSI_15M_MAX,
        "reversal_rsi_1m_min": REVERSAL_RSI_1M_MIN,
        "reversal_rsi_1m_max": REVERSAL_RSI_1M_MAX,
        "reversal_lower_wick_min": REVERSAL_LOWER_WICK_MIN,
        "reversal_close_location_min": REVERSAL_CLOSE_LOCATION_MIN,
        "reversal_distance_from_low_max": REVERSAL_DISTANCE_FROM_LOW_MAX,
        "reversal_volume_ratio_min": REVERSAL_VOLUME_RATIO_MIN,
        "reversal_swing_window": REVERSAL_SWING_WINDOW,
        "cooldown_after_loss_cycles": COOLDOWN_AFTER_LOSS_CYCLES,
        "min_weakness_exit_age_minutes": MIN_WEAKNESS_EXIT_AGE_MINUTES,
    },
    "agressivo": {
        "label": "Agressivo",
        "buy_threshold": 0.7,
        "sell_threshold": -0.65,
        "take_profit_ratio": 0.0075,
        "stop_loss_ratio": -0.0065,
        "max_position_age_minutes": 0,
        "max_primary_volatility": 0.0145,
        "max_direction_flip_ratio": 0.58,
        "min_volume_ratio": 0.9,
        "min_candle_body_ratio": 0.2,
        "entry_rsi_limit": 82.0,
        "entry_signal_quality_min": 0.45,
        "range_entry_signal_quality_min": 0.52,
        "entry_confirm_trend_min": -0.0002,
        "entry_confirm_momentum_min": -0.0025,
        "breakout_score_delta": 0.28,
        "breakout_trend_fast_min": 0.0005,
        "breakout_confirm_trend_min": -0.0003,
        "breakout_momentum_15_min": 0.0032,
        "breakout_volume_ratio_min": 0.98,
        "breakout_close_location_min": 0.64,
        "trend_cont_score_delta": 0.24,
        "trend_cont_signal_quality_min": 0.6,
        "trend_cont_confirm_trend_min": 0.00045,
        "trend_cont_volume_ratio_min": 0.95,
        "reversal_score_floor": 0.46,
        "reversal_confirm_trend_floor": -0.0022,
        "reversal_rsi_15m_max": 57.0,
        "reversal_rsi_1m_min": 45.0,
        "reversal_rsi_1m_max": 68.0,
        "reversal_lower_wick_min": 0.3,
        "reversal_close_location_min": 0.64,
        "reversal_distance_from_low_max": 0.015,
        "reversal_volume_ratio_min": 0.95,
        "reversal_swing_window": 12,
        "cooldown_after_loss_cycles": 18,
        "min_weakness_exit_age_minutes": 4,
    },
}
