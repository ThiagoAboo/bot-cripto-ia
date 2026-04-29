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

    def test_prioritize_candidates_for_portfolio_prefers_buy_candidates_when_flat(self) -> None:
        candidates = [
            ({"pair": "BTC/USDT", "action": "sell", "confidence": 82}, False, "analysis"),
            ({"pair": "ETH/USDT", "action": "buy", "confidence": 61}, False, "analysis"),
            ({"pair": "SOL/USDT", "action": "buy", "confidence": 74}, False, "analysis"),
        ]

        ordered = runtime.prioritize_candidates_for_portfolio(candidates, open_positions=[])

        self.assertEqual("SOL/USDT", ordered[0][0]["pair"])
        self.assertEqual("ETH/USDT", ordered[1][0]["pair"])
        self.assertEqual("BTC/USDT", ordered[2][0]["pair"])

    def test_analyze_scalper_accepts_supportive_microstructure_without_requiring_perfection(self) -> None:
        snapshot = {
            "currentPrice": 101.25,
            "volume24h": 150000.0,
            "candlesByPeriod": {
                "1m": make_candles([100.0, 100.2, 100.35, 100.55, 100.8, 101.25]),
            },
            "orderbook": {
                "bids": [(101.23, 9.0), (101.22, 7.0), (101.2, 4.0)],
                "asks": [(101.27, 5.0), (101.29, 4.0), (101.3, 3.0)],
            },
        }

        insight = runtime.analyze_scalper(snapshot, {
            "minVolume": 120000,
            "maxSpreadPercent": 0.08,
            "microMomentumThresholdPercent": 0.03,
            "orderImbalanceThreshold": 0.54,
        })

        self.assertEqual("buy", insight["action"])
        self.assertGreaterEqual(insight["confidence"], 55)

    def test_merge_scalper_runtime_analyses_promotes_heuristic_signal_when_model_is_neutral(self) -> None:
        model_analysis = {
            "primarySpecialist": "python_model",
            "opportunities": [{
                "pair": "BTC/USDT",
                "action": "hold",
                "confidence": 61,
                "price": 100.0,
                "reason": "Model stayed neutral",
                "specialists": [],
            }],
            "bestOpportunity": None,
            "summary": {
                "analyzedPairs": 1,
                "actionablePairs": 0,
                "buySignals": 0,
                "sellSignals": 0,
                "holdSignals": 1,
            },
        }
        heuristic_analysis = {
            "primarySpecialist": "scalper",
            "opportunities": [{
                "pair": "BTC/USDT",
                "action": "buy",
                "confidence": 63,
                "price": 100.0,
                "reason": "Bid pressure supported a quick scalp",
                "specialists": [],
            }],
            "bestOpportunity": {
                "pair": "BTC/USDT",
                "action": "buy",
                "confidence": 63,
                "price": 100.0,
                "reason": "Bid pressure supported a quick scalp",
                "specialists": [],
            },
            "summary": {
                "analyzedPairs": 1,
                "actionablePairs": 1,
                "buySignals": 1,
                "sellSignals": 0,
                "holdSignals": 0,
            },
        }

        merged = runtime.merge_scalper_runtime_analyses(model_analysis, heuristic_analysis)

        self.assertEqual("scalper_hybrid", merged["primarySpecialist"])
        self.assertIsNotNone(merged["bestOpportunity"])
        self.assertEqual("buy", merged["bestOpportunity"]["action"])
        self.assertGreaterEqual(merged["bestOpportunity"]["confidence"], 56)

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
