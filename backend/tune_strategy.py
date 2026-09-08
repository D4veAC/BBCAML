import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import MinMaxScaler

from backend.train_model import FEATURES, SEED, TARGET_SCALES, load_yahoo, make_samples, model_params

MODEL_SPECS = [('return', 10), ('return', 20), ('price', 10), ('price', 20)]
MIN_TRAIN_ROWS = 1000
TUNING_ROWS = 126
FORWARD_ROWS = 63
BUY_FEE = 0.0015
SELL_FEE = 0.0025
SLIPPAGE = 0.0005
ENTRY_THRESHOLDS = [0.0, 0.00025, 0.0005, 0.00075, 0.001]
EXIT_THRESHOLDS = [0.0, 0.0015]
ATR_MULTIPLIERS = [1.5, 2.0, 2.5, 3.0]
TREND_GATES = ['sma50', 'sma200_uptrend']
CONFIRMATION_DAYS = [2, 3]
BREAKOUT_ATR_BUFFERS = [0.0, 0.25, 0.5]
TAKE_PROFIT_ATR_MULTIPLIERS = [None, 3.0, 5.0]


def technicals(frame):
    close = frame['close']
    high = frame['high']
    low = frame['low']
    previous = close.shift(1)
    true_range = pd.concat([high - low, (high - previous).abs(), (low - previous).abs()], axis=1).max(axis=1)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    relative_strength = gain / (loss + 1e-12)
    return {
        'atr': true_range.rolling(14).mean().to_numpy(dtype=np.float64),
        'sma20': close.rolling(20).mean().to_numpy(dtype=np.float64),
        'sma50': close.rolling(50).mean().to_numpy(dtype=np.float64),
        'sma200': close.rolling(200).mean().to_numpy(dtype=np.float64),
        'rsi14': (100.0 - 100.0 / (1.0 + relative_strength)).to_numpy(dtype=np.float64),
        'prior_high20': high.rolling(20).max().shift(1).to_numpy(dtype=np.float64),
        'volume_median20': frame['volume'].rolling(20).median().to_numpy(dtype=np.float64),
    }


def fit_predict_before(frame, train_end, prediction_indices, target_mode, window):
    """Fit using rows before train_end and predict later decision rows."""
    inner_train_end = int(train_end * 0.85)
    raw = frame[FEATURES].to_numpy(dtype=np.float64)
    closes = frame['close'].to_numpy(dtype=np.float64)
    scaler = MinMaxScaler().fit(raw[:inner_train_end])
    scaled = scaler.transform(raw)

    # Purge the boundary decision rows because their t+1 label touches the next split.
    train_indices = np.arange(window - 1, inner_train_end - 1, dtype=np.int64)
    validation_indices = np.arange(inner_train_end, train_end - 1, dtype=np.int64)
    X_train, y_train = make_samples(scaled, closes, train_indices, window, target_mode)
    X_validation, y_validation = make_samples(scaled, closes, validation_indices, window, target_mode)
    model = xgb.XGBRegressor(**model_params(early_stopping_rounds=50))
    model.fit(X_train, y_train, eval_set=[(X_validation, y_validation)], verbose=False)

    prediction_indices = np.asarray(prediction_indices, dtype=np.int64)
    X_prediction, _ = make_samples(scaled, closes, prediction_indices, window, target_mode)
    prediction = model.predict(X_prediction)
    if target_mode == 'price':
        prediction = (prediction - closes[prediction_indices]) / closes[prediction_indices]
    else:
        prediction = prediction / TARGET_SCALES['return']
    return prediction, int(model.best_iteration)


