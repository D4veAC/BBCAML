import unittest
from unittest.mock import patch

from backend.news_retriever import retrieve


class NewsTimingTests(unittest.TestCase):
    def test_after_close_news_is_not_available_same_day(self):
        articles = [{
            'title': 'BBCA reports results', 'snippet': 'Bank Central Asia', 'source': 'Test', 'url': '',
            'pub_date': '2026-09-08', 'published_wib': '2026-09-08T18:00:00+07:00', 'pre_closing_ok': False,
        }]
        with patch('backend.news_retriever.load_articles', return_value=articles):
            self.assertEqual(retrieve('BBCA results', '2026-09-08'), [])
            self.assertEqual(len(retrieve('BBCA results', '2026-09-09')), 1)

    def test_date_only_news_is_available_next_day(self):
        articles = [{
            'title': 'BBCA dividend announced', 'snippet': 'Bank Central Asia', 'source': 'Archive', 'url': '',
            'pub_date': '2026-09-08', 'published_wib': '', 'pre_closing_ok': False,
            'timing_quality': 'date_only_next_day',
        }]
        with patch('backend.news_retriever.load_articles', return_value=articles):
            self.assertEqual(retrieve('BBCA dividend', '2026-09-08'), [])
            self.assertEqual(len(retrieve('BBCA dividend', '2026-09-09')), 1)


if __name__ == '__main__':
    unittest.main()
