import argparse
import hashlib
import json
import math
import os
import pickle
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import MinMaxScaler

FEATURES = ['open', 'high', 'low', 'close', 'volume']
WINDOWS = [1, 10, 20, 30]
TARGET_MODES = ['return', 'price']
TICKER = 'BBCA.JK'
SEED = 42
YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'


def load_csv(path):
    source = Path(path).resolve()
    if not source.is_file():
        raise FileNotFoundError(f'BBCA OHLCV dataset not found: {source}')
    frame = pd.read_csv(source)
    return validate_frame(frame), {'kind': 'file', 'name': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}


def exclude_incomplete_session(frame, result, now_timestamp=None):
    regular = result.get('meta', {}).get('currentTradingPeriod', {}).get('regular', {})
    start = regular.get('start')
    end = regular.get('end')
    timestamps = result.get('timestamp') or []
    now = time.time() if now_timestamp is None else float(now_timestamp)
    if timestamps and isinstance(start, (int, float)) and isinstance(end, (int, float)):
        if start <= timestamps[-1] < end and now < end:
            return frame.iloc[:-1].copy(), True
    return frame, False


def load_yahoo():
    params = urllib.parse.urlencode({'range': '10y', 'interval': '1d'})
    request = urllib.request.Request(
        f'{YAHOO_URL}/{urllib.parse.quote(TICKER)}?{params}',
        headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode('utf-8'))
    results = payload.get('chart', {}).get('result') or []
    if not results:
        raise RuntimeError('Yahoo Finance returned no BBCA history')
    result = results[0]
    quote = (result.get('indicators', {}).get('quote') or [{}])[0]
    frame = pd.DataFrame({
        'date': pd.to_datetime(result['timestamp'], unit='s'),
        **{feature: quote.get(feature) for feature in FEATURES},
    }).dropna(subset=FEATURES)
    frame, excluded_partial = exclude_incomplete_session(frame, result)
    frame = validate_frame(frame)
    canonical = frame.to_csv(index=False, date_format='%Y-%m-%d').encode()
    return frame, {
        'kind': 'yahoo', 'name': TICKER, 'sha256': hashlib.sha256(canonical).hexdigest(),
        'excluded_partial_session': excluded_partial,
    }


def validate_frame(frame):
    required = {'date', *FEATURES}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f'Dataset is missing columns: {", ".join(sorted(missing))}')
    frame = frame[['date', *FEATURES]].copy()
    frame['date'] = pd.to_datetime(frame['date'], errors='raise').dt.tz_localize(None)
    for feature in FEATURES:
        frame[feature] = pd.to_numeric(frame[feature], errors='raise')
    frame = frame.sort_values('date').reset_index(drop=True)
    if frame['date'].duplicated().any():
        raise ValueError('Dataset contains duplicate trading dates')
    values = frame[FEATURES].to_numpy(dtype=np.float64)
    if not np.isfinite(values).all():
        raise ValueError('Dataset contains non-finite OHLCV values')
    if (frame[['open', 'high', 'low', 'close']] <= 0).any().any() or (frame['volume'] < 0).any():
        raise ValueError('Dataset contains invalid price or volume values')
    if len(frame) < 300:
        raise ValueError('At least 300 valid sessions are required')
    return frame


def split_boundaries(row_count):
    train_end = int(row_count * 0.70)
    val_end = train_end + int(row_count * 0.15)
    if train_end < max(WINDOWS) or val_end >= row_count - 1:
        raise ValueError('Dataset is too short for chronological splits')
    return train_end, val_end


def decision_indices(start, end, window):
    # Each sample ending at decision day t predicts close[t+1]. `end` is an
    # exclusive raw-row boundary; end-1 is omitted so its label cannot cross it.
    first = max(start, window - 1)
    return np.arange(first, end - 1, dtype=np.int64)


def make_samples(scaled_features, closes, indices, window, target_mode):
    X = np.asarray([scaled_features[t - window + 1:t + 1].reshape(-1) for t in indices], dtype=np.float32)
    if target_mode == 'price':
        y = closes[indices + 1]
    else:
        y = (closes[indices + 1] - closes[indices]) / closes[indices]
    return X, np.asarray(y, dtype=np.float32)


def model_params(**overrides):
    params = dict(
        objective='reg:squarederror', n_estimators=1000, learning_rate=0.01,
        max_depth=4, subsample=0.7, colsample_bytree=0.7,
        min_child_weight=5, reg_alpha=0.1, reg_lambda=2.0, gamma=0.1,
        eval_metric='rmse', random_state=SEED, verbosity=0,
    )
    params.update(overrides)
    return params


def as_price(prediction, closes, indices, target_mode):
    return prediction if target_mode == 'price' else closes[indices] * (1.0 + prediction)


