from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Dict, List

import requests

from .config import DEFAULT_KLINE_INTERVAL, DEFAULT_KLINE_LIMIT, MIN_TRADE_NOTIONAL, QUOTE_ASSET


class MarketDataError(RuntimeError):
    pass


@dataclass
class SymbolInfo:
    symbol: str
    base_asset: str
    quote_asset: str


class BinanceMarketClient:
    BASE_URL = "https://api.binance.com"
    EXCHANGE_INFO_TTL_SECONDS = 300

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "microtrade-ai-sim/1.0"})
        self._exchange_info_cache = None
        self._exchange_info_loaded_at = 0.0

    def _get(self, path: str, **params):
        response = self.session.get(
            f"{self.BASE_URL}{path}",
            params={key: value for key, value in params.items() if value is not None},
            timeout=12,
        )
        response.raise_for_status()
        return response.json()

    def _get_exchange_info(self) -> Dict[str, object]:
        now = time.time()
        if (
            self._exchange_info_cache is not None
            and (now - self._exchange_info_loaded_at) < self.EXCHANGE_INFO_TTL_SECONDS
        ):
            return self._exchange_info_cache

        try:
            payload = self._get("/api/v3/exchangeInfo", symbolStatus="TRADING")
        except requests.RequestException as exc:
            raise MarketDataError("Nao foi possivel carregar a lista de mercados da Binance.") from exc

        self._exchange_info_cache = payload
        self._exchange_info_loaded_at = now
        return payload

    def list_quote_assets(self) -> List[Dict[str, object]]:
        payload = self._get_exchange_info()
        counts: Dict[str, int] = {}

        for symbol in payload.get("symbols", []):
            if symbol.get("status") == "TRADING" and symbol.get("isSpotTradingAllowed"):
                quote_asset = str(symbol.get("quoteAsset", "")).upper()
                counts[quote_asset] = counts.get(quote_asset, 0) + 1

        return [
            {"quote_asset": quote_asset, "pair_count": pair_count}
            for quote_asset, pair_count in sorted(
                counts.items(),
                key=lambda item: (-item[1], item[0]),
            )
        ]

    def list_quote_pairs(self, quote_asset: str = QUOTE_ASSET) -> List[Dict[str, object]]:
        payload = self._get_exchange_info()

        pairs = []
        for symbol in payload.get("symbols", []):
            if (
                symbol.get("quoteAsset") == quote_asset
                and symbol.get("status") == "TRADING"
                and symbol.get("isSpotTradingAllowed")
            ):
                min_notional = self._extract_min_notional(symbol)
                pairs.append(
                    {
                        "symbol": symbol["symbol"],
                        "base_asset": symbol["baseAsset"],
                        "quote_asset": symbol["quoteAsset"],
                        "label": f'{symbol["baseAsset"]} / {symbol["quoteAsset"]}',
                        "min_notional": min_notional,
                    }
                )
        pairs.sort(key=lambda item: item["base_asset"])
        return pairs

    def get_min_notional(self, symbol_code: str, fallback: float = MIN_TRADE_NOTIONAL) -> float:
        payload = self._get_exchange_info()
        for symbol in payload.get("symbols", []):
            if symbol.get("symbol") == symbol_code:
                return self._extract_min_notional(symbol, fallback=fallback)
        return fallback

    def _extract_min_notional(self, symbol: Dict[str, object], fallback: float = MIN_TRADE_NOTIONAL) -> float:
        for item in symbol.get("filters", []):
            if item.get("filterType") == "NOTIONAL" and item.get("minNotional"):
                return float(item["minNotional"])
            if item.get("filterType") == "MIN_NOTIONAL" and item.get("minNotional"):
                return float(item["minNotional"])
        return fallback

    def get_klines(
        self,
        symbol: str,
        interval: str = DEFAULT_KLINE_INTERVAL,
        limit: int = DEFAULT_KLINE_LIMIT,
    ) -> List[Dict[str, float]]:
        request_limit = max(1, min(int(limit) + 1, 1000))
        try:
            payload = self._get(
                "/api/v3/klines",
                symbol=symbol,
                interval=interval,
                limit=request_limit,
            )
        except requests.RequestException as exc:
            raise MarketDataError(f"Nao foi possivel carregar candles para {symbol}.") from exc

        now_ms = int(time.time() * 1000)
        candles = [
            {
                "open_time": item[0],
                "open": float(item[1]),
                "high": float(item[2]),
                "low": float(item[3]),
                "close": float(item[4]),
                "volume": float(item[5]),
                "close_time": item[6],
            }
            for item in payload
        ]
        closed_candles = [item for item in candles if int(item["close_time"]) <= now_ms]
        if len(closed_candles) >= limit:
            return closed_candles[-limit:]
        return candles[-limit:]

    def get_last_prices(self, symbols: List[str]) -> Dict[str, float]:
        if not symbols:
            return {}
        try:
            payload = self._get("/api/v3/ticker/24hr", symbols=str(symbols).replace("'", '"'))
        except requests.RequestException as exc:
            raise MarketDataError("Nao foi possivel carregar os ultimos precos.") from exc

        if isinstance(payload, dict):
            payload = [payload]
        return {item["symbol"]: float(item["lastPrice"]) for item in payload}