def simulate(frame, indices, forecasts, indicators, config, entry_permissions=None):
    open_price = frame['open'].to_numpy(dtype=np.float64)
    close = frame['close'].to_numpy(dtype=np.float64)
    low = frame['low'].to_numpy(dtype=np.float64)
    high = frame['high'].to_numpy(dtype=np.float64)
    volume = frame['volume'].to_numpy(dtype=np.float64)
    equity = 1.0
    peak = 1.0
    max_drawdown = 0.0
    position = False
    trailing_stop = 0.0
    profit_target = math.inf
    trades = 0
    changes = 0
    bullish_streak = 0
    entry_age = 0
    early_stop_exits = 0
    take_profit_exits = 0
    blocked_entries = 0
    invalidated_at_open = 0

    for offset, day in enumerate(indices):
        price = close[day]
        execution_open = open_price[day + 1]
        atr = indicators['atr'][day]
        gate = config['trend_gate']
        if gate == 'sma50':
            gate_ok = price >= indicators['sma50'][day]
        elif gate == 'sma200_uptrend':
            gate_ok = (
                price >= indicators['sma200'][day]
                and indicators['sma50'][day] >= indicators['sma200'][day]
            )
        else:
            gate_ok = True
        forecast = float(forecasts[offset])
        bullish_streak = bullish_streak + 1 if forecast > config['entry_threshold'] else 0
        breakout_buffer = config['breakout_atr_buffer']
        breakout_ok = True
        open_confirmation_ok = True
        if breakout_buffer is not None:
            prior_high = indicators['prior_high20'][day]
            median_volume = indicators['volume_median20'][day]
            breakout_level = prior_high + breakout_buffer * atr
            breakout_ok = (
                math.isfinite(prior_high) and math.isfinite(median_volume)
                and price > breakout_level
                and volume[day] >= median_volume
            )
            open_confirmation_ok = execution_open > breakout_level
        entry_this_session = False

        # A position carried from day t captures the overnight move into t+1.
        # A new signal cannot capture that gap because complete day-t OHLCV is
        # only known after the close and is executed at the next open.
        if position:
            equity *= execution_open / price
            trailing_stop = max(trailing_stop, price - config['atr_multiplier'] * atr)
            if forecast < -config['exit_threshold']:
                position = False
                equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
                changes += 1
        entry_ready = bullish_streak >= config['confirmation_days'] and gate_ok and breakout_ok
        permission = True if entry_permissions is None else bool(entry_permissions[offset])
        if not position and entry_ready and not permission:
            blocked_entries += 1
        elif not position and entry_ready and not open_confirmation_ok:
            invalidated_at_open += 1
            bullish_streak = 0
        elif not position and entry_ready:
            position = True
            trailing_stop = execution_open - config['atr_multiplier'] * atr
            take_profit_atr = config.get('take_profit_atr')
            profit_target = (
                execution_open + take_profit_atr * atr
                if take_profit_atr is not None else math.inf
            )
            equity *= 1.0 - BUY_FEE
            trades += 1
            changes += 1
            entry_age = 0
            entry_this_session = True

        if position:
            next_close = close[day + 1]
            next_low = low[day + 1]
            next_high = high[day + 1]
            entry_fill = execution_open * (1.0 + SLIPPAGE) if entry_this_session else execution_open
            if next_low <= trailing_stop:
                # A gap below the stop fills at the open, not the stale stop.
                stop_fill = min(trailing_stop, execution_open) * (1.0 - SLIPPAGE)
                equity *= stop_fill / entry_fill
                equity *= 1.0 - SELL_FEE
                if entry_age < 3:
                    early_stop_exits += 1
                position = False
                bullish_streak = 0
                changes += 1
            elif next_high >= profit_target:
                # If both stop and target occur in one daily candle, the stop
                # branch above wins. This avoids assuming a favorable intraday order.
                target_fill = profit_target * (1.0 - SLIPPAGE)
                equity *= target_fill / entry_fill
                equity *= 1.0 - SELL_FEE
                position = False
                bullish_streak = 0
                take_profit_exits += 1
                changes += 1
            else:
                equity *= next_close / entry_fill
                entry_age += 1

        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1.0)

    if position:
        equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
        changes += 1
    net_return = equity - 1.0
    # Risk-adjusted selection score, fully computed inside the tuning window.
    score = net_return - 0.50 * abs(max_drawdown) - 0.00025 * changes - 0.0025 * early_stop_exits
    return {
        'net_return': net_return,
        'max_drawdown': max_drawdown,
        'trades': trades,
        'position_changes': changes,
        'early_stop_exits': early_stop_exits,
        'take_profit_exits': take_profit_exits,
        'blocked_entries': blocked_entries,
        'invalidated_at_open': invalidated_at_open,
        'score': score,
    }


def candidates():
    for entry in ENTRY_THRESHOLDS:
        for exit_value in EXIT_THRESHOLDS:
            for atr in ATR_MULTIPLIERS:
                for gate in TREND_GATES:
                    for confirmation_days in CONFIRMATION_DAYS:
                        for breakout_buffer in BREAKOUT_ATR_BUFFERS:
                            for take_profit_atr in TAKE_PROFIT_ATR_MULTIPLIERS:
                                yield {
                                    'entry_threshold': entry,
                                    'exit_threshold': exit_value,
                                    'atr_multiplier': atr,
                                    'take_profit_atr': take_profit_atr,
                                    'trend_gate': gate,
                                    'confirmation_days': confirmation_days,
                                    'breakout_atr_buffer': breakout_buffer,
                                }