def metrics(prediction, closes, indices):
    actual = closes[indices + 1]
    current = closes[indices]
    return {
        'mae_idr': float(np.mean(np.abs(prediction - actual))),
        'rmse_idr': float(math.sqrt(np.mean((prediction - actual) ** 2))),
        'directional_accuracy': float(np.mean(np.sign(prediction - current) == np.sign(actual - current))),
    }


def train(frame, provenance, output_path):
    train_end, val_end = split_boundaries(len(frame))
    raw = frame[FEATURES].to_numpy(dtype=np.float64)
    closes = frame['close'].to_numpy(dtype=np.float64)
    evaluation_scaler = MinMaxScaler().fit(raw[:train_end])
    scaled = evaluation_scaler.transform(raw)
    candidates = []

    for target_mode in TARGET_MODES:
        for window in WINDOWS:
            train_idx = decision_indices(0, train_end, window)
            val_idx = decision_indices(train_end, val_end, window)
            X_train, y_train = make_samples(scaled, closes, train_idx, window, target_mode)
            X_val, y_val = make_samples(scaled, closes, val_idx, window, target_mode)
            model = xgb.XGBRegressor(**model_params(early_stopping_rounds=50))
            model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
            val_price = as_price(model.predict(X_val), closes, val_idx, target_mode)
            candidates.append({
                'target_mode': target_mode,
                'window': window,
                'validation': metrics(val_price, closes, val_idx),
                'best_iteration': int(model.best_iteration),
                '_model': model,
            })

    selected = min(candidates, key=lambda item: (item['validation']['mae_idr'], item['window'], item['target_mode']))
    test_idx = decision_indices(val_end, len(frame), selected['window'])
    X_test, _ = make_samples(scaled, closes, test_idx, selected['window'], selected['target_mode'])
    test_price = as_price(selected['_model'].predict(X_test), closes, test_idx, selected['target_mode'])
    test_metrics = metrics(test_price, closes, test_idx)

    # Deployment fit happens only after the untouched test report is fixed.
    # Hyperparameters and tree count are locked from validation; no test result
    # influences the deployed configuration.
    deployment_scaler = MinMaxScaler().fit(raw)
    deployment_scaled = deployment_scaler.transform(raw)
    deployment_idx = decision_indices(0, len(frame), selected['window'])
    X_deploy, y_deploy = make_samples(
        deployment_scaled, closes, deployment_idx, selected['window'], selected['target_mode']
    )
    deployment_model = xgb.XGBRegressor(**model_params(n_estimators=selected['best_iteration'] + 1))
    deployment_model.fit(X_deploy, y_deploy, verbose=False)

    candidate_report = [{k: v for k, v in item.items() if k != '_model'} for item in candidates]
    bundle = {
        'bundle_version': 3,
        'model': deployment_model,
        'scaler_X': deployment_scaler,
        'features': FEATURES,
        'timestep': selected['window'],
        'ticker': TICKER,
        'target_mode': selected['target_mode'],
        'lineage': {
            **provenance,
            'framework': 'AgenticBBCA chronological XGBoost benchmark',
            'source_first_date': frame['date'].iloc[0].strftime('%Y-%m-%d'),
            'source_last_date': frame['date'].iloc[-1].strftime('%Y-%m-%d'),
            'selection_metric': 'validation MAE IDR',
            'train_rows': train_end,
            'validation_rows': val_end - train_end,
            'test_rows': len(frame) - val_end,
            'purge_sessions_at_each_boundary': 1,
            'deployment_fit_rows': len(frame),
        },
        'selection': {
            'selected_target_mode': selected['target_mode'],
            'selected_window': selected['window'],
            'selected_best_iteration': selected['best_iteration'],
            'candidates': candidate_report,
        },
        'evaluation': {'untouched_test': test_metrics},
    }
    destination = Path(output_path).resolve()
    temporary = destination.with_name(f'{destination.name}.tmp')
    with temporary.open('wb') as stream:
        pickle.dump(bundle, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, destination)
    print(f'Wrote leakage-controlled model bundle: {destination}')
    print(f'Data: {frame["date"].iloc[0].date()} to {frame["date"].iloc[-1].date()} ({len(frame)} rows)')
    print(f'Selected: target={selected["target_mode"]}, window={selected["window"]}, trees={selected["best_iteration"] + 1}')
    print(f'Validation MAE: IDR {selected["validation"]["mae_idr"]:,.2f}')
    print(f'Untouched test: MAE IDR {test_metrics["mae_idr"]:,.2f}, DA {test_metrics["directional_accuracy"]:.1%}')
    return bundle


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Retrain the BBCAML BBCA model with purged chronological evaluation.')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--data', help='Path to a BBCA OHLCV CSV')
    source.add_argument('--yahoo', action='store_true', help='Fail-fast download of current BBCA.JK history')
    parser.add_argument('--output', default=Path(__file__).resolve().parent.parent / 'xgboost_ohlcv_bundle.pkl')
    args = parser.parse_args()
    source_frame, source_provenance = load_yahoo() if args.yahoo else load_csv(args.data)
    train(source_frame, source_provenance, args.output)
