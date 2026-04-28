from datetime import datetime, timedelta, timezone
from math import sin
import unittest

from trading_app.strategy import MicroTradeStrategy


def build_klines(prices, base_volume=1000.0, volume_step=10.0, last_volume_boost=1.0):
    candles = []
    start = 1_700_000_000_000
    for index, price in enumerate(prices):
        open_price = prices[index - 1] if index > 0 else price * 0.998
        volume = base_volume + index * volume_step
        if index == len(prices) - 1:
            volume *= last_volume_boost
        candles.append(
            {
                "open_time": start + index * 60_000,
                "open": open_price,
                "high": max(open_price, price) * 1.001,
                "low": min(open_price, price) * 0.999,
                "close": price,
                "volume": volume,
                "close_time": start + (index + 1) * 60_000 - 1,
            }
        )
    return candles


class StrategyTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.strategy = MicroTradeStrategy()

    def test_generates_buy_signal_for_consistent_uptrend(self) -> None:
        primary_prices = [0.0100 + index * 0.00005 for index in range(120)]
        confirm_prices = [0.0100 + index * 0.00012 for index in range(120)]
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices),
            confirm_klines=build_klines(confirm_prices),
            existing_position=None,
        )

        self.assertEqual(decision.action, "buy")
        self.assertGreater(decision.score, 0.8)
        self.assertEqual(decision.features["regime"], "trend")

    def test_generates_sell_signal_for_open_position_with_strong_drawdown(self) -> None:
        prices = [0.016 - index * 0.00006 for index in range(120)]
        position = {
            "avg_price": 0.0162,
            "opened_at": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(),
        }
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(prices, base_volume=950.0),
            confirm_klines=build_klines([0.016 - index * 0.00009 for index in range(120)], base_volume=900.0),
            existing_position=position,
        )

        self.assertEqual(decision.action, "sell")
        self.assertLess(decision.score, 0.2)

    def test_holds_when_there_is_not_enough_history(self) -> None:
        prices = [0.01 + index * 0.0001 for index in range(20)]
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(prices),
            confirm_klines=build_klines(prices),
            existing_position=None,
        )

        self.assertEqual(decision.action, "hold")
        self.assertEqual(decision.features["primary_candles_available"], 20)

    def test_blocks_buy_when_higher_timeframe_disagrees(self) -> None:
        primary_prices = [0.0100 + index * 0.00005 for index in range(120)]
        confirm_prices = [0.0200 - index * 0.00004 for index in range(120)]
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1600.0),
            confirm_klines=build_klines(confirm_prices, base_volume=900.0),
            existing_position=None,
        )

        self.assertEqual(decision.action, "hold")
        self.assertIn("5m", decision.rationale)

    def test_relaxed_alignment_threshold_can_unlock_buy(self) -> None:
        primary_prices = [10 + index * 0.03 + sin(index / 5) * 0.015 for index in range(120)]
        confirm_prices = [10.9 - index * 0.0018 + sin(index / 6) * 0.004 for index in range(120)]

        baseline = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1500.0),
            confirm_klines=build_klines(confirm_prices, base_volume=980.0),
            existing_position=None,
        )
        relaxed = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1500.0),
            confirm_klines=build_klines(confirm_prices, base_volume=980.0),
            existing_position=None,
            strategy_settings={
                "buy_threshold": 0.35,
                "entry_rsi_limit": 101.0,
                "entry_signal_quality_min": 0.2,
                "entry_confirm_trend_min": -0.01,
                "entry_confirm_momentum_min": -0.02,
                "min_volume_ratio": 0.5,
                "min_candle_body_ratio": 0.05,
                "max_primary_volatility": 1.0,
                "max_direction_flip_ratio": 1.0,
            },
        )

        self.assertEqual(baseline.action, "hold")
        self.assertEqual(relaxed.action, "buy")
        self.assertIn("alinhamento 1m/5m", relaxed.rationale)

    def test_standard_entry_is_blocked_when_regime_is_chop(self) -> None:
        primary_prices = [100 + index * 0.08 + sin(index * 1.9) * 0.75 for index in range(120)]
        confirm_prices = [100 + index * 0.05 + sin(index / 5) * 0.08 for index in range(120)]

        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1500.0),
            confirm_klines=build_klines(confirm_prices, base_volume=1100.0),
            existing_position=None,
            strategy_settings={
                "buy_threshold": 0.3,
                "entry_rsi_limit": 101.0,
                "entry_signal_quality_min": 0.0,
                "entry_confirm_trend_min": -0.02,
                "entry_confirm_momentum_min": -0.02,
                "min_volume_ratio": 0.5,
                "min_candle_body_ratio": 0.0,
                "max_primary_volatility": 1.0,
                "max_direction_flip_ratio": 1.0,
                "breakout_score_delta": 99.0,
                "trend_cont_score_delta": 99.0,
            },
        )

        self.assertEqual(decision.features["regime"], "chop")
        self.assertEqual(decision.action, "hold")
        self.assertFalse(decision.features["standard_entry_allowed"])
        self.assertIn("regime chop", decision.rationale)

    def test_relaxed_breakout_threshold_can_unlock_buy(self) -> None:
        primary_prices = [100 + index * 0.03 for index in range(120)]
        confirm_prices = [100 + index * 0.04 for index in range(120)]

        baseline = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(
                primary_prices,
                base_volume=1200.0,
                last_volume_boost=1.35,
            ),
            confirm_klines=build_klines(confirm_prices, base_volume=1100.0),
            existing_position=None,
        )
        relaxed = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(
                primary_prices,
                base_volume=1200.0,
                last_volume_boost=1.35,
            ),
            confirm_klines=build_klines(confirm_prices, base_volume=1100.0),
            existing_position=None,
            strategy_settings={
                "buy_threshold": 0.45,
                "entry_rsi_limit": 60.0,
                "entry_signal_quality_min": 0.8,
                "breakout_score_delta": 0.2,
                "breakout_trend_fast_min": 0.0,
                "breakout_confirm_trend_min": -0.001,
                "breakout_momentum_15_min": 0.002,
                "breakout_volume_ratio_min": 0.95,
                "breakout_close_location_min": 0.55,
                "min_volume_ratio": 0.5,
                "min_candle_body_ratio": 0.05,
                "max_primary_volatility": 1.0,
                "max_direction_flip_ratio": 1.0,
            },
        )

        self.assertEqual(baseline.action, "hold")
        self.assertEqual(relaxed.action, "buy")
        self.assertIn("breakout forte", relaxed.rationale)

    def test_learning_state_stabilizes_confidence_after_warmup(self) -> None:
        primary_prices = [0.01 + index * 0.000002 + sin(index / 4) * 0.00005 for index in range(120)]
        confirm_prices = [0.01 + index * 0.000003 + sin(index / 5) * 0.00004 for index in range(120)]

        baseline = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1200.0),
            confirm_klines=build_klines(confirm_prices, base_volume=1100.0),
            existing_position=None,
        )
        warmed = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1200.0),
            confirm_klines=build_klines(confirm_prices, base_volume=1100.0),
            existing_position=None,
            learning_state={
                "resolved_count": 40,
                "accuracy_ewma": 0.81,
                "edge_ewma": 0.0018,
                "smoothed_confidence": 0.76,
            },
        )

        self.assertAlmostEqual(
            baseline.confidence,
            baseline.features["confidence_raw"],
            places=4,
        )
        self.assertGreater(
            warmed.features["confidence_stable"],
            warmed.features["confidence_raw"],
        )
        self.assertGreater(warmed.confidence, baseline.confidence)
        self.assertEqual(warmed.features["learning_resolved_count"], 40)

    def test_time_exit_can_be_disabled(self) -> None:
        prices = [100 + ((index % 2) * 0.01) for index in range(120)]
        position = {
            "avg_price": 100.0,
            "quantity": 1.0,
            "cost_basis": 100.1,
            "opened_at": (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat(),
        }
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(prices, base_volume=1000.0),
            confirm_klines=build_klines(prices, base_volume=1000.0),
            existing_position=position,
            fee_rate=0.001,
            time_exit_enabled=False,
        )

        self.assertEqual(decision.action, "hold")
        self.assertIn("tempo desativada", decision.rationale)

    def test_time_exit_waits_for_break_even_after_fees(self) -> None:
        prices = [100 + ((index % 2) * 0.01) for index in range(120)]
        position = {
            "avg_price": 100.0,
            "quantity": 1.0,
            "cost_basis": 100.15,
            "opened_at": (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat(),
        }
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(prices, base_volume=1000.0),
            confirm_klines=build_klines(prices, base_volume=1000.0),
            existing_position=position,
            fee_rate=0.001,
            time_exit_enabled=True,
        )

        self.assertEqual(decision.action, "hold")
        self.assertIn("break-even liquido", decision.rationale)
        self.assertIsNotNone(decision.features["break_even_price"])

    def test_take_profit_holds_when_trend_is_still_favorable(self) -> None:
        primary_prices = [100 + index * 0.35 for index in range(120)]
        confirm_prices = [100 + index * 0.5 for index in range(120)]
        position = {
            "avg_price": 138.0,
            "quantity": 1.0,
            "cost_basis": 138.2,
            "opened_at": (datetime.now(timezone.utc) - timedelta(minutes=12)).isoformat(),
        }
        decision = self.strategy.build_decision(
            symbol="TESTBRL",
            primary_klines=build_klines(primary_prices, base_volume=1200.0),
            confirm_klines=build_klines(confirm_prices, base_volume=1200.0),
            existing_position=position,
            fee_rate=0.001,
            time_exit_enabled=True,
        )

        self.assertEqual(decision.action, "hold")
        self.assertIn("continuidade favoravel", decision.rationale)


if __name__ == "__main__":
    unittest.main()
