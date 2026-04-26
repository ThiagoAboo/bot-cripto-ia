from __future__ import annotations

import os
import pathlib
import sys
import unittest
from unittest import mock


TESTS_DIR = pathlib.Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_support import ensure_python_path

ensure_python_path()

import service


class ServiceTests(unittest.TestCase):
    def test_env_helpers_parse_and_fallback_values(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "BOT_TEST_FLOAT": "2.5",
                "BOT_TEST_INT": "7.9",
                "BOT_TEST_BOOL": "yes",
                "BOT_TEST_BAD_FLOAT": "0",
                "BOT_TEST_BAD_INT": "-1",
                "BOT_TEST_FALSE_BOOL": "off",
            },
            clear=False,
        ):
            self.assertEqual(2.5, service.env_float("BOT_TEST_FLOAT", 1.0))
            self.assertEqual(7, service.env_int("BOT_TEST_INT", 1))
            self.assertTrue(service.env_bool("BOT_TEST_BOOL", False))
            self.assertEqual(1.0, service.env_float("BOT_TEST_BAD_FLOAT", 1.0))
            self.assertEqual(3, service.env_int("BOT_TEST_BAD_INT", 3))
            self.assertFalse(service.env_bool("BOT_TEST_FALSE_BOOL", True))

    def test_fetch_queue_items_accepts_dict_and_list_payloads(self) -> None:
        with mock.patch.object(service, "backend_request", return_value={"items": [{"botId": "1"}, "bad", 3]}):
            self.assertEqual([{"botId": "1"}], service.fetch_queue_items())

        with mock.patch.object(service, "backend_request", return_value=[{"botId": "2"}, None, "bad"]):
            self.assertEqual([{"botId": "2"}], service.fetch_queue_items())

    def test_process_queue_applies_cycle_results_for_valid_items(self) -> None:
        queue_items = [
            {"botId": "bot-1", "userId": "user-1"},
            {"botId": "", "userId": "user-2"},
        ]
        context = {
            "userId": "user-from-context",
            "generatedAt": "2024-01-01T00:00:00Z",
            "payload": {"cycle": {"executionMode": "paper"}},
        }
        cycle_result = {"plan": {"status": "execute", "pair": "BTC/USDT", "action": "buy"}}

        with (
            mock.patch.object(service, "fetch_queue_items", return_value=queue_items),
            mock.patch.object(service, "fetch_cycle_context", return_value=context),
            mock.patch.object(service, "run_cycle", return_value=cycle_result),
            mock.patch.object(service, "apply_cycle_result") as mock_apply_cycle_result,
            mock.patch.object(service, "log"),
            mock.patch.object(service, "MAX_BOTS_PER_LOOP", 0),
        ):
            processed = service.process_queue()

        self.assertEqual(1, processed)
        mock_apply_cycle_result.assert_called_once_with(
            bot_id="bot-1",
            user_id="user-from-context",
            generated_at="2024-01-01T00:00:00Z",
            cycle_result=cycle_result,
        )

    def test_process_queue_logs_failures_without_applying_cycle(self) -> None:
        queue_items = [{"botId": "bot-1", "userId": "user-1"}]
        context = {"payload": {"cycle": {"executionMode": "paper"}}}

        with (
            mock.patch.object(service, "fetch_queue_items", return_value=queue_items),
            mock.patch.object(service, "fetch_cycle_context", return_value=context),
            mock.patch.object(service, "run_cycle", side_effect=RuntimeError("boom")),
            mock.patch.object(service, "apply_cycle_result") as mock_apply_cycle_result,
            mock.patch.object(service, "log") as mock_log,
            mock.patch.object(service, "MAX_BOTS_PER_LOOP", 0),
        ):
            processed = service.process_queue()

        self.assertEqual(0, processed)
        mock_apply_cycle_result.assert_not_called()
        mock_log.assert_any_call(
            "error",
            "bot cycle failed",
            botId="bot-1",
            userId="user-1",
            error="boom",
            traceback=mock.ANY,
        )


if __name__ == "__main__":
    unittest.main()
