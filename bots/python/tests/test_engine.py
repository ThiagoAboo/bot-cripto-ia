from __future__ import annotations

import pathlib
import sys
import unittest
from unittest import mock

import numpy as np


TESTS_DIR = pathlib.Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_support import ensure_python_path, make_candles

ensure_python_path()

import engine


class EngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "architecture": "linear_regression",
            "hyperparameters": {
                "forecastHorizonCandles": 1,
                "buyThresholdPercent": 1.0,
                "sellThresholdPercent": -1.0,
                "sequenceLength": 8,
            },
        }
        closes = [100, 101, 102, 103, 104, 105, 100, 103, 103, 100, 97, 97, 100, 96, 96]
        self.datasets = {"BTC/USDT": make_candles(closes)}

    def test_build_tabular_samples_assigns_expected_labels(self) -> None:
        samples = engine.build_tabular_samples(self.datasets, self.config)

        self.assertEqual(8, len(samples))
        self.assertEqual({"BTC/USDT"}, {sample.pair for sample in samples})
        self.assertEqual(
            {
                engine.CLASS_TO_INDEX["buy"],
                engine.CLASS_TO_INDEX["hold"],
                engine.CLASS_TO_INDEX["sell"],
            },
            {sample.label for sample in samples},
        )
        self.assertEqual((len(engine.FEATURE_NAMES),), samples[0].features.shape)

    def test_build_sequence_samples_respects_sequence_length(self) -> None:
        samples = engine.build_sequence_samples(self.datasets, self.config)

        self.assertEqual(6, len(samples))
        self.assertEqual((8, len(engine.FEATURE_NAMES)), samples[0].features.shape)
        self.assertTrue(all(sample.label in engine.CLASS_TO_INDEX.values() for sample in samples))

    def test_split_samples_orders_by_timestamp_before_splitting(self) -> None:
        timestamps = [f"2024-01-{day:02d}T00:00:00Z" for day in range(14, 0, -1)]
        samples = [
            engine.DatasetSample(
                pair="BTC/USDT",
                timestamp=timestamp,
                price=100.0 + index,
                future_price=101.0 + index,
                features=np.array([float(index)], dtype=np.float32),
                label=index % len(engine.CLASSES),
            )
            for index, timestamp in enumerate(timestamps)
        ]

        train_samples, valid_samples = engine.split_samples(samples, 0.25)

        ordered_timestamps = [sample.timestamp for sample in train_samples + valid_samples]
        self.assertEqual(sorted(ordered_timestamps), ordered_timestamps)
        self.assertEqual(10, len(train_samples))
        self.assertEqual(4, len(valid_samples))
        self.assertLess(train_samples[-1].timestamp, valid_samples[0].timestamp)

    def test_build_snapshot_features_requires_enough_sequence_candles(self) -> None:
        snapshot = {"pair": "BTC/USDT", "candles": make_candles([100 + index for index in range(10)])}
        engine_package = {"inputMode": "sequence", "sequenceLength": 5}

        with self.assertRaisesRegex(ValueError, "Quantidade insuficiente de candles"):
            engine.build_snapshot_features(snapshot, engine_package)

    def test_run_predict_sorts_opportunities_by_confidence(self) -> None:
        payload = {
            "artifactPath": "ignored.json",
            "marketSnapshots": [
                {"pair": "BTC/USDT", "candles": make_candles([100 + index for index in range(12)])},
                {"pair": "ETH/USDT", "candles": make_candles([200 + index for index in range(12)])},
            ],
        }

        with (
            mock.patch.object(engine, "load_engine_package_from_artifact", return_value={"architecture": "linear_regression"}),
            mock.patch.object(engine, "load_runtime_model", return_value={"kind": "joblib"}),
            mock.patch.object(
                engine,
                "build_snapshot_features",
                side_effect=[np.ones((1, 3), dtype=np.float32), np.ones((1, 3), dtype=np.float32) * 2],
            ),
            mock.patch.object(
                engine,
                "predict_probabilities",
                side_effect=[
                    np.array([[0.2, 0.6, 0.2]], dtype=np.float32),
                    np.array([[0.1, 0.2, 0.7]], dtype=np.float32),
                ],
            ),
        ):
            result = engine.run_predict(payload)

        self.assertEqual("linear_regression", result["primarySpecialist"])
        self.assertEqual(["ETH/USDT", "BTC/USDT"], [item["pair"] for item in result["opportunities"]])
        self.assertEqual("sell", result["opportunities"][0]["action"])
        self.assertEqual(70.0, result["opportunities"][0]["confidence"])


if __name__ == "__main__":
    unittest.main()
