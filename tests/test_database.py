from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from trading_app.database import Database


class DatabaseTestCase(unittest.TestCase):
    def test_reset_and_persist_trade_data(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1200.0,
                quote_asset="BRL",
                fee_rate=0.00075,
                selected_symbols=["BTCBRL", "ETHBRL"],
                poll_seconds=30,
                trade_size_fraction=0.2,
                time_exit_enabled=False,
                primary_kline_interval="3m",
                primary_kline_limit=180,
                confirm_kline_interval="15m",
                confirm_kline_limit=200,
                reversal_kline_interval="30m",
                reversal_kline_limit=140,
                learning_horizon_cycles=9,
                learning_warmup_cycles=55,
                max_open_positions=7,
                buy_threshold=1.15,
                sell_threshold=-0.8,
                take_profit_ratio=0.012,
                stop_loss_ratio=-0.009,
                max_position_age_minutes=180,
                min_trade_notional=35.0,
                max_primary_volatility=0.021,
                max_direction_flip_ratio=0.41,
                min_volume_ratio=1.2,
                min_candle_body_ratio=0.33,
                entry_rsi_limit=74.0,
                entry_signal_quality_min=0.51,
                range_entry_signal_quality_min=0.6,
                entry_confirm_trend_min=-0.0004,
                entry_confirm_momentum_min=-0.0022,
                breakout_score_delta=0.31,
                breakout_trend_fast_min=0.0005,
                breakout_confirm_trend_min=-0.0002,
                breakout_momentum_15_min=0.0038,
                breakout_volume_ratio_min=1.04,
                breakout_close_location_min=0.68,
                trend_cont_score_delta=0.24,
                trend_cont_signal_quality_min=0.58,
                trend_cont_confirm_trend_min=0.0004,
                trend_cont_volume_ratio_min=0.96,
                reversal_score_floor=0.61,
                reversal_confirm_trend_floor=-0.0011,
                reversal_rsi_15m_max=51.0,
                reversal_rsi_1m_min=49.0,
                reversal_rsi_1m_max=63.0,
                reversal_lower_wick_min=0.37,
                reversal_close_location_min=0.73,
                reversal_distance_from_low_max=0.011,
                reversal_volume_ratio_min=1.07,
                reversal_swing_window=11,
                cooldown_after_loss_cycles=17,
                min_weakness_exit_age_minutes=7.5,
                strategy_profile="agressivo",
                cycle_history_limit=250,
            )

            database.upsert_position(
                symbol="BTCBRL",
                quantity=2.5,
                avg_price=650000.0,
                opened_at="2026-01-01T00:00:00+00:00",
                last_decision="teste",
                cost_basis=1625000.0,
            )
            database.add_decision(
                symbol="BTCBRL",
                action="buy",
                score=1.12,
                confidence=0.73,
                price=650000.0,
                features={"momentum_5": 0.01, "regime": "trend"},
                rationale="teste",
                executed=True,
                execution_note="ok",
            )
            database.add_transaction(
                symbol="BTCBRL",
                side="buy",
                price=650000.0,
                quantity=2.5,
                gross_value=1623780.0,
                fee=1218.0,
                net_value=1624998.0,
                realized_pnl=0,
                balance_after=1200.0,
                rationale="teste",
            )

            settings = database.get_settings()
            portfolio = database.get_portfolio()
            positions = database.list_positions()
            decisions = database.list_decisions()
            transactions = database.list_transactions()

            self.assertEqual(settings["selected_symbols"], ["BTCBRL", "ETHBRL"])
            self.assertEqual(settings["quote_asset"], "BRL")
            self.assertEqual(settings["fee_rate"], 0.00075)
            self.assertFalse(settings["time_exit_enabled"])
            self.assertEqual(settings["primary_kline_interval"], "3m")
            self.assertEqual(settings["primary_kline_limit"], 180)
            self.assertEqual(settings["confirm_kline_interval"], "15m")
            self.assertEqual(settings["confirm_kline_limit"], 200)
            self.assertEqual(settings["reversal_kline_interval"], "30m")
            self.assertEqual(settings["reversal_kline_limit"], 140)
            self.assertEqual(settings["learning_horizon_cycles"], 9)
            self.assertEqual(settings["learning_warmup_cycles"], 55)
            self.assertEqual(settings["max_open_positions"], 7)
            self.assertEqual(settings["buy_threshold"], 1.15)
            self.assertEqual(settings["sell_threshold"], -0.8)
            self.assertEqual(settings["take_profit_ratio"], 0.012)
            self.assertEqual(settings["stop_loss_ratio"], -0.009)
            self.assertEqual(settings["max_position_age_minutes"], 180)
            self.assertEqual(settings["min_trade_notional"], 35.0)
            self.assertEqual(settings["max_primary_volatility"], 0.021)
            self.assertEqual(settings["max_direction_flip_ratio"], 0.41)
            self.assertEqual(settings["min_volume_ratio"], 1.2)
            self.assertEqual(settings["min_candle_body_ratio"], 0.33)
            self.assertEqual(settings["entry_rsi_limit"], 74.0)
            self.assertEqual(settings["entry_signal_quality_min"], 0.51)
            self.assertEqual(settings["range_entry_signal_quality_min"], 0.6)
            self.assertEqual(settings["entry_confirm_trend_min"], -0.0004)
            self.assertEqual(settings["entry_confirm_momentum_min"], -0.0022)
            self.assertEqual(settings["breakout_score_delta"], 0.31)
            self.assertEqual(settings["breakout_trend_fast_min"], 0.0005)
            self.assertEqual(settings["breakout_confirm_trend_min"], -0.0002)
            self.assertEqual(settings["breakout_momentum_15_min"], 0.0038)
            self.assertEqual(settings["breakout_volume_ratio_min"], 1.04)
            self.assertEqual(settings["breakout_close_location_min"], 0.68)
            self.assertEqual(settings["trend_cont_score_delta"], 0.24)
            self.assertEqual(settings["trend_cont_signal_quality_min"], 0.58)
            self.assertEqual(settings["trend_cont_confirm_trend_min"], 0.0004)
            self.assertEqual(settings["trend_cont_volume_ratio_min"], 0.96)
            self.assertEqual(settings["reversal_score_floor"], 0.61)
            self.assertEqual(settings["reversal_confirm_trend_floor"], -0.0011)
            self.assertEqual(settings["reversal_rsi_15m_max"], 51.0)
            self.assertEqual(settings["reversal_rsi_1m_min"], 49.0)
            self.assertEqual(settings["reversal_rsi_1m_max"], 63.0)
            self.assertEqual(settings["reversal_lower_wick_min"], 0.37)
            self.assertEqual(settings["reversal_close_location_min"], 0.73)
            self.assertEqual(settings["reversal_distance_from_low_max"], 0.011)
            self.assertEqual(settings["reversal_volume_ratio_min"], 1.07)
            self.assertEqual(settings["reversal_swing_window"], 11)
            self.assertEqual(settings["cooldown_after_loss_cycles"], 17)
            self.assertEqual(settings["min_weakness_exit_age_minutes"], 7.5)
            self.assertEqual(settings["strategy_profile"], "agressivo")
            self.assertEqual(settings["cycle_history_limit"], 250)
            self.assertEqual(portfolio["initial_capital"], 1200.0)
            self.assertEqual(len(positions), 1)
            self.assertEqual(positions[0]["symbol"], "BTCBRL")
            self.assertEqual(len(decisions), 1)
            self.assertEqual(decisions[0]["features"]["momentum_5"], 0.01)
            self.assertEqual(decisions[0]["features"]["regime"], "trend")
            self.assertEqual(len(transactions), 1)

    def test_reconcile_restores_cash_when_no_transactions_exist(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=10000.0,
                selected_symbols=["BTCBRL"],
                poll_seconds=15,
                trade_size_fraction=0.07,
            )

            database.update_cash_balance(cash_balance=9299.475, realized_pnl=0.0)
            repaired = database.reconcile_portfolio_with_transactions()

            self.assertEqual(repaired["cash_balance"], 10000.0)
            self.assertEqual(repaired["realized_pnl"], 0.0)

    def test_record_buy_updates_cash_position_and_transaction_atomically(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                selected_symbols=["BTCBRL"],
                poll_seconds=15,
                trade_size_fraction=0.1,
            )

            updated_portfolio = database.record_buy(
                symbol="BTCBRL",
                quantity=0.001,
                avg_price=500000.0,
                opened_at="2026-01-01T00:00:00+00:00",
                last_decision="teste",
                cost_basis=500.375,
                gross_value=500.0,
                fee=0.375,
                rationale="teste",
            )

            self.assertEqual(updated_portfolio["cash_balance"], 499.625)
            self.assertEqual(len(database.list_positions()), 1)
            self.assertEqual(len(database.list_transactions()), 1)

    def test_reset_preserves_learning_state_and_cycle_history(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=2000.0,
                quote_asset="BRL",
                fee_rate=0.00075,
                selected_symbols=["BTCBRL", "ETHBRL"],
                poll_seconds=20,
                trade_size_fraction=0.15,
                time_exit_enabled=False,
                cycle_history_limit=320,
            )
            database.upsert_learning_state(
                {
                    "symbol": "BTCBRL",
                    "cycle_count": 41,
                    "resolved_count": 33,
                    "accuracy_ewma": 0.74,
                    "edge_ewma": 0.0014,
                    "smoothed_confidence": 0.67,
                    "last_regime": "trend",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            )
            database.add_cycle_snapshot(
                symbol="BTCBRL",
                cycle_index=41,
                price=510000.0,
                action="buy",
                score=1.24,
                confidence_raw=0.58,
                confidence_stable=0.69,
                regime="trend",
                features={"regime": "trend", "confidence_raw": 0.58},
            )
            database.add_transaction(
                symbol="BTCBRL",
                side="buy",
                price=510000.0,
                quantity=0.001,
                gross_value=510.0,
                fee=0.3825,
                net_value=510.3825,
                realized_pnl=0.0,
                balance_after=1489.6175,
                rationale="teste",
            )

            database.reset_simulation(
                initial_capital=1500.0,
                quote_asset="BRL",
                fee_rate=0.00075,
                selected_symbols=["BTCBRL"],
                poll_seconds=12,
                trade_size_fraction=0.12,
                time_exit_enabled=False,
                cycle_history_limit=180,
            )

            settings = database.get_settings()
            learning_state = database.get_learning_state("BTCBRL")
            summary = database.get_learning_summary()

            self.assertEqual(settings["cycle_history_limit"], 180)
            self.assertEqual(learning_state["cycle_count"], 41)
            self.assertEqual(learning_state["resolved_count"], 33)
            self.assertAlmostEqual(learning_state["accuracy_ewma"], 0.74)
            self.assertEqual(len(database.list_transactions()), 0)
            self.assertEqual(len(database.list_positions()), 0)
            self.assertEqual(summary["total_snapshots"], 1)
            self.assertEqual(summary["warmed_symbols"], 1)

    def test_learning_summary_uses_custom_warmup_threshold(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.upsert_learning_state(
                {
                    "symbol": "BTCBRL",
                    "cycle_count": 18,
                    "resolved_count": 18,
                    "accuracy_ewma": 0.66,
                    "edge_ewma": 0.0012,
                    "smoothed_confidence": 0.57,
                    "last_regime": "trend",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            )

            default_summary = database.get_learning_summary()
            custom_summary = database.get_learning_summary(15)

            self.assertEqual(default_summary["warmed_symbols"], 0)
            self.assertEqual(custom_summary["warmed_symbols"], 1)

    def test_update_initial_capital_reference_preserves_cash_after_activity(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                selected_symbols=["BTCBRL"],
                poll_seconds=15,
                trade_size_fraction=0.1,
            )
            database.record_buy(
                symbol="BTCBRL",
                quantity=0.001,
                avg_price=500000.0,
                opened_at="2026-01-01T00:00:00+00:00",
                last_decision="teste",
                cost_basis=500.375,
                gross_value=500.0,
                fee=0.375,
                rationale="teste",
            )

            database.update_initial_capital_reference(2500.0)
            portfolio = database.get_portfolio()

            self.assertEqual(portfolio["initial_capital"], 2500.0)
            self.assertEqual(portfolio["cash_balance"], 499.625)
            self.assertEqual(portfolio["realized_pnl"], 0.0)

    def test_clear_learning_state_removes_persistent_history_only(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                selected_symbols=["BTCBRL"],
                poll_seconds=15,
                trade_size_fraction=0.1,
            )
            database.upsert_learning_state(
                {
                    "symbol": "BTCBRL",
                    "cycle_count": 8,
                    "resolved_count": 6,
                    "accuracy_ewma": 0.63,
                    "edge_ewma": 0.0008,
                    "smoothed_confidence": 0.49,
                    "last_regime": "range",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            )
            database.add_cycle_snapshot(
                symbol="BTCBRL",
                cycle_index=8,
                price=500000.0,
                action="hold",
                score=0.15,
                confidence_raw=0.31,
                confidence_stable=0.44,
                regime="range",
                features={"regime": "range"},
            )
            database.add_transaction(
                symbol="BTCBRL",
                side="buy",
                price=500000.0,
                quantity=0.001,
                gross_value=500.0,
                fee=0.375,
                net_value=500.375,
                realized_pnl=0.0,
                balance_after=499.625,
                rationale="teste",
            )

            database.clear_learning_state()

            summary = database.get_learning_summary()
            transactions = database.list_transactions()

            self.assertEqual(summary["total_snapshots"], 0)
            self.assertEqual(summary["total_symbols"], 0)
            self.assertEqual(len(transactions), 1)

    def test_reset_can_clear_learning_when_market_context_changes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "sim.db"
            database = Database(db_path=db_path)
            database.reset_simulation(
                initial_capital=1000.0,
                quote_asset="BRL",
                fee_rate=0.00075,
                selected_symbols=["BTCBRL"],
                poll_seconds=20,
                trade_size_fraction=0.15,
                time_exit_enabled=False,
                cycle_history_limit=200,
            )
            database.upsert_learning_state(
                {
                    "symbol": "BTCBRL",
                    "cycle_count": 10,
                    "resolved_count": 8,
                    "accuracy_ewma": 0.69,
                    "edge_ewma": 0.001,
                    "smoothed_confidence": 0.52,
                    "last_regime": "range",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            )
            database.add_cycle_snapshot(
                symbol="BTCBRL",
                cycle_index=10,
                price=500000.0,
                action="hold",
                score=0.15,
                confidence_raw=0.31,
                confidence_stable=0.44,
                regime="range",
                features={"regime": "range"},
            )

            database.reset_simulation(
                initial_capital=2500.0,
                quote_asset="USDT",
                fee_rate=0.001,
                selected_symbols=["BTCUSDT"],
                poll_seconds=15,
                trade_size_fraction=0.25,
                time_exit_enabled=True,
                cycle_history_limit=220,
                clear_learning=True,
            )

            settings = database.get_settings()
            summary = database.get_learning_summary()
            learning_state = database.get_learning_state("BTCUSDT")

            self.assertEqual(settings["quote_asset"], "USDT")
            self.assertEqual(settings["fee_rate"], 0.001)
            self.assertTrue(settings["time_exit_enabled"])
            self.assertEqual(settings["selected_symbols"], ["BTCUSDT"])
            self.assertEqual(summary["total_snapshots"], 0)
            self.assertEqual(summary["total_symbols"], 0)
            self.assertEqual(learning_state["cycle_count"], 0)
            self.assertEqual(learning_state["resolved_count"], 0)


if __name__ == "__main__":
    unittest.main()
