from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from trading_app.database import Database
from trading_app.simulator import TradingSimulator
from trading_app.strategy import Decision


def build_klines(price: float, count: int = 120):
    candles = []
    start = 1_700_000_000_000
    for index in range(count):
        candles.append(
            {
                "open_time": start + index * 60_000,
                "open": price,
                "high": price * 1.001,
                "low": price * 0.999,
                "close": price,
                "volume": 1000.0 + index,
                "close_time": start + (index + 1) * 60_000 - 1,
            }
        )
    return candles


class FakeMarketClient:
    def get_klines(self, symbol: str, interval: str, limit: int):
        return build_klines(100.0, count=limit)

    def get_last_prices(self, symbols):
        return {symbol: 100.0 for symbol in symbols}

    def get_min_notional(self, symbol: str, fallback: float = 20.0) -> float:
        return 10.0


class FakeStrategy:
    def build_decision(self, **kwargs):
        return Decision(
            action="buy",
            score=1.15,
            confidence=0.84,
            price=100.0,
            features={"confidence_raw": 0.78, "confidence_stable": 0.84, "regime": "trend"},
            rationale="teste",
        )


class SimulatorTestCase(unittest.TestCase):
    def test_run_cycle_uses_configured_fee_rate_for_buys(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                quote_asset="USDT",
                fee_rate=0.01,
                selected_symbols=["BTCUSDT"],
                poll_seconds=20,
                trade_size_fraction=0.1,
                cycle_history_limit=120,
            )
            simulator = TradingSimulator(database, FakeMarketClient(), FakeStrategy())

            simulator.run_cycle()

            transactions = database.list_transactions()
            self.assertEqual(len(transactions), 1)
            self.assertAlmostEqual(transactions[0]["gross_value"], 100.0)
            self.assertAlmostEqual(transactions[0]["fee"], 1.0)
            self.assertAlmostEqual(transactions[0]["net_value"], 101.0)

    def test_calculate_metrics_lists_all_selected_symbols_with_total_pnl(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                quote_asset="USDT",
                fee_rate=0.01,
                selected_symbols=["BTCUSDT", "ETHUSDT"],
                poll_seconds=20,
                trade_size_fraction=0.1,
                cycle_history_limit=120,
            )
            database.record_buy(
                symbol="BTCUSDT",
                quantity=2.0,
                avg_price=100.0,
                opened_at="2026-01-01T00:00:00+00:00",
                last_decision="teste",
                cost_basis=202.0,
                gross_value=200.0,
                fee=2.0,
                rationale="teste",
            )
            database.record_buy(
                symbol="ETHUSDT",
                quantity=2.0,
                avg_price=50.0,
                opened_at="2026-01-01T00:05:00+00:00",
                last_decision="teste",
                cost_basis=101.0,
                gross_value=100.0,
                fee=1.0,
                rationale="teste",
            )
            database.record_sell(
                symbol="ETHUSDT",
                quantity=2.0,
                price=60.0,
                gross_value=120.0,
                fee=1.2,
                net_value=118.8,
                realized_pnl=17.8,
                rationale="teste",
            )

            simulator = TradingSimulator(database, FakeMarketClient(), FakeStrategy())
            metrics = simulator.calculate_metrics(last_prices={"BTCUSDT": 110.0, "ETHUSDT": 61.0})

            self.assertEqual(len(metrics["positions"]), 2)
            self.assertEqual(metrics["positions"][0]["symbol"], "BTCUSDT")
            self.assertEqual(metrics["positions"][1]["symbol"], "ETHUSDT")
            rows = {item["symbol"]: item for item in metrics["positions"]}

            self.assertEqual(rows["BTCUSDT"]["quantity"], 2.0)
            self.assertEqual(rows["BTCUSDT"]["buy_price"], 100.0)
            self.assertEqual(rows["BTCUSDT"]["sell_price"], 110.0)
            self.assertAlmostEqual(rows["BTCUSDT"]["realized_pnl"], 0.0)
            self.assertAlmostEqual(rows["BTCUSDT"]["unrealized_pnl"], 18.0)
            self.assertAlmostEqual(rows["BTCUSDT"]["total_pnl"], 18.0)

            self.assertEqual(rows["ETHUSDT"]["quantity"], 0.0)
            self.assertEqual(rows["ETHUSDT"]["buy_price"], 50.0)
            self.assertEqual(rows["ETHUSDT"]["sell_price"], 60.0)
            self.assertAlmostEqual(rows["ETHUSDT"]["realized_pnl"], 17.8)
            self.assertEqual(rows["ETHUSDT"]["unrealized_pnl"], 0.0)
            self.assertAlmostEqual(rows["ETHUSDT"]["total_pnl"], 17.8)

    def test_cooldown_blocks_reentry_after_bad_exit(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                quote_asset="USDT",
                fee_rate=0.001,
                selected_symbols=["BTCUSDT"],
                poll_seconds=20,
                trade_size_fraction=0.1,
                cycle_history_limit=120,
                cooldown_after_loss_cycles=20,
            )
            database.upsert_learning_state(
                {
                    "symbol": "BTCUSDT",
                    "cycle_count": 5,
                    "resolved_count": 5,
                    "accuracy_ewma": 0.6,
                    "edge_ewma": 0.0,
                    "smoothed_confidence": 0.4,
                    "cooldown_until_cycle": 10,
                    "last_exit_reason": "mercado entrou em chop apos a entrada",
                    "last_regime": "chop",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            )

            simulator = TradingSimulator(database, FakeMarketClient(), FakeStrategy())
            simulator.run_cycle()

            self.assertEqual(len(database.list_transactions()), 0)
            decisions = database.list_decisions()
            self.assertEqual(len(decisions), 1)
            self.assertEqual(decisions[0]["action"], "hold")
            self.assertEqual(decisions[0]["features"]["blocked_action"], "buy")
            self.assertTrue(decisions[0]["features"]["cooldown_active"])
            self.assertIn("cooldown", decisions[0]["rationale"])


if __name__ == "__main__":
    unittest.main()
