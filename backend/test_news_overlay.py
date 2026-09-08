import unittest

import pandas as pd

from backend.tune_news_overlay import build_daily_documents


class NewsOverlayTimingTests(unittest.TestCase):
    def test_after_close_article_enters_only_next_session_and_rolls_backward_only(self):
        frame = pd.DataFrame({'date': pd.to_datetime(['2026-01-02', '2026-01-05', '2026-01-06'])})
        article = {
            'title': 'BBCA reports results', 'snippet': '', 'pub_date': '2026-01-02',
            'published_wib': '2026-01-02T18:00:00+07:00', 'pre_closing_ok': False,
        }
        documents, counts = build_daily_documents(frame, [article], lookback_sessions=2)
        self.assertEqual(documents[0], '')
        self.assertEqual(counts.tolist(), [0, 1, 1])
        self.assertIn('BBCA reports results', documents[1])
        self.assertIn('BBCA reports results', documents[2])


if __name__ == '__main__':
    unittest.main()
