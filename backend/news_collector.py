import argparse
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CORPUS = Path(__file__).resolve().parent.parent / 'data' / 'news_corpus'
BBCA_CORPUS = CORPUS / 'BBCA'
WIB = ZoneInfo('Asia/Jakarta')
QUERIES = [
    'BBCA saham', '"Bank Central Asia" saham', '"saham BCA"',
    'BBCA laba dividen buyback', 'BBCA asing broker target harga', 'BBCA kinerja kredit NPL',
]
RELEVANCE = re.compile(r'\bBBCA\b|BANK CENTRAL ASIA|SAHAM\s+BCA', re.I)


def relevant(article):
    return bool(RELEVANCE.search(f"{article.get('title', '')} {article.get('snippet', '')}"))


def clean(value):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(value or ''))).strip()


def key(article):
    url = (article.get('url') or '').strip()
    if url:
        return hashlib.sha256(url.encode()).hexdigest()
    title = re.sub(r'\s+-\s+[^-]{2,80}$', '', article['title'].lower())
    basis = '|'.join((
        re.sub(r'[^a-z0-9]+', ' ', title).strip(),
        article.get('source', '').lower(),
        article.get('pub_date', ''),
    ))
    return hashlib.sha256(basis.encode()).hexdigest()


def fetch(query, start, end, retries=3):
    expression = urllib.parse.quote(f'{query} after:{start.isoformat()} before:{end.isoformat()}')
    url = f'https://news.google.com/rss/search?q={expression}&hl=id&gl=ID&ceid=ID:id'
    error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=25) as response:
                return ET.fromstring(response.read()).findall('./channel/item')
        except Exception as exc:
            error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f'News request failed for {query!r}, {start}: {error}')


def parse(item, query):
    title = clean(item.findtext('title'))
    snippet = clean(item.findtext('description'))[:600]
    if not title or not relevant({'title': title, 'snippet': snippet}):
        return None
    raw_time = item.findtext('pubDate') or ''
    try:
        published = parsedate_to_datetime(raw_time).astimezone(WIB) if raw_time else None
    except (TypeError, ValueError, OverflowError):
        return None
    # Network articles without an exact publication time cannot be placed safely
    # relative to the market close. Date-only legacy imports remain next-day only.
    if published is None:
        return None
    source = item.find('source')
    before_close = bool(published and (published.hour, published.minute) < (15, 50))
    return {
        'title': title,
        'snippet': snippet,
        'url': item.findtext('link') or '',
        'source': clean(source.text if source is not None else 'Google News'),
        'published_utc': raw_time,
        'published_wib': published.isoformat() if published else '',
        'pub_date': published.date().isoformat() if published else '',
        'pre_closing_ok': before_close,
        'timing_quality': 'exact',
        'query': query,
    }


def collect_period(start, end):
    collected = []
    for query in QUERIES:
        collected.extend(article for item in fetch(query, start, end) if (article := parse(item, query)))
        time.sleep(0.35)
    return collected


