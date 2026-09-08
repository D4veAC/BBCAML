import argparse
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

try:
    from backend.news_collector import BBCA_CORPUS, WIB, audit, fetch, merge_month, month_periods, parse, reconcile_corpus, relevant, update_recent
except ImportError:
    from news_collector import BBCA_CORPUS, WIB, audit, fetch, merge_month, month_periods, parse, reconcile_corpus, relevant, update_recent

EXPANDED_QUERIES = [
    'BBCA', '"PT Bank Central Asia Tbk"', '"BCA Tbk"', 'BBCA IHSG',
    '"BBCA.JK"', '"IDX BBCA"', '"Bank BCA" saham', '"Bank Central Asia" emiten',
    'BBCA dividen', 'BBCA laba', 'BBCA asing', 'BBCA analis', 'BBCA broker',
    'BBCA buyback', 'BBCA RUPS', 'BBCA kredit', 'BBCA NPL',
    'BBCA rights issue stock split', 'BBCA laporan keuangan', 'BBCA target harga',
    'Jahja Setiaatmadja BBCA', 'BCA digital BBCA', 'Djarum BBCA saham',
]
SITES = [
    'cnbcindonesia.com', 'kontan.co.id', 'bisnis.com', 'investor.id',
    'idxchannel.com', 'bareksa.com', 'detik.com', 'bloombergtechnoz.com',
    'katadata.co.id', 'idnfinancials.com', 'emitennews.com', 'antaranews.com',
    'okezone.com', 'liputan6.com', 'bca.co.id',
]
DIRECT_RSS = [
    'https://www.cnbcindonesia.com/market/rss',
    'https://www.idxchannel.com/rss/market-news',
]


def count_month(label):
    path = BBCA_CORPUS / f'{label}.json'
    return len(json.loads(path.read_text(encoding='utf-8')).get('articles', [])) if path.exists() else 0


def query_task(query, start, end):
    return [article for item in fetch(query, start, end) if (article := parse(item, query))]


def expand_historical(start, end, minimum, workers):
    periods = [(s, e) for s, e in month_periods(start, end) if count_month(s.strftime('%Y-%m')) < minimum]
    collected = defaultdict(list)
    jobs = {}
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 6))) as pool:
        for period_start, period_end in periods:
            label = period_start.strftime('%Y-%m')
            queries = EXPANDED_QUERIES + [f'BBCA site:{domain}' for domain in SITES]
            for query in queries:
                jobs[pool.submit(query_task, query, period_start, period_end)] = label
        for job in as_completed(jobs):
            label = jobs[job]
            try:
                collected[label].extend(job.result())
            except Exception as exc:
                print(f'[Google:{label}] {exc}', flush=True)
    for label, articles in collected.items():
        merge_month(label, articles)
        print(f'{label}: +{len(articles)} raw, total={count_month(label)}', flush=True)


def direct_rss_recent(days=30):
    earliest = datetime.now(WIB) - timedelta(days=days)
    articles = []
    for url in DIRECT_RSS:
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=20) as response:
                items = ET.fromstring(response.read()).findall('.//item')
            for item in items:
                article = parse(item, f'direct:{urllib.parse.urlparse(url).netloc}')
                if article and article.get('published_wib') and datetime.fromisoformat(article['published_wib']) >= earliest:
                    articles.append(article)
        except Exception as exc:
            print(f'[Direct RSS] {url}: {exc}', flush=True)
    for month in {article['pub_date'][:7] for article in articles}:
        merge_month(month, [article for article in articles if article['pub_date'].startswith(month)])
    return len(articles)


def gdelt_recent(retries=3):
    parameters = urllib.parse.urlencode({
        'query': '(BBCA OR "Bank Central Asia")', 'mode': 'artlist',
        'maxrecords': 250, 'format': 'json', 'timespan': '3months', 'sort': 'datedesc',
    })
    request = urllib.request.Request(
        f'https://api.gdeltproject.org/api/v2/doc/doc?{parameters}',
        headers={'User-Agent': 'Mozilla/5.0'},
    )
    error = None
    payload = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode('utf-8'))
            break
        except Exception as exc:
            error = exc
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    if payload is None:
        print(f'[GDELT] unavailable after {retries} attempts: {error}', flush=True)
        return 0
    articles = []
    for item in payload.get('articles', []):
        raw = str(item.get('seendate', ''))
        try:
            published = datetime.strptime(raw, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).astimezone(WIB)
        except ValueError:
            continue
        title = str(item.get('title', '')).strip()
        if not title or not relevant({'title': title, 'snippet': ''}):
            continue
        articles.append({
            'title': title, 'snippet': '', 'url': item.get('url', ''),
            'source': item.get('domain', 'GDELT'), 'published_utc': raw,
            'published_wib': published.isoformat(), 'pub_date': published.date().isoformat(),
            'pre_closing_ok': (published.hour, published.minute) < (15, 50), 'query': 'GDELT',
            'timing_quality': 'exact',
        })
    for month in {article['pub_date'][:7] for article in articles}:
        merge_month(month, [article for article in articles if article['pub_date'].startswith(month)])
    return len(articles)


def update_recent_all(days=10):
    update_recent(days)
    direct_rss_recent(max(days, 30))
    gdelt_recent()
    reconcile_corpus()
    return audit()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='2016-09-01')
    parser.add_argument('--end', default=date.today().isoformat())
    parser.add_argument('--minimum-per-month', type=int, default=30)
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    expand_historical(date.fromisoformat(args.start), date.fromisoformat(args.end), args.minimum_per_month, args.workers)
    print(f'Direct RSS raw additions: {direct_rss_recent()}')
    print(f'GDELT raw additions: {gdelt_recent()}')
    reconcile_corpus()
    print(json.dumps(audit(), ensure_ascii=False, indent=2))
