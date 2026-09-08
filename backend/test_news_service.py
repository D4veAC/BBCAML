import unittest
import os
from datetime import datetime, timedelta
from unittest.mock import patch

from backend import news_service


ARTICLE = {
    'title': 'BBCA reports results', 'snippet': '', 'source': 'Publisher',
    'url': 'https://example.com/bbca', 'pub_date': '2026-01-02',
    'published_wib': '2026-01-02T10:00:00+07:00', 'pre_closing_ok': True,
}


class NewsServiceTests(unittest.TestCase):
    def setUp(self):
        news_service._CACHE.clear()

    @patch('backend.news_service._summarize', return_value=(None, 'not_configured', None))
    @patch('backend.news_service._recent_local', return_value=[ARTICLE])
    def test_historical_news_uses_timestamped_corpus(self, _local, _summary):
        result = news_service.get_news('2026-01-02')
        self.assertEqual(result['as_of'], '2026-01-02')
        self.assertEqual(result['articles'][0]['url'], ARTICLE['url'])
        self.assertEqual(result['summary_status'], 'not_configured')

    @patch('backend.news_service._recent_local', return_value=[{**ARTICLE, 'pub_date': '2026-01-03'}])
    def test_articles_after_selected_date_are_excluded(self, _local):
        result = news_service.get_news('2026-01-02')
        self.assertEqual(result['articles'], [])

    def test_future_date_is_rejected(self):
        tomorrow = (datetime.now(news_service.WIB).date() + timedelta(days=1)).isoformat()
        with self.assertRaises(ValueError):
            news_service.get_news(tomorrow)

    @patch.dict(os.environ, {'GROQ_API_KEY': 'primary', 'GROQ_API_KEYS': 'secondary,primary'})
    def test_key_chain_deduplicates_and_preserves_priority(self):
        self.assertEqual(news_service._api_keys(), ['primary', 'secondary'])

    @patch.dict(os.environ, {'GROQ_MODELS': 'model-b,model-a'})
    @patch('backend.news_service._available_models', return_value=['model-a', 'model-b', 'model-c', 'whisper-large-v3'])
    def test_model_chain_uses_preferences_then_discovered_models(self, _available):
        self.assertEqual(news_service._model_chain('key'), ['model-b', 'model-a', 'model-c'])


if __name__ == '__main__':
    unittest.main()
