from __future__ import annotations

import pathlib
import sys
import unittest
from unittest import mock


TESTS_DIR = pathlib.Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_support import ensure_python_path, make_candles

ensure_python_path()

import runtime


class RuntimeTests(unittest.TestCase):
    def test_build_candidate_pairs_prioritizes_focus_social_and_allowed_pairs(self) -> None:
        pairs = runtime.build_candidate_pairs(
            allowed_pairs=["BTCUSDT", "ETHUSDT", "SOLUSDT"],
            focus_pair="ethusdt",
            social_signals=[
                {"pair": "solusdt"},
                {"pair": "btcusdt"},
                {"pair": "dogeusdt"},
            ],
            limit=None,
        )

        self.assertEqual(["ETHUSDT", "SOLUSDT", "BTCUSDT"], pairs)

    def test_calculate_rsi_handles_insufficient_data_and_only_gains(self) -> None:
        self.assertIsNone(runtime.calculate_rsi([100.0, 101.0, 102.0], period=14))
        self.assertEqual(100.0, runtime.calculate_rsi([float(100 + index) for index in range(16)], period=14))

    def test_build_orderbook_stats_computes_spread_and_imbalance(self) -> None:
        stats = runtime.build_orderbook_stats({
            "orderbook": {
                "bids": [(100.0, 2.0), (99.5, 1.0)],
                "asks": [(101.0, 1.0), (102.0, 3.0)],
            },
        })

        self.assertEqual(3.0, stats["bidLiquidity"])
        self.assertEqual(4.0, stats["askLiquidity"])
        self.assertAlmostEqual(100.5, stats["mid"])
        self.assertAlmostEqual((101.0 - 100.0) / 100.5, stats["spread"])
        self.assertAlmostEqual((3.0 - 4.0) / 7.0, stats["imbalance"])

    def test_apply_cycle_execution_limit_skips_extra_approved_plans(self) -> None:
        plans = [
            {"status": "execute", "reason": "first"},
            {"status": "suggested", "reason": "second"},
            {"status": "skipped", "reason": "third"},
            {"status": "execute", "reason": "fourth"},
        ]

        limited = runtime.apply_cycle_execution_limit(plans, 2)

        self.assertEqual("execute", limited[0]["status"])
        self.assertEqual("suggested", limited[1]["status"])
        self.assertEqual("skipped", limited[2]["status"])
        self.assertEqual("skipped", limited[3]["status"])
        self.assertEqual("Limite de 2 oportunidades por ciclo atingido", limited[3]["reason"])

    def test_build_trade_plan_creates_buy_quantity_for_paper_mode(self) -> None:
        cycle = {
            "executionMode": "paper",
            "balances": [{"currency": "USDT", "available": 500.0}],
            "maxTradeAmount": 200.0,
            "maxTradeAmountUnit": "USDT",
            "riskConfig": {},
        }
        opportunity = {
            "pair": "BTC/USDT",
            "action": "buy",
            "price": 100.0,
        }

        plan = runtime.build_trade_plan(cycle, opportunity, snapshot={"primaryCandles": make_candles([95, 97, 99, 100, 101, 102, 103, 104])})

        self.assertTrue(plan["shouldExecute"])
        self.assertEqual(2.0, plan["quantity"])
        self.assertTrue(str(plan["reason"]).lower().startswith("plano de compra"))

    def test_evaluate_cycle_candidate_blocks_full_auto_buy_when_backend_reports_reason(self) -> None:
        cycle = {
            "executionMode": "full_auto",
            "fullAutoBuyBlockReason": "Champion ainda em paper",
            "minimumConfidence": 50,
            "recentExecutions": [],
        }
        opportunity = {
            "pair": "BTC/USDT",
            "action": "buy",
            "confidence": 88,
            "price": 100.0,
        }

        with mock.patch.object(runtime, "is_in_cooldown", return_value=False):
            plan = runtime.evaluate_cycle_candidate(
                backend={},
                bot={},
                cycle=cycle,
                market_snapshots=[],
                open_positions=[],
                opportunity=opportunity,
                is_risk_override=False,
                source="analysis",
                rank=1,
            )

        self.assertEqual("skipped", plan["status"])
        self.assertEqual("Champion ainda em paper", plan["reason"])
        self.assertEqual("BTC/USDT", plan["pair"])


if __name__ == "__main__":
    unittest.main()