def merge_month(label, articles):
    BBCA_CORPUS.mkdir(parents=True, exist_ok=True)
    path = BBCA_CORPUS / f'{label}.json'
    existing = json.loads(path.read_text(encoding='utf-8')).get('articles', []) if path.exists() else []
    merged = {}
    for article in [*existing, *articles]:
        merged[key(article)] = article
    ordered = sorted(merged.values(), key=lambda item: (item.get('published_wib', ''), item['title']))
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({'query_window': label, 'n': len(ordered), 'articles': ordered}, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def _availability_sort(article):
    published = date.fromisoformat(article['pub_date'])
    usable = published if article.get('pre_closing_ok') else published + timedelta(days=1)
    return (
        usable.isoformat(),
        article.get('published_wib', ''),
        bool(article.get('snippet')),
        bool(article.get('source')),
    )


def reconcile_corpus():
    """Deduplicate by article URL and place each item in its publication month.

    When a feed reports conflicting timestamps for one URL, keep the version with
    the later availability date. This prevents an update from moving evidence
    earlier in a historical simulation.
    """
    paths = sorted(BBCA_CORPUS.glob('*.json'))
    selected = {}
    for path in paths:
        for article in json.loads(path.read_text(encoding='utf-8')).get('articles', []):
            if not article.get('pub_date') or not relevant(article):
                continue
            identity = key(article)
            current = selected.get(identity)
            if current is None or _availability_sort(article) > _availability_sort(current):
                selected[identity] = article

    by_month = {}
    for article in selected.values():
        by_month.setdefault(article['pub_date'][:7], []).append(article)
    labels = {path.stem for path in paths} | set(by_month)
    for label in labels:
        ordered = sorted(
            by_month.get(label, []),
            key=lambda item: (item.get('published_wib', ''), item.get('pub_date', ''), item['title']),
        )
        path = BBCA_CORPUS / f'{label}.json'
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(
            json.dumps({'query_window': label, 'n': len(ordered), 'articles': ordered}, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        temporary.replace(path)
    return len(selected)


def month_periods(start, end):
    cursor = start.replace(day=1)
    while cursor <= end:
        following = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield cursor, min(following, end + timedelta(days=1))
        cursor = following


def audit():
    articles = []
    empty = []
    for path in sorted(BBCA_CORPUS.glob('*.json')):
        items = json.loads(path.read_text(encoding='utf-8')).get('articles', [])
        articles.extend(items)
        if not items:
            empty.append(path.stem)
    dated = [item for item in articles if item.get('pub_date')]
    exact = [item for item in dated if item.get('published_wib')]
    date_only = [item for item in dated if not item.get('published_wib')]
    methods = Counter()
    for item in articles:
        query = item.get('query', '')
        if query == 'GDELT':
            methods['gdelt'] += 1
        elif query.startswith('direct:'):
            methods['publisher_rss'] += 1
        elif not item.get('published_wib'):
            methods['legacy_date_only'] += 1
        else:
            methods['google_news_rss'] += 1
    today = datetime.now(WIB).date().isoformat()
    identities = [key(item) for item in articles]
    manifest = {
        'generated_at': datetime.now(WIB).isoformat(),
        'files': len(list(BBCA_CORPUS.glob('*.json'))),
        'articles': len(articles),
        'dated_articles': len(dated),
        'exact_timestamp_articles': len(exact),
        'date_only_next_day_articles': len(date_only),
        'pre_closing_articles': sum(bool(item.get('pre_closing_ok')) for item in articles),
        'duplicate_articles_across_files': len(identities) - len(set(identities)),
        'future_dated_articles': sum(item['pub_date'] > today for item in dated),
        'articles_by_collection_method': dict(sorted(methods.items())),
        'date_min': min((item['pub_date'] for item in dated), default=None),
        'date_max': max((item['pub_date'] for item in dated), default=None),
        'articles_by_year': dict(sorted(Counter(item['pub_date'][:4] for item in dated).items())),
        'empty_months': empty,
        'top_sources': Counter(item.get('source', '') for item in articles).most_common(25),
        'coverage_note': 'Public RSS coverage is measured, not assumed complete.',
    }
    (CORPUS / 'BBCA_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


def update_recent(days=10):
    end = datetime.now(WIB).date()
    start = end - timedelta(days=days)
    for period_start, period_end in month_periods(start, end):
        merge_month(period_start.strftime('%Y-%m'), collect_period(period_start, period_end))
    return audit()


def backfill(start, end):
    for period_start, period_end in month_periods(start, end):
        merge_month(period_start.strftime('%Y-%m'), collect_period(period_start, period_end))
        print(period_start.strftime('%Y-%m'), flush=True)
    return audit()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--start')
    parser.add_argument('--end', default=date.today().isoformat())
    parser.add_argument('--recent-days', type=int, default=10)
    arguments = parser.parse_args()
    result = backfill(date.fromisoformat(arguments.start), date.fromisoformat(arguments.end)) if arguments.start else update_recent(arguments.recent_days)
    print(json.dumps(result, ensure_ascii=False, indent=2))