def run(output_path):
    frame, provenance = load_yahoo()
    indicator_values = technicals(frame)
    close = frame['close'].to_numpy(dtype=np.float64)
    fold_reports = []
    compounded_strategy = 1.0
    compounded_benchmark = 1.0
    selected_counts = Counter()

    for forward_start in range(MIN_TRAIN_ROWS, len(frame) - 1, FORWARD_ROWS):
        forward_end = min(forward_start + FORWARD_ROWS, len(frame) - 1)
        tuning_start = forward_start - TUNING_ROWS
        tuning_indices = np.arange(tuning_start, forward_start - 1, dtype=np.int64)
        forward_indices = np.arange(forward_start, forward_end, dtype=np.int64)

        scored = []
        selector_iterations = {}
        for target_mode, window in MODEL_SPECS:
            tuning_forecasts, selector_iteration = fit_predict_before(
                frame, tuning_start, tuning_indices, target_mode, window,
            )
            selector_iterations[f'{target_mode}:{window}'] = selector_iteration
            for config in candidates():
                selected_config = {**config, 'target_mode': target_mode, 'window': window}
                scored.append((simulate(frame, tuning_indices, tuning_forecasts, indicator_values, selected_config), selected_config))
        tuning_result, selected = max(
            scored,
            key=lambda item: (
                item[0]['score'], item[0]['net_return'], -item[0]['position_changes'],
                -item[1]['entry_threshold'], -item[1]['atr_multiplier'], not item[1]['trend_gate'],
            ),
        )

        forward_forecasts, live_iteration = fit_predict_before(
            frame, forward_start, forward_indices, selected['target_mode'], selected['window'],
        )
        forward_result = simulate(frame, forward_indices, forward_forecasts, indicator_values, selected)
        benchmark_return = (
            frame['close'].iloc[forward_end] * (1.0 - SLIPPAGE)
            / (frame['open'].iloc[forward_start + 1] * (1.0 + SLIPPAGE))
            * (1.0 - BUY_FEE) * (1.0 - SELL_FEE) - 1.0
        )
        compounded_strategy *= 1.0 + forward_result['net_return']
        compounded_benchmark *= 1.0 + benchmark_return
        key = json.dumps(selected, sort_keys=True)
        selected_counts[key] += 1
        fold_reports.append({
            'start': frame['date'].iloc[forward_start].strftime('%Y-%m-%d'),
            'end': frame['date'].iloc[forward_end].strftime('%Y-%m-%d'),
            'selected': selected,
            'tuning': tuning_result,
            'forward': forward_result,
            'benchmark_return': benchmark_return,
            'selector_best_iterations': selector_iterations,
            'live_best_iteration': live_iteration,
        })

    strategy_return = compounded_strategy - 1.0
    benchmark_return = compounded_benchmark - 1.0
    report = {
        'protocol': {
            'name': 'nested rolling-origin strategy tuning',
            'model': 'XGBoost OHLCV; nested choice of next-session return/price targets and windows 10/20',
            'minimum_training_rows': MIN_TRAIN_ROWS,
            'tuning_rows': TUNING_ROWS,
            'forward_rows': FORWARD_ROWS,
            'buy_fee': BUY_FEE,
            'sell_fee': SELL_FEE,
            'slippage_per_execution': SLIPPAGE,
            'selection_score': 'net_return - 0.50*abs(max_drawdown) - 0.00025*position_changes - 0.0025*early_stop_exits',
            'false_breakout_controls': '2-3 forecast confirmations; required prior-20-day-high ATR buffer with median-volume confirmation; SMA50 or SMA200 uptrend regime gate',
            'fold_boundary_policy': 'flat at start and liquidated at end',
            'benchmark': 'next-open buy-and-hold reset per fold with entry and exit fees',
            'signal_execution': 'complete day-t OHLCV; execute at day-(t+1) open',
            'stop_fill_assumption': 'known trailing stop; gap below stop fills at next open',
            'candidate_count': len(list(candidates())) * len(MODEL_SPECS),
        },
        'source': provenance,
        'period': {'start': fold_reports[0]['start'], 'end': fold_reports[-1]['end']},
        'folds': len(fold_reports),
        'strategy_return': strategy_return,
        'benchmark_return': benchmark_return,
        'alpha': strategy_return - benchmark_return,
        'selected_configuration_counts': dict(selected_counts),
        'fold_reports': fold_reports,
    }
    destination = Path(output_path).resolve()
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote: {destination}')
    print(f'Folds: {len(fold_reports)} | {report["period"]["start"]} to {report["period"]["end"]}')
    print(f'Strategy: {strategy_return:+.2%} | Fold-reset benchmark: {benchmark_return:+.2%} | Alpha: {report["alpha"]:+.2%}')
    for config, count in selected_counts.most_common():
        print(f'{count:>2} folds: {config}')
    return report


if __name__ == '__main__':
    run(Path(__file__).resolve().parent.parent / 'strategy_tuning_report.json')
