import json
import tempfile
import unittest
from pathlib import Path

from backend.export_backtest_data import export


class BacktestExportTests(unittest.TestCase):
    def test_continuous_equity_points_are_not_reset_at_chart_boundaries(self):
        report = {
            'strategy_label': 'RSI regime + XGBoost',
            'period': {'start': '2025-01-01', 'end': '2025-06-30'},
            'folds': 7,
            'forward_trades': 2,
            'max_drawdown': -0.08,
            'trade_log': [{
                'source': 'xgboost', 'signal_date': '2025-01-02',
                'entry_date': '2025-01-03', 'exit_date': '2025-01-10',
                'net_return': 0.03,
            }],
            'points': [
                {'date': '2025-01-01', 'strategy': 1.0, 'baseline': 1.0},
                {'date': '2025-06-30', 'strategy': 1.2, 'baseline': 1.1},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'report.json'
            destination = Path(directory) / 'backtest.json'
            source.write_text(json.dumps(report), encoding='utf-8')
            result = export(source, destination)
        self.assertAlmostEqual(result['strategyReturn'], 0.2)
        self.assertAlmostEqual(result['baselineReturn'], 0.1)
        self.assertEqual(result['folds'], 7)
        self.assertEqual(result['maxDrawdown'], -0.08)
        self.assertEqual(result['tradeLog'][0]['entryDate'], '2025-01-03')

    def test_fold_returns_are_compounded_without_future_inputs(self):
        report = {
            'strategy_label': 'RSI regime + XGBoost',
            'period': {'start': '2025-01-01', 'end': '2025-06-30'},
            'folds': 2,
            'forward_trades': 1,
            'max_drawdown': -0.04,
            'trade_log': [],
            'fold_reports': [
                {'end': '2025-03-31', 'forward': {'net_return': 0.0, 'trades': 0}, 'benchmark_return': 0.10},
                {'end': '2025-06-30', 'forward': {'net_return': -0.02, 'trades': 1}, 'benchmark_return': 0.04},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'report.json'
            destination = Path(directory) / 'backtest.json'
            source.write_text(json.dumps(report), encoding='utf-8')
            result = export(source, destination)
        expected = (1.0 + 0.0) * (1.0 - 0.02) - 1.0
        self.assertAlmostEqual(result['strategyReturn'], expected)
        self.assertEqual(result['trades'], 1)
        self.assertEqual(result['strategyLabel'], 'RSI regime + XGBoost')


if __name__ == '__main__':
    unittest.main()
