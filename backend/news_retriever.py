import json
import math
import re
from datetime import date, timedelta
from pathlib import Path

CORPUS = Path(__file__).resolve().parent.parent / 'data' / 'news_corpus' / 'BBCA'
TOKEN = re.compile(r'[a-z0-9]{2,}', re.I)


def available_date(article):
    published = date.fromisoformat(article['pub_date'])
    return published if article.get('pre_closing_ok') else published + timedelta(days=1)


def load_articles():
    articles = []
    for path in sorted(CORPUS.glob('*.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        for article in payload.get('articles', []):
            if article.get('pub_date'):
                articles.append(article)
    return articles


def retrieve(query, as_of, limit=5):
    cutoff = date.fromisoformat(as_of)
    query_terms = set(TOKEN.findall(query.lower()))
    ranked = []
    for article in load_articles():
        usable = available_date(article)
        if usable > cutoff:
            continue
        text_terms = set(TOKEN.findall(f"{article.get('title', '')} {article.get('snippet', '')}".lower()))
        overlap = len(query_terms & text_terms) / max(1, len(query_terms))
        age = max(0, (cutoff - usable).days)
        score = overlap + 0.15 * math.exp(-age / 30.0)
        ranked.append((score, usable, article))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [
        {
            'title': article['title'], 'source': article.get('source', ''),
            'url': article.get('url', ''), 'published_wib': article.get('published_wib', ''),
            'available_date': usable.isoformat(), 'relevance': round(score, 4),
        }
        for score, usable, article in ranked[:limit]
    ]
