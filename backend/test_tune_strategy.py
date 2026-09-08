import unittest

import numpy as np
import pandas as pd

from backend.tune_strategy import BUY_FEE, SELL_FEE, SLIPPAGE, simulate


class CausalExecutionTests(unittest.TestCase):
    def test_entry_does_not_capture_overnight_gap(self):
        frame = pd.DataFrame({
            'open': [100.0, 200.0], 'high': [100.0, 201.0],
            'low': [99.0, 199.0], 'close': [100.0, 200.0],
        })
        indicators = {
            'atr': np.array([1.0, 1.0]), 'sma20': np.array([100.0, 200.0]),
            'sma50': np.array([100.0, 200.0]), 'sma200': np.array([100.0, 200.0]),
            'rsi14': np.array([50.0, 50.0]),
        }
        indicators['prior_high20'] = np.array([90.0, 90.0])
        indicators['volume_median20'] = np.array([1.0, 1.0])
        frame['volume'] = [1.0, 1.0]
        config = {'entry_threshold': 0.0, 'exit_threshold': 0.0, 'atr_multiplier': 3.0, 'trend_gate': False,
                  'confirmation_days': 2, 'breakout_atr_buffer': None}
        # Supply two decision sessions so entry can be confirmed on the second.
        frame = pd.concat([frame.iloc[[0]], frame], ignore_index=True)
        frame.loc[1, ['open', 'high', 'low', 'close']] = [100.0, 100.0, 99.0, 100.0]
        indicators = {key: np.insert(value, 0, value[0]) for key, value in indicators.items()}
        result = simulate(frame, np.array([0, 1]), np.array([0.01, 0.01]), indicators, config)
        expected = (1.0 - BUY_FEE) * 200.0 / (200.0 * (1.0 + SLIPPAGE)) * (1.0 - SELL_FEE) * (1.0 - SLIPPAGE) - 1.0
        self.assertAlmostEqual(result['net_return'], expected)

    def test_new_position_stop_is_based_on_execution_open(self):
        frame = pd.DataFrame({
            'open': [100.0, 90.0], 'high': [100.0, 92.0],
            'low': [99.0, 85.0], 'close': [100.0, 91.0],
        })
        indicators = {
            'atr': np.array([1.0, 1.0]), 'sma20': np.array([100.0, 91.0]),
            'sma50': np.array([100.0, 91.0]), 'sma200': np.array([100.0, 91.0]),
            'rsi14': np.array([50.0, 50.0]),
        }
        indicators['prior_high20'] = np.array([90.0, 90.0])
        indicators['volume_median20'] = np.array([1.0, 1.0])
        frame['volume'] = [1.0, 1.0]
        config = {'entry_threshold': 0.0, 'exit_threshold': 0.0, 'atr_multiplier': 3.0, 'trend_gate': False,
                  'confirmation_days': 1, 'breakout_atr_buffer': None}
        result = simulate(frame, np.array([0]), np.array([0.01]), indicators, config)
        stop_fill = (90.0 - 3.0 * 1.0) * (1.0 - SLIPPAGE)
        expected = (1.0 - BUY_FEE) * stop_fill / (90.0 * (1.0 + SLIPPAGE)) * (1.0 - SELL_FEE) - 1.0
        self.assertAlmostEqual(result['net_return'], expected)

    def test_take_profit_uses_entry_atr_and_pays_exit_costs(self):
        frame = pd.DataFrame({
            'open': [100.0, 100.0], 'high': [100.0, 104.0],
            'low': [99.0, 99.0], 'close': [100.0, 101.0],
            'volume': [1.0, 1.0],
        })
        indicators = {
            'atr': np.array([1.0, 1.0]), 'sma20': np.array([100.0, 100.0]),
            'sma50': np.array([100.0, 100.0]), 'sma200': np.array([100.0, 100.0]),
            'rsi14': np.array([50.0, 50.0]), 'prior_high20': np.array([90.0, 90.0]),
            'volume_median20': np.array([1.0, 1.0]),
        }
        config = {
            'entry_threshold': 0.0, 'exit_threshold': 0.0,
            'atr_multiplier': 3.0, 'take_profit_atr': 3.0,
            'trend_gate': False, 'confirmation_days': 1,
            'breakout_atr_buffer': None,
        }
        result = simulate(frame, np.array([0]), np.array([0.01]), indicators, config)
        expected = (1.0 - BUY_FEE) * (103.0 * (1.0 - SLIPPAGE)) / (100.0 * (1.0 + SLIPPAGE)) * (1.0 - SELL_FEE) - 1.0
        self.assertAlmostEqual(result['net_return'], expected)
        self.assertEqual(result['take_profit_exits'], 1)


if __name__ == '__main__':
    unittest.main()
