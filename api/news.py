"""
Vercel Python Serverless Function — /api/news

Wraps news_service.get_news() as a Vercel-compatible handler.
"""
import json
import sys
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.news_service import get_news  # noqa: E402

WIB = ZoneInfo('Asia/Jakarta')


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            as_of = (query.get('date') or [datetime.now(WIB).date().isoformat()])[0]
            self._respond(200, get_news(as_of))
        except ValueError as exc:
            self._respond(400, {'error': str(exc)})
        except Exception:
            self._respond(503, {'error': 'News is unavailable'})

    def _respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(body, allow_nan=False).encode())

    def log_message(self, *_):
        pass
