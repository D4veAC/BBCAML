import json
import math
import os
import pickle
import urllib.parse
import urllib.request
import threading
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
from dotenv import load_dotenv

load_dotenv()

MODEL_FILE = Path(os.environ.get('MODEL_FILE', Path(__file__).resolve().parent.parent / 'xgboost_ohlcv_bundle.pkl'))
MODEL_LOCK = threading.RLock()
MODEL_READY = True
MODEL_ERROR = None

def read_bundle(path):
    with Path(path).open('rb') as fp:
        return pickle.load(fp)

model_bundle = read_bundle(MODEL_FILE)
MODEL = model_bundle['model']
SCALER_X = model_bundle['scaler_X']
FEATURES = model_bundle['features']
TIMESTEP = int(model_bundle['timestep'])
TICKER = model_bundle['ticker']
TARGET_MODE = model_bundle.get('target_mode')
TARGET_SCALE = float(model_bundle.get('target_scale', 1.0))
BUNDLE_VERSION = model_bundle.get('bundle_version')
YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

class ModelInputMismatch(RuntimeError):
    pass

class MarketHistoryUnavailable(RuntimeError):
    pass

class ModelUnavailable(RuntimeError):
    pass

def bundle_compatible(bundle):
    features = bundle.get('features')
    timestep = bundle.get('timestep')
    model = bundle.get('model')
    scaler = bundle.get('scaler_X')
    return (
        bundle.get('bundle_version') == 4
        and bundle.get('target_mode') in ('price', 'return')
        and bundle.get('ticker') == 'BBCA.JK'
        and features == ['open', 'high', 'low', 'close', 'volume']
        and timestep in (1, 10, 20, 30)
        and model is not None
        and scaler is not None
        and model.get_booster().num_features() == timestep * len(features)
        and scaler.n_features_in_ == len(features)
        and bundle.get('target_scale') in (1.0, 10_000.0)
        and any('[f' in tree for tree in model.get_booster().get_dump())
    )

def install_bundle(bundle):
    global model_bundle, MODEL, SCALER_X, FEATURES, TIMESTEP, TICKER, TARGET_MODE, TARGET_SCALE, BUNDLE_VERSION
    if not bundle_compatible(bundle):
        raise ModelInputMismatch('The model and its input configuration are incompatible')
    with MODEL_LOCK:
        model_bundle = bundle
        MODEL = bundle['model']
        SCALER_X = bundle['scaler_X']
        FEATURES = bundle['features']
        TIMESTEP = int(bundle['timestep'])
        TICKER = bundle['ticker']
        TARGET_MODE = bundle['target_mode']
        TARGET_SCALE = float(bundle['target_scale'])
        BUNDLE_VERSION = bundle['bundle_version']

def retrain_model():
    global MODEL_READY, MODEL_ERROR
    with MODEL_LOCK:
        MODEL_READY = False
        MODEL_ERROR = 'Scheduled retraining is in progress'
    candidate_path = MODEL_FILE.with_name(f'{MODEL_FILE.name}.candidate')
    try:
        try:
            from backend.train_model import load_yahoo, train
        except ImportError:
            from train_model import load_yahoo, train
        frame, provenance = load_yahoo()
        train(frame, provenance, candidate_path)
        candidate = read_bundle(candidate_path)
        install_bundle(candidate)
        os.replace(candidate_path, MODEL_FILE)
        with MODEL_LOCK:
            MODEL_READY = True
            MODEL_ERROR = None
        print(f'[Retrain] Installed model using data through {candidate["lineage"]["source_last_date"]}', flush=True)
        if os.environ.get('NEWS_UPDATE_DAILY', 'true').lower() in ('1', 'true', 'yes'):
            try:
                try:
                    from backend.news_expand import update_recent_all
                except ImportError:
                    from news_expand import update_recent_all
                manifest = update_recent_all(int(os.environ.get('NEWS_REFRESH_DAYS', '10')))
                print(f'[News] Corpus updated: {manifest["articles"]} articles through {manifest["date_max"]}', flush=True)
            except Exception as news_error:
                print(f'[News] Update failed; price model remains available: {news_error}', flush=True)
        return True
    except Exception as exc:
        with MODEL_LOCK:
            MODEL_READY = False
            MODEL_ERROR = str(exc)
        candidate_path.unlink(missing_ok=True)
        print(f'[Retrain] Failed; inference remains unavailable: {exc}', flush=True)
        return False

def next_retrain_time(now, clock):
    hour, minute = (int(part) for part in clock.split(':', 1))
    scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return scheduled if scheduled > now else scheduled + timedelta(days=1)

def retrain_scheduler(retry_pending=False):
    timezone = ZoneInfo(os.environ.get('AUTO_RETRAIN_TIMEZONE', 'Asia/Jakarta'))
    clock = os.environ.get('AUTO_RETRAIN_TIME', '18:00')
    retry_seconds = max(60, int(os.environ.get('AUTO_RETRAIN_RETRY_SECONDS', '900')))
    while True:
        if not retry_pending:
            scheduled = next_retrain_time(datetime.now(timezone), clock)
            threading.Event().wait(max(1.0, (scheduled - datetime.now(timezone)).total_seconds()))
        while not retrain_model():
            threading.Event().wait(retry_seconds)
        retry_pending = False

