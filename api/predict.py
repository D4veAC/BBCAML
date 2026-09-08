"""
Vercel Python Serverless Function — /api/predict

Wraps the existing predict_server logic as a Vercel-compatible handler.
The model bundle (.pkl) is loaded once at cold start and reused across warm requests.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Make backend/ importable from the project root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.predict_server import (  # noqa: E402
    ModelInputMismatch,
    MarketHistoryUnavailable,
    ModelUnavailable,
    predict,
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(length))
            self._respond(200, predict(data))
        except ModelInputMismatch:
            self._respond(503, {
                'error': 'The model and its input configuration are incompatible',
                'code': 'MODEL_INPUT_MISMATCH',
            })
        except ModelUnavailable as exc:
            self._respond(503, {'error': str(exc), 'code': 'MODEL_UNAVAILABLE'})
        except MarketHistoryUnavailable:
            self._respond(503, {
                'error': 'Historical market data is unavailable',
                'code': 'MARKET_HISTORY_UNAVAILABLE',
            })
        except (ValueError, TypeError) as exc:
            self._respond(400, {'error': str(exc)})
        except Exception:
            self._respond(500, {'error': 'Model prediction failed'})

    def _respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body, allow_nan=False).encode())

    def log_message(self, *_):  # silence access logs
        pass
