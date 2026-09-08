import json
from pathlib import Path

from backend.news_retriever import load_articles


ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / 'server'


def export():
    SERVER.mkdir(exist_ok=True)
    articles = [{key: item.get(key, '') for key in ('title', 'source', 'url', 'pub_date', 'published_wib')}
                for item in load_articles() if item.get('title') and item.get('pub_date')]
    (SERVER / 'news-corpus.json').write_text(json.dumps(articles, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'Wrote {len(articles)} articles and deployment artifacts to {SERVER}')


if __name__ == '__main__':
    export()
