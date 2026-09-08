import json
import tempfile
import unittest
from pathlib import Path

from backend.export_backtest_data import export


class BacktestExportTests(unittest.TestCase):
    def test_core_and_xgboost_returns_are_blended_without_future_inputs(self):
        report = {
            'period': {'start': '2025-01-01', 'end': '2025-06-30'},
            'folds': 2,
            'forward_trades': 1,
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
        expected = (1.0 + 0.05) * (1.0 + 0.01) - 1.0
        self.assertAlmostEqual(result['strategyReturn'], expected)
        self.assertEqual(result['trades'], 1)
        self.assertEqual(result['coreAllocation'], 0.5)


if __name__ == '__main__':
    unittest.main()
