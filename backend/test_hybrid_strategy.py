import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.hybrid_strategy import simulate_path, walk_forward_forecasts
from backend.tune_strategy import BUY_FEE, SELL_FEE, SLIPPAGE, MIN_TRAIN_ROWS


class HybridStrategyTests(unittest.TestCase):
    def test_walk_forward_fit_stops_before_prediction_block(self):
        frame = pd.DataFrame(index=range(MIN_TRAIN_ROWS + 4))

        def fake_fit(_frame, train_end, prediction_indices, *_args):
            self.assertLess(train_end, int(prediction_indices[0]) + 1)
            self.assertTrue(np.all(prediction_indices >= train_end))
            return np.zeros(len(prediction_indices)), 1

        with patch('backend.hybrid_strategy.fit_predict_before', side_effect=fake_fit):
            forecasts = walk_forward_forecasts(frame)
        self.assertTrue(np.isnan(forecasts[:MIN_TRAIN_ROWS]).all())
        self.assertTrue(np.isfinite(forecasts[MIN_TRAIN_ROWS:-1]).all())

    def frame(self):
        return pd.DataFrame({
            'date': pd.to_datetime(['2025-01-01', '2025-01-02']),
            'open': [100.0, 200.0], 'high': [101.0, 202.0],
            'low': [99.0, 199.0], 'close': [100.0, 200.0],
            'volume': [1.0, 1.0],
        })

    def test_xgboost_entry_executes_at_next_open(self):
        result = simulate_path(
            self.frame(), np.array([0.002, -1.0]), 0, 1,
            {'rsi14': np.array([35.0, 99.0]), 'sma200': np.array([90.0, 1000.0])},
        )
        expected = (
            (1.0 - BUY_FEE) / (1.0 + SLIPPAGE)
            * (200.0 / 200.0)
            * (1.0 - SELL_FEE) * (1.0 - SLIPPAGE) - 1.0
        )
        self.assertAlmostEqual(result['net_return'], expected)
        self.assertEqual(result['xgboost_entries'], 1)

    def test_future_forecast_cannot_create_current_entry(self):
        result = simulate_path(
            self.frame(), np.array([0.0, 1.0]), 0, 1,
            {'rsi14': np.array([35.0, 1.0]), 'sma200': np.array([90.0, 1.0])},
        )
        self.assertEqual(result['trades'], 0)


if __name__ == '__main__':
    unittest.main()
