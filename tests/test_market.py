from unittest.mock import patch
import unittest

from trading_app.market import BinanceMarketClient


class FakeMarketClient(BinanceMarketClient):
    def __init__(self, payload):
        self.payload = payload
        self.last_params = None

    def _get(self, path: str, **params):
        self.last_params = params
        return self.payload


class MarketClientTestCase(unittest.TestCase):
    def test_get_klines_drops_open_candle_and_preserves_limit(self) -> None:
        now_ms = 1_700_000_000_000
        payload = [
            [now_ms - 180_000, "100", "101", "99", "100.5", "1000", now_ms - 120_001],
            [now_ms - 120_000, "100.5", "101.2", "100", "101", "1100", now_ms - 60_001],
            [now_ms - 60_000, "101", "101.5", "100.8", "101.1", "5", now_ms + 59_999],
        ]
        client = FakeMarketClient(payload)

        with patch("trading_app.market.time.time", return_value=now_ms / 1000):
            candles = client.get_klines("BTCBRL", interval="1m", limit=2)

        self.assertEqual(client.last_params["limit"], 3)
        self.assertEqual(len(candles), 2)
        self.assertEqual(candles[-1]["close"], 101.0)
        self.assertLessEqual(candles[-1]["close_time"], now_ms)


if __name__ == "__main__":
    unittest.main()
