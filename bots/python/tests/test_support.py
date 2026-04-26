from __future__ import annotations

import pathlib
import sys
from typing import Iterable, List, Sequence


def ensure_python_path() -> None:
    python_dir = pathlib.Path(__file__).resolve().parents[1]
    python_dir_str = str(python_dir)
    if python_dir_str not in sys.path:
        sys.path.insert(0, python_dir_str)


def make_candles(closes: Sequence[float], timestamps: Iterable[str] | None = None) -> List[dict]:
    if timestamps is None:
        timestamps = [f"2024-01-{index + 1:02d}T00:00:00Z" for index in range(len(closes))]

    candles: List[dict] = []
    for index, (close, timestamp) in enumerate(zip(closes, timestamps)):
        close_value = float(close)
        candles.append({
            "timestamp": timestamp,
            "open": round(close_value - 0.4, 8),
            "high": round(close_value + 0.8, 8),
            "low": round(max(0.1, close_value - 0.9), 8),
            "close": close_value,
            "volume": float(1000 + (index * 25)),
            "SMA_7": round(close_value * 0.99, 8),
            "SMA_14": round(close_value * 0.985, 8),
            "EMA_7": round(close_value * 0.992, 8),
            "RSI": float(40 + (index % 20)),
            "MACD": round(close_value * 0.002, 8),
            "BB_upper": round(close_value * 1.03, 8),
            "BB_lower": round(close_value * 0.97, 8),
        })
    return candles
