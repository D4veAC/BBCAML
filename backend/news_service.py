import json
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

try:
    from backend.news_collector import QUERIES, WIB, fetch, key, parse
    from backend.news_retriever import load_articles
except ImportError:
    from news_collector import QUERIES, WIB, fetch, key, parse
    from news_retriever import load_articles


_CACHE = {}
_CACHE_LOCK = threading.Lock()
_CACHE_SECONDS = 300
_MODEL_CACHE = {}
DEFAULT_MODELS = [
    'openai/gpt-oss-20b', 'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b',
    'groq/compound-mini', 'groq/compound', 'allam-2-7b',
]
NON_SUMMARIZER_MARKERS = ('whisper', 'orpheus', 'prompt-guard', 'safeguard')


def _recent_local(as_of, days=5):
    earliest = as_of - timedelta(days=days)
    return [item for item in load_articles() if earliest <= date.fromisoformat(item['pub_date']) <= as_of]


def _live_articles(as_of):
    start = as_of - timedelta(days=3)
    end = as_of + timedelta(days=1)
    articles = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = [pool.submit(fetch, query, start, end, 1) for query in QUERIES]
        for job, query in zip(jobs, QUERIES):
            try:
                articles.extend(article for item in job.result() if (article := parse(item, query)))
            except Exception:
                continue
    return [item for item in articles if date.fromisoformat(item['pub_date']) <= as_of]


def _api_keys():
    candidates = [os.environ.get('GROQ_API_KEY', ''), *os.environ.get('GROQ_API_KEYS', '').split(',')]
    return list(dict.fromkeys(value.strip() for value in candidates if value.strip()))


def _available_models(api_key):
    cached = _MODEL_CACHE.get(api_key)
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    request = urllib.request.Request(
        'https://api.groq.com/openai/v1/models',
        headers={'Authorization': f'Bearer {api_key}', 'Accept': 'application/json', 'User-Agent': 'BBCAML/1.0'},
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode('utf-8'))
        models = [item['id'] for item in payload.get('data', []) if item.get('id')
                  and item.get('active', True)
                  and not any(marker in item['id'].lower() for marker in NON_SUMMARIZER_MARKERS)]
        _MODEL_CACHE[api_key] = (time.time(), models)
        return models
    except Exception:
        return []


def _model_chain(api_key):
    configured = [value.strip() for value in os.environ.get('GROQ_MODELS', '').split(',') if value.strip()]
    available = [model for model in _available_models(api_key)
                 if not any(marker in model.lower() for marker in NON_SUMMARIZER_MARKERS)]
    preferred = configured or DEFAULT_MODELS
    return list(dict.fromkeys([model for model in preferred if not available or model in available] + available))


def _summarize(articles):
    api_keys = _api_keys()
    if not api_keys:
        return None, 'not_configured', None
    evidence = [
        {'title': item['title'], 'source': item.get('source', ''), 'published_wib': item.get('published_wib', '')}
        for item in articles[:8]
    ]
    for api_key in api_keys:
        for model in _model_chain(api_key):
            request = urllib.request.Request(
                'https://api.groq.com/openai/v1/chat/completions',
                data=json.dumps({
                    'model': model, 'temperature': 0.1, 'max_completion_tokens': 400,
                    'messages': [
                        {'role': 'system', 'content': 'Ringkas bukti berita yang diberikan dalam bahasa Indonesia. Tulis 2-3 kalimat faktual. Jangan membuat prediksi harga, rekomendasi trading, angka, atau fakta yang tidak ada dalam bukti.'},
                        {'role': 'user', 'content': json.dumps(evidence, ensure_ascii=False)},
                    ],
                }).encode('utf-8'),
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'User-Agent': 'BBCAML/1.0'},
                method='POST',
            )
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    payload = json.loads(response.read().decode('utf-8'))
                content = payload.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                if content:
                    return content, 'ready', model
            except Exception:
                continue
    return None, 'unavailable', None


def get_news(as_of_text):
    try:
        as_of = date.fromisoformat(as_of_text)
    except (TypeError, ValueError):
        raise ValueError('Date must use YYYY-MM-DD format')
    if as_of > datetime.now(WIB).date():
        raise ValueError('News date cannot be in the future')
    cache_key = as_of.isoformat()
    now = time.time()
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached and now - cached[0] < _CACHE_SECONDS:
            return cached[1]

    articles = _recent_local(as_of)
    if as_of >= datetime.now(WIB).date() - timedelta(days=1):
        articles.extend(_live_articles(as_of))
    unique = {key(item): item for item in articles if item.get('title') and item.get('pub_date')
              and date.fromisoformat(item['pub_date']) <= as_of}
    ordered = sorted(unique.values(), key=lambda item: item.get('published_wib') or item['pub_date'], reverse=True)[:12]
    summary, summary_status, summary_model = _summarize(ordered) if ordered else (None, 'unavailable', None)
    result = {
        'as_of': cache_key,
        'fetched_at': datetime.now(WIB).isoformat(),
        'summary': summary,
        'summary_status': summary_status,
        'summary_model': summary_model,
        'articles': [{
            'title': item['title'], 'source': item.get('source', ''), 'url': item.get('url', ''),
            'published_wib': item.get('published_wib', ''),
        } for item in ordered],
    }
    with _CACHE_LOCK:
        _CACHE[cache_key] = (now, result)
    return result