def validate_session(data):
    if not isinstance(data, dict):
        raise ValueError('Expected an input object')
    required = set(FEATURES) | {'open', 'high', 'low', 'close', 'volume'}
    for feature in required:
        value = data.get(feature)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'Missing or invalid feature: {feature}')
    if min(data[key] for key in ('open', 'high', 'low', 'close')) <= 0 or data['volume'] < 0:
        raise ValueError('Prices must be positive and volume non-negative')
    if data['high'] < max(data['open'], data['close'], data['low']) or data['low'] > min(data['open'], data['close']):
        raise ValueError('Inconsistent session prices')
    return [float(data[feature]) for feature in FEATURES]

def fetch_recent_sessions():
    params = urllib.parse.urlencode({'interval': '1d', 'range': '6mo'})
    request = urllib.request.Request(
        f'{YAHOO_CHART_URL}/{urllib.parse.quote(TICKER)}?{params}',
        headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except Exception as exc:
        raise MarketHistoryUnavailable('Historical market data is unavailable') from exc

    result = payload.get('chart', {}).get('result') or []
    if not result:
        raise MarketHistoryUnavailable('Historical market data is unavailable')
    quote = (result[0].get('indicators', {}).get('quote') or [{}])[0]
    rows = []
    length = max((len(quote.get(feature) or []) for feature in FEATURES), default=0)
    for index in range(length):
        row = []
        for feature in FEATURES:
            values = quote.get(feature) or []
            value = values[index] if index < len(values) else None
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                row = []
                break
            row.append(float(value))
        if row:
            rows.append(row)
    return rows

def same_session(left, right):
    price_matches = all(math.isclose(left[index], right[index], abs_tol=0.5) for index in range(4))
    volume_tolerance = max(1.0, abs(right[4]) * 0.0001)
    return price_matches and math.isclose(left[4], right[4], abs_tol=volume_tolerance)

def build_sequence(current_session, history_rows=None):
    rows = list(history_rows if history_rows is not None else fetch_recent_sessions())
    if rows and same_session(rows[-1], current_session):
        rows.pop()
    required_history = TIMESTEP - 1
    if len(rows) < required_history:
        raise MarketHistoryUnavailable(f'At least {required_history} prior market sessions are required')
    return np.array([*rows[-required_history:], current_session], dtype=np.float64)

def predict(data, history_rows=None):
    with MODEL_LOCK:
        if not MODEL_READY:
            raise ModelUnavailable(MODEL_ERROR or 'The model is unavailable')
        current_session = validate_session(data)
        if not bundle_compatible(model_bundle):
            raise ModelInputMismatch('The model and its input configuration are incompatible')
        expected_model_features = TIMESTEP * len(FEATURES)
        sequence = build_sequence(current_session, history_rows)
        scaled_sequence = SCALER_X.transform(sequence).reshape(1, expected_model_features)
        y = MODEL.predict(scaled_sequence)
        price = float(y[0] if TARGET_MODE == 'price' else current_session[FEATURES.index('close')] * (1.0 + y[0] / TARGET_SCALE))
    if not math.isfinite(price) or price <= 0:
        raise RuntimeError('Model returned an invalid price')
    return {'prediction_price': price}

class PredictHandler(BaseHTTPRequestHandler):
    def respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body, allow_nan=False).encode())

    def do_POST(self):
        if self.path != '/predict':
            return self.respond(404, {'error': 'Endpoint not found'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(length))
            self.respond(200, predict(data))
        except ModelInputMismatch:
            self.respond(503, {'error': 'The model and its input configuration are incompatible', 'code': 'MODEL_INPUT_MISMATCH'})
        except ModelUnavailable:
            self.respond(503, {'error': 'The model is unavailable', 'code': 'MODEL_UNAVAILABLE'})
        except MarketHistoryUnavailable:
            self.respond(503, {'error': 'Historical market data is unavailable', 'code': 'MARKET_HISTORY_UNAVAILABLE'})
        except (ValueError, TypeError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': 'Model prediction failed'})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != '/news':
            return self.respond(404, {'error': 'Endpoint not found'})
        try:
            try:
                from backend.news_service import get_news
            except ImportError:
                from news_service import get_news
            query = urllib.parse.parse_qs(parsed.query)
            as_of = (query.get('date') or [datetime.now(ZoneInfo('Asia/Jakarta')).date().isoformat()])[0]
            self.respond(200, get_news(as_of))
        except ValueError as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(503, {'error': 'News is unavailable'})

if __name__ == '__main__':
    if os.environ.get('AUTO_RETRAIN_DAILY', 'false').lower() in ('1', 'true', 'yes'):
        start_ok = retrain_model() if os.environ.get('AUTO_RETRAIN_ON_START', 'true').lower() in ('1', 'true', 'yes') else True
        threading.Thread(target=retrain_scheduler, args=(not start_ok,), name='daily-model-retrain', daemon=True).start()
    ThreadingHTTPServer((os.environ.get('PREDICT_HOST', '127.0.0.1'), int(os.environ.get('PREDICT_PORT', '5000'))), PredictHandler).serve_forever()
