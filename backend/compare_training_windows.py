"""Compare BBCA training start dates on identical validation and test periods."""
import json
from pathlib import Path

import numpy as np
import xgboost as xgb
from sklearn.preprocessing import MinMaxScaler

from backend.train_model import (
    FEATURES, TARGET_MODES, WINDOWS, as_price, load_yahoo, make_samples, metrics, model_params,
)

START_DATES = ['2016-09-01', '2020-01-01', '2022-01-01']


def first_index_on_or_after(frame, date):
    matches = np.flatnonzero(frame['date'].to_numpy() >= np.datetime64(date))
    if not len(matches):
        raise ValueError(f'No rows on or after {date}')
    return int(matches[0])


def evaluate_start(frame, start_date, train_end, validation_end):
    start = first_index_on_or_after(frame, start_date)
    raw = frame[FEATURES].to_numpy(dtype=np.float64)
    closes = frame['close'].to_numpy(dtype=np.float64)
    scaler = MinMaxScaler().fit(raw[start:train_end])
    scaled = scaler.transform(raw)
    candidates = []

    for target_mode in TARGET_MODES:
        for window in WINDOWS:
            train_indices = np.arange(start + window - 1, train_end - 1, dtype=np.int64)
            validation_indices = np.arange(train_end, validation_end - 1, dtype=np.int64)
            X_train, y_train = make_samples(scaled, closes, train_indices, window, target_mode)
            X_validation, y_validation = make_samples(scaled, closes, validation_indices, window, target_mode)
            model = xgb.XGBRegressor(**model_params(early_stopping_rounds=50))
            model.fit(X_train, y_train, eval_set=[(X_validation, y_validation)], verbose=False)
            validation_price = as_price(model.predict(X_validation), closes, validation_indices, target_mode)
            candidates.append({
                'target_mode': target_mode,
                'window': window,
                'best_iteration': int(model.best_iteration),
                'validation': metrics(validation_price, closes, validation_indices),
                '_model': model,
            })

    selected = min(candidates, key=lambda item: (item['validation']['mae_idr'], item['window'], item['target_mode']))
    test_indices = np.arange(validation_end, len(frame) - 1, dtype=np.int64)
    X_test, _ = make_samples(scaled, closes, test_indices, selected['window'], selected['target_mode'])
    test_price = as_price(selected['_model'].predict(X_test), closes, test_indices, selected['target_mode'])
    return {
        'training_start': frame['date'].iloc[start].strftime('%Y-%m-%d'),
        'training_rows': train_end - start,
        'selected_target_mode': selected['target_mode'],
        'selected_window': selected['window'],
        'selected_best_iteration': selected['best_iteration'],
        'validation': selected['validation'],
        'untouched_test': metrics(test_price, closes, test_indices),
        'candidates': [{k: v for k, v in item.items() if k != '_model'} for item in candidates],
    }


def run(output_path):
    frame, provenance = load_yahoo()
    base_start = first_index_on_or_after(frame, '2022-01-01')
    comparable_rows = len(frame) - base_start
    train_end = base_start + int(comparable_rows * 0.70)
    validation_end = train_end + int(comparable_rows * 0.15)
    results = [evaluate_start(frame, start, train_end, validation_end) for start in START_DATES]
    report = {
        'protocol': 'same validation/test dates; one-session purged split boundaries; validation-only selection',
        'source': provenance,
        'validation_period': [
            frame['date'].iloc[train_end].strftime('%Y-%m-%d'),
            frame['date'].iloc[validation_end - 1].strftime('%Y-%m-%d'),
        ],
        'untouched_test_period': [
            frame['date'].iloc[validation_end].strftime('%Y-%m-%d'),
            frame['date'].iloc[-1].strftime('%Y-%m-%d'),
        ],
        'results': results,
    }
    destination = Path(output_path).resolve()
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Validation: {report["validation_period"][0]} to {report["validation_period"][1]}')
    print(f'Untouched test: {report["untouched_test_period"][0]} to {report["untouched_test_period"][1]}')
    for result in results:
        test = result['untouched_test']
        print(
            f'{result["training_start"]}: target={result["selected_target_mode"]}, '
            f'window={result["selected_window"]}, test MAE=IDR {test["mae_idr"]:,.2f}, '
            f'RMSE=IDR {test["rmse_idr"]:,.2f}'
        )
    print(f'Wrote: {destination}')
    return report


if __name__ == '__main__':
    run(Path(__file__).resolve().parent.parent / 'training_window_comparison.json')
