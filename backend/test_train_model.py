import unittest

import pandas as pd

from backend.train_model import decision_indices, exclude_incomplete_session, split_boundaries


class ChronologicalSplitTests(unittest.TestCase):
    def test_current_incomplete_yahoo_session_is_excluded(self):
        frame = pd.DataFrame({'date': pd.to_datetime(['2026-09-07', '2026-09-08'])})
        result = {
            'timestamp': [100, 200],
            'meta': {'currentTradingPeriod': {'regular': {'start': 200, 'end': 300}}},
        }
        filtered, excluded = exclude_incomplete_session(frame, result, now_timestamp=250)
        self.assertTrue(excluded)
        self.assertEqual(len(filtered), 1)

    def test_completed_yahoo_session_is_retained(self):
        frame = pd.DataFrame({'date': pd.to_datetime(['2026-09-07', '2026-09-08'])})
        result = {
            'timestamp': [100, 200],
            'meta': {'currentTradingPeriod': {'regular': {'start': 200, 'end': 300}}},
        }
        filtered, excluded = exclude_incomplete_session(frame, result, now_timestamp=301)
        self.assertFalse(excluded)
        self.assertEqual(len(filtered), 2)

    def test_next_session_labels_do_not_cross_split_boundaries(self):
        row_count = 1000
        train_end, val_end = split_boundaries(row_count)
        train = decision_indices(0, train_end, 30)
        validation = decision_indices(train_end, val_end, 30)
        test = decision_indices(val_end, row_count, 30)

        self.assertLess(train[-1] + 1, validation[0])
        self.assertLess(validation[-1] + 1, test[0])
        self.assertLessEqual(train[-1] + 1, train_end - 1)
        self.assertLessEqual(validation[-1] + 1, val_end - 1)
        self.assertLessEqual(test[-1] + 1, row_count - 1)

    def test_windows_never_use_future_rows(self):
        indices = decision_indices(700, 850, 10)
        for decision_day in indices:
            window = range(decision_day - 9, decision_day + 1)
            self.assertEqual(max(window), decision_day)
            self.assertGreaterEqual(min(window), 0)


if __name__ == '__main__':
    unittest.main()
