import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import news_collector


class NewsCorpusTests(unittest.TestCase):
    def test_conflicting_feed_times_keep_later_availability(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = Path(directory)
            base = {
                'title': 'BBCA reports results', 'snippet': '', 'source': 'Test',
                'url': 'https://example.test/one', 'pub_date': '2026-09-08',
            }
            early = {**base, 'published_wib': '2026-09-08T10:00:00+07:00', 'pre_closing_ok': True}
            late = {**base, 'published_wib': '2026-09-08T18:00:00+07:00', 'pre_closing_ok': False}
            (corpus / '2026-08.json').write_text(json.dumps({'articles': [early]}), encoding='utf-8')
            (corpus / '2026-09.json').write_text(json.dumps({'articles': [late]}), encoding='utf-8')

            with patch.object(news_collector, 'BBCA_CORPUS', corpus):
                self.assertEqual(news_collector.reconcile_corpus(), 1)

            august = json.loads((corpus / '2026-08.json').read_text(encoding='utf-8'))['articles']
            september = json.loads((corpus / '2026-09.json').read_text(encoding='utf-8'))['articles']
            self.assertEqual(august, [])
            self.assertEqual(september[0]['published_wib'], late['published_wib'])
            self.assertFalse(september[0]['pre_closing_ok'])


if __name__ == '__main__':
    unittest.main()
