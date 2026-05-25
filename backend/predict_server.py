import json
import pickle
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import numpy as np

MODEL_FILE = Path(__file__).resolve().parent.parent / 'xgboost_ohlcv_bundle.pkl'
YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'
SERVER_HOST = '127.0.0.1'
SERVER_PORT = 5000

with open(MODEL_FILE, 'rb') as fp:
    model_bundle = pickle.load(fp)

MODEL = model_bundle['model']
SCALER_X = model_bundle['scaler_X']
SCALER_Y = model_bundle['scaler_y']
FEATURES = model_bundle.get('features', ['open', 'high', 'low', 'close', 'volume'])


def fetch_yahoo_quote(symbol='BBCA.JK', interval='1d', range_='1d'):
    query = urllib.parse.urlencode({'interval': interval, 'range': range_})
    yahoo_url = f'{YAHOO_BASE_URL}/{symbol}?{query}'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://finance.yahoo.com/',
    }
    request = urllib.request.Request(yahoo_url, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode('utf-8')
        return json.loads(body)


class PredictHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ('/', '/predict'):
            self._set_headers(200, 'application/json')
            self.wfile.write(json.dumps({
                'message': 'XGBoost OHLCV prediction server is running.',
                'endpoints': {
                    'predict': '/predict',
                    'yahoo_proxy': '/yahoo?symbol=BBCA.JK&interval=1d&range=1d',
                },
                'method': 'POST',
                'example_payload': {
                    'open': 10100,
                    'high': 10150,
                    'low': 10000,
                    'close': 10025,
                    'volume': 89000000,
                },
            }).encode('utf-8'))
        elif parsed.path == '/yahoo':
            query = urllib.parse.parse_qs(parsed.query)
            symbol = query.get('symbol', ['BBCA.JK'])[0]
            interval = query.get('interval', ['1d'])[0]
            range_ = query.get('range', ['1d'])[0]
            try:
                payload = fetch_yahoo_quote(symbol=symbol, interval=interval, range_=range_)
                self._set_headers(200, 'application/json')
                self.wfile.write(json.dumps(payload).encode('utf-8'))
            except urllib.error.HTTPError as exc:
                self._set_headers(502)
                self.wfile.write(json.dumps({'error': 'Yahoo proxy request failed', 'details': str(exc)}).encode('utf-8'))
            except Exception as exc:
                self._set_headers(502)
                self.wfile.write(json.dumps({'error': 'Yahoo proxy failed', 'details': str(exc)}).encode('utf-8'))
        elif parsed.path == '/favicon.ico':
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'favicon not served'}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))

    def do_POST(self):
        if self.path != '/predict':
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = self.rfile.read(length)
            data = json.loads(payload.decode('utf-8'))

            input_values = [float(data.get(feature, 0.0)) for feature in FEATURES]
            x = np.array([input_values], dtype=np.float32)
            x_scaled = SCALER_X.transform(x)
            y_scaled = MODEL.predict(x_scaled)
            y_pred = SCALER_Y.inverse_transform(y_scaled.reshape(-1, 1))[0, 0]
            prediction_price = float(np.round(y_pred / 25) * 25)

            raw_close = float(data.get('close', 0.0))
            change_pct = (prediction_price - raw_close) / raw_close if raw_close else 0.0
            if change_pct > 0.0035:
                trend = 'Bullish'
            elif change_pct < -0.0035:
                trend = 'Bearish'
            else:
                trend = 'Neutral'

            confidence = float(min(max(0.5 + abs(change_pct) * 1.7, 0.33), 0.99))

            response = {
                'prediction_price': prediction_price,
                'trend': trend,
                'confidence': round(confidence, 2),
            }

            self._set_headers(200)
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as exc:
            self._set_headers(500)
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))


if __name__ == '__main__':
    server = HTTPServer((SERVER_HOST, SERVER_PORT), PredictHandler)
    print(f'Starting XGBoost OHLCV prediction server at http://{SERVER_HOST}:{SERVER_PORT}/predict')
    print('Use Ctrl+C to stop.')
    server.serve_forever()
