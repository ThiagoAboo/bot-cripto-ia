from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Tuple

from .config import (
    MIN_TRADE_NOTIONAL,
)
from .database import Database, utc_now_iso
from .market import BinanceMarketClient, MarketDataError
from .strategy import Decision, MicroTradeStrategy, clamp


LOGGER = logging.getLogger(__name__)


class TradingSimulator:
    def __init__(
        self,
        database: Database,
        market_client: BinanceMarketClient,
        strategy: MicroTradeStrategy,
    ) -> None:
        self.database = database
        self.market_client = market_client
        self.strategy = strategy
        self._thread = None
        self._stop_event = threading.Event()
        self._cycle_lock = threading.Lock()
        self._last_cycle_finished_at = None
        self._last_prices: Dict[str, float] = {}

    def start_background(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="trading-simulator-loop",
            daemon=True,
        )
        self._thread.start()

    def stop_background(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def reset_runtime_state(self) -> None:
        with self._cycle_lock:
            self._last_prices = {}
            self._last_cycle_finished_at = None

    def _run_loop(self) -> None:
        next_run = 0.0
        while not self._stop_event.is_set():
            settings = self.database.get_settings()
            if not settings["running"]:
                time.sleep(1)
                continue

            now = time.time()
            if now >= next_run:
                try:
                    self.run_cycle()
                except Exception:
                    LOGGER.exception("Cycle execution failed.")
                next_run = now + max(5, settings["poll_seconds"])
            time.sleep(1)

    def _evaluate_learning_outcome(
        self,
        action: str,
        future_return: float,
        fee_rate: float,
    ) -> Tuple[float, float]:
        round_trip_cost = fee_rate * 2
        if action == "buy":
            net_edge = future_return - round_trip_cost
            outcome_score = clamp(0.5 + (net_edge / 0.012), 0.0, 1.0)
        elif action == "sell":
            net_edge = (-future_return) - round_trip_cost
            outcome_score = clamp(0.5 + (net_edge / 0.012), 0.0, 1.0)
        else:
            hold_band = 0.004
            net_edge = hold_band - abs(future_return)
            outcome_score = clamp(net_edge / hold_band, 0.0, 1.0)
        return outcome_score, net_edge

    def _resolve_learning_state(
        self,
        symbol: str,
        current_price: float,
        learning_state: Dict[str, Any],
        fee_rate: float,
        learning_horizon_cycles: int,
    ) -> Dict[str, Any]:
        current_cycle_index = int(learning_state["cycle_count"]) + 1
        max_cycle_index = current_cycle_index - max(1, learning_horizon_cycles)
        snapshots = self.database.list_resolvable_cycle_snapshots(symbol, max_cycle_index)
        if not snapshots:
            return learning_state

        resolved_count = int(learning_state["resolved_count"])
        accuracy_ewma = float(learning_state["accuracy_ewma"])
        edge_ewma = float(learning_state["edge_ewma"])

        for snapshot in snapshots:
            future_return = (current_price / snapshot["price"]) - 1 if snapshot["price"] else 0.0
            outcome_score, net_edge = self._evaluate_learning_outcome(
                snapshot["action"],
                future_return,
                fee_rate,
            )
            alpha = 0.22 if resolved_count < 10 else 0.14 if resolved_count < 30 else 0.08
            accuracy_ewma = ((1 - alpha) * accuracy_ewma) + (alpha * outcome_score)
            edge_ewma = ((1 - alpha) * edge_ewma) + (alpha * net_edge)
            resolved_count += 1
            self.database.resolve_cycle_snapshot(
                snapshot["id"],
                future_price=current_price,
                future_return=future_return,
                outcome_score=outcome_score,
                net_edge=net_edge,
            )

        learning_state["resolved_count"] = resolved_count
        learning_state["accuracy_ewma"] = round(accuracy_ewma, 6)
        learning_state["edge_ewma"] = round(edge_ewma, 6)
        learning_state["updated_at"] = utc_now_iso()
        self.database.upsert_learning_state(learning_state)
        return learning_state

    def _record_learning_snapshot(
        self,
        *,
        symbol: str,
        decision,
        learning_state: Dict[str, Any],
        cycle_history_limit: int,
    ) -> Dict[str, Any]:
        current_cycle_index = int(learning_state["cycle_count"]) + 1
        self.database.add_cycle_snapshot(
            symbol=symbol,
            cycle_index=current_cycle_index,
            price=decision.price,
            action=decision.action,
            score=decision.score,
            confidence_raw=float(decision.features.get("confidence_raw", decision.confidence)),
            confidence_stable=decision.confidence,
            regime=str(decision.features.get("regime", "unknown")),
            features=decision.features,
        )

        smoothing_alpha = 0.2 if int(learning_state["resolved_count"]) < 12 else 0.1
        learning_state["cycle_count"] = current_cycle_index
        learning_state["smoothed_confidence"] = round(
            clamp(
                (float(learning_state["smoothed_confidence"]) * (1 - smoothing_alpha))
                + (decision.confidence * smoothing_alpha),
                0.05,
                0.99,
            ),
            6,
        )
        learning_state["last_regime"] = str(decision.features.get("regime", "unknown"))
        learning_state["updated_at"] = utc_now_iso()
        self.database.upsert_learning_state(learning_state)
        self.database.prune_cycle_history(symbol, cycle_history_limit)
        return learning_state

    def run_cycle(self) -> None:
        if not self._cycle_lock.acquire(blocking=False):
            return
        try:
            settings = self.database.get_settings()
            selected_symbols = settings["selected_symbols"]
            fee_rate = settings["fee_rate"]
            time_exit_enabled = settings["time_exit_enabled"]
            primary_kline_interval = settings["primary_kline_interval"]
            primary_kline_limit = settings["primary_kline_limit"]
            confirm_kline_interval = settings["confirm_kline_interval"]
            confirm_kline_limit = settings["confirm_kline_limit"]
            reversal_kline_interval = settings["reversal_kline_interval"]
            reversal_kline_limit = settings["reversal_kline_limit"]
            learning_horizon_cycles = settings["learning_horizon_cycles"]
            max_open_positions = settings["max_open_positions"]
            min_trade_notional = settings["min_trade_notional"]
            cooldown_after_loss_cycles = settings["cooldown_after_loss_cycles"]
            if not selected_symbols:
                return

            portfolio = self.database.reconcile_portfolio_with_transactions()
            positions = {item["symbol"]: item for item in self.database.list_positions()}
            open_count = len(positions)
            last_prices: Dict[str, float] = {}

            for symbol in selected_symbols:
                try:
                    primary_klines = self.market_client.get_klines(
                        symbol,
                        interval=primary_kline_interval,
                        limit=primary_kline_limit,
                    )
                    confirm_klines = self.market_client.get_klines(
                        symbol,
                        interval=confirm_kline_interval,
                        limit=confirm_kline_limit,
                    )
                    reversal_klines = self.market_client.get_klines(
                        symbol,
                        interval=reversal_kline_interval,
                        limit=reversal_kline_limit,
                    )
                    current_price = primary_klines[-1]["close"] if primary_klines else 0.0

                    learning_state = self.database.get_learning_state(symbol)
                    learning_state = self._resolve_learning_state(
                        symbol,
                        current_price,
                        learning_state,
                        fee_rate,
                        learning_horizon_cycles,
                    )
                    current_position = positions.get(symbol)
                    current_cycle_index = int(learning_state["cycle_count"]) + 1
                    cooldown_until_cycle = int(learning_state.get("cooldown_until_cycle", 0) or 0)
                    cooldown_remaining = max(
                        0,
                        cooldown_until_cycle - current_cycle_index + 1,
                    )

                    decision = self.strategy.build_decision(
                        symbol=symbol,
                        primary_klines=primary_klines,
                        confirm_klines=confirm_klines,
                        reversal_klines=reversal_klines,
                        existing_position=current_position,
                        learning_state=learning_state,
                        fee_rate=fee_rate,
                        time_exit_enabled=time_exit_enabled,
                        strategy_settings=settings,
                    )
                    if current_position is None and cooldown_remaining > 0:
                        last_exit_reason = str(learning_state.get("last_exit_reason", "")).strip()
                        decision.features["cooldown_active"] = True
                        decision.features["cooldown_remaining_cycles"] = cooldown_remaining
                        decision.features["cooldown_until_cycle"] = cooldown_until_cycle
                        decision.features["last_exit_reason"] = last_exit_reason
                        if decision.action == "buy":
                            blocked_rationale = (
                                f"{decision.rationale} | compra bloqueada por cooldown de "
                                f"{cooldown_remaining} ciclo(s) apos saida ruim"
                            )
                            decision = Decision(
                                action="hold",
                                score=decision.score,
                                confidence=decision.confidence,
                                price=decision.price,
                                features={
                                    **decision.features,
                                    "blocked_action": "buy",
                                    "decision_path": "cooldown_hold",
                                },
                                rationale=blocked_rationale,
                            )
                        else:
                            decision.rationale = (
                                f"{decision.rationale} | cooldown ativo por "
                                f"{cooldown_remaining} ciclo(s) apos saida ruim"
                            )
                    learning_state = self._record_learning_snapshot(
                        symbol=symbol,
                        decision=decision,
                        learning_state=learning_state,
                        cycle_history_limit=settings["cycle_history_limit"],
                    )
                    decision.features["learning_cycle_index"] = learning_state["cycle_count"]
                    decision.features["learning_resolved_count"] = learning_state["resolved_count"]
                    decision.features["fee_rate"] = fee_rate

                    last_prices[symbol] = decision.price
                    self._last_prices[symbol] = decision.price

                    executed = False
                    execution_note = "Sem execucao."

                    if (
                        decision.action == "buy"
                        and current_position is None
                        and open_count < max_open_positions
                    ):
                        trade_budget = portfolio["cash_balance"] * settings["trade_size_fraction"]
                        trade_budget = min(trade_budget, portfolio["cash_balance"] * 0.92)
                        min_notional = self.market_client.get_min_notional(
                            symbol,
                            fallback=min_trade_notional or MIN_TRADE_NOTIONAL,
                        )
                        if trade_budget >= min_notional:
                            quantity = trade_budget / decision.price
                            fee = trade_budget * fee_rate
                            total_cost = trade_budget + fee
                            if total_cost <= portfolio["cash_balance"]:
                                portfolio = self.database.record_buy(
                                    symbol=symbol,
                                    quantity=quantity,
                                    avg_price=decision.price,
                                    opened_at=utc_now_iso(),
                                    last_decision=decision.rationale,
                                    cost_basis=total_cost,
                                    gross_value=trade_budget,
                                    fee=fee,
                                    rationale=decision.rationale,
                                )
                                positions[symbol] = self.database.get_position(symbol)
                                open_count += 1
                                executed = True
                                execution_note = "Compra simulada executada."
                        else:
                            execution_note = (
                                f"Saldo insuficiente para o lote minimo ({min_notional:.8f})."
                            )

                    elif decision.action == "sell" and current_position is not None:
                        gross_value = current_position["quantity"] * decision.price
                        fee = gross_value * fee_rate
                        net_value = gross_value - fee
                        realized_pnl = net_value - current_position["cost_basis"]
                        portfolio = self.database.record_sell(
                            symbol=symbol,
                            quantity=current_position["quantity"],
                            price=decision.price,
                            gross_value=gross_value,
                            fee=fee,
                            net_value=net_value,
                            realized_pnl=realized_pnl,
                            rationale=decision.rationale,
                        )
                        positions.pop(symbol, None)
                        open_count = max(0, open_count - 1)
                        executed = True
                        execution_note = "Venda simulada executada."
                        if realized_pnl < 0 and cooldown_after_loss_cycles > 0:
                            learning_state["cooldown_until_cycle"] = (
                                int(learning_state["cycle_count"]) + cooldown_after_loss_cycles
                            )
                            learning_state["last_exit_reason"] = decision.rationale
                            learning_state["updated_at"] = utc_now_iso()
                            self.database.upsert_learning_state(learning_state)
                            decision.features["cooldown_scheduled_cycles"] = (
                                cooldown_after_loss_cycles
                            )
                            decision.features["cooldown_until_cycle"] = int(
                                learning_state["cooldown_until_cycle"]
                            )
                            execution_note = (
                                f"{execution_note} Cooldown de {cooldown_after_loss_cycles} "
                                "ciclo(s) armado."
                            )
                        elif (
                            learning_state.get("cooldown_until_cycle")
                            or learning_state.get("last_exit_reason")
                        ):
                            learning_state["cooldown_until_cycle"] = 0
                            learning_state["last_exit_reason"] = ""
                            learning_state["updated_at"] = utc_now_iso()
                            self.database.upsert_learning_state(learning_state)

                    self.database.add_decision(
                        symbol=symbol,
                        action=decision.action,
                        score=decision.score,
                        confidence=decision.confidence,
                        price=decision.price,
                        features=decision.features,
                        rationale=decision.rationale,
                        executed=executed,
                        execution_note=execution_note,
                    )
                except MarketDataError as exc:
                    LOGGER.warning("%s", exc)
                except Exception:
                    LOGGER.exception("Unexpected error while processing %s.", symbol)

            self.database.reconcile_portfolio_with_transactions()
            metrics = self.calculate_metrics(last_prices=last_prices)
            self.database.add_equity_snapshot(
                total_balance=metrics["total_balance"],
                cash_balance=metrics["cash_balance"],
                unrealized_pnl=metrics["unrealized_pnl"],
                realized_pnl=metrics["realized_pnl"],
            )
            self._last_cycle_finished_at = utc_now_iso()
        finally:
            self._cycle_lock.release()

    def calculate_metrics(self, last_prices: Dict[str, float] | None = None) -> Dict[str, float]:
        last_prices = {**self._last_prices, **(last_prices or {})}
        settings = self.database.get_settings()
        selected_symbols = settings["selected_symbols"]
        portfolio = self.database.reconcile_portfolio_with_transactions()
        positions = {item["symbol"]: item for item in self.database.list_positions()}
        missing_symbols = [symbol for symbol in selected_symbols if symbol not in last_prices]

        if missing_symbols:
            try:
                last_prices.update(self.market_client.get_last_prices(missing_symbols))
            except MarketDataError:
                for symbol in missing_symbols:
                    position = positions.get(symbol)
                    if position is not None:
                        last_prices.setdefault(symbol, position["avg_price"])
                    else:
                        last_prices.setdefault(symbol, 0.0)

        market_value = 0.0
        unrealized_pnl = 0.0
        open_positions = 0
        enriched_positions = []
        transaction_summary = self.database.get_transaction_summary_by_symbol(selected_symbols)

        for symbol in selected_symbols:
            position = positions.get(symbol)
            market_price = last_prices.get(symbol, position["avg_price"] if position else 0.0)
            quantity = position["quantity"] if position else 0.0
            position_value = quantity * market_price
            position_unrealized = position_value - position["cost_basis"] if position else 0.0
            symbol_realized = float(
                transaction_summary.get(symbol, {}).get("realized_pnl_total", 0.0)
            )
            buy_price = (
                position["avg_price"]
                if position
                else transaction_summary.get(symbol, {}).get("last_buy_price")
            )
            sell_price = (
                market_price
                if position and quantity > 0
                else transaction_summary.get(symbol, {}).get("last_sell_price")
            )
            market_value += position_value
            unrealized_pnl += position_unrealized
            if quantity > 0:
                open_positions += 1
            enriched = dict(position) if position else {"symbol": symbol}
            enriched["market_price"] = market_price
            enriched["market_value"] = position_value
            enriched["unrealized_pnl"] = position_unrealized
            enriched["quantity"] = quantity
            enriched["buy_price"] = buy_price
            enriched["sell_price"] = sell_price
            enriched["realized_pnl"] = symbol_realized
            enriched["realized_pnl_total"] = symbol_realized
            enriched["total_pnl"] = symbol_realized + position_unrealized
            enriched_positions.append(enriched)

        enriched_positions.sort(
            key=lambda item: (
                -float(item.get("quantity", 0.0)),
                item.get("symbol", ""),
            )
        )

        total_balance = portfolio["cash_balance"] + market_value
        net_pnl = total_balance - portfolio["initial_capital"]
        return {
            "initial_capital": portfolio["initial_capital"],
            "cash_balance": portfolio["cash_balance"],
            "realized_pnl": portfolio["realized_pnl"],
            "unrealized_pnl": unrealized_pnl,
            "total_balance": total_balance,
            "net_pnl": net_pnl,
            "positions_market_value": market_value,
            "open_positions": open_positions,
            "positions": enriched_positions,
        }

    @property
    def last_cycle_finished_at(self) -> str | None:
        return self._last_cycle_finished_at
