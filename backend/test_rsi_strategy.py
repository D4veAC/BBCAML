import unittest

import numpy as np
import pandas as pd

from backend.rsi_strategy import simulate
from backend.tune_strategy import BUY_FEE, SELL_FEE, SLIPPAGE


class RsiStrategyTests(unittest.TestCase):
    def test_entry_executes_at_next_open_without_capturing_overnight_gap(self):
        frame = pd.DataFrame({
            'date': pd.to_datetime(['2025-01-01', '2025-01-02']),
            'open': [100.0, 200.0], 'high': [101.0, 202.0],
            'low': [99.0, 199.0], 'close': [100.0, 200.0],
            'volume': [1.0, 1.0],
        })
        indicators = {
            'rsi14': np.array([20.0, 60.0]),
            'sma200': np.array([90.0, 90.0]),
        }
        result = simulate(frame, 0, 1, indicators)
        expected = (
            (1.0 - BUY_FEE) / (1.0 + SLIPPAGE)
            * (200.0 / 200.0)
            * (1.0 - SELL_FEE) * (1.0 - SLIPPAGE) - 1.0
        )
        self.assertAlmostEqual(result['net_return'], expected)

    def test_signal_uses_only_decision_day_indicators(self):
        frame = pd.DataFrame({
            'date': pd.to_datetime(['2025-01-01', '2025-01-02']),
            'open': [100.0, 100.0], 'high': [101.0, 101.0],
            'low': [99.0, 99.0], 'close': [100.0, 101.0],
            'volume': [1.0, 1.0],
        })
        result = simulate(frame, 0, 1, {
            'rsi14': np.array([20.0, 99.0]),
            'sma200': np.array([90.0, 1000.0]),
        })
        self.assertEqual(result['trades'], 1)


if __name__ == '__main__':
    unittest.main()
