import json
import math
from pathlib import Path

import numpy as np

from backend.train_model import load_csv
from backend.tune_strategy import (
    BUY_FEE, FORWARD_ROWS, MIN_TRAIN_ROWS, SELL_FEE, SLIPPAGE,
    fit_predict_before, technicals,
)

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / 'data' / 'bbca_ohlcv_snapshot.csv'
XGB_THRESHOLD = 0.0
XGB_RSI_CAP = 45.0
XGB_EXIT_RSI = 60.0
XGB_CONFIRMATIONS = 2
RSI_ENTRY = 30.0
RSI_EXIT = 50.0


def walk_forward_forecasts(frame):
    forecasts = np.full(len(frame), np.nan, dtype=np.float64)
    for start in range(MIN_TRAIN_ROWS, len(frame) - 1, FORWARD_ROWS):
        end = min(start + FORWARD_ROWS, len(frame) - 1)
        indices = np.arange(start, end, dtype=np.int64)
        prediction, _ = fit_predict_before(frame, start, indices, 'return', 20)
        forecasts[indices] = prediction
    return forecasts


def simulate_path(frame, forecasts, start, end, indicators=None):
    values = technicals(frame) if indicators is None else indicators
    close = frame['close'].to_numpy(dtype=np.float64)
    open_price = frame['open'].to_numpy(dtype=np.float64)
    high = frame['high'].to_numpy(dtype=np.float64)
    rsi = values['rsi14']
    sma200 = values['sma200']
    equity = peak = 1.0
    max_drawdown = 0.0
    position = False
    source = None
    trades = wins = rsi_entries = xgb_entries = recovery_entries = 0
    entry_equity = 0.0
    entry_fill = 0.0
    trade_log = []
    points = [{'date': frame['date'].iloc[start].strftime('%Y-%m-%d'), 'strategy': 1.0}]

    for day in range(start, end):
        execution_open = open_price[day + 1]
        if position:
            equity *= execution_open / close[day]

        forecast = float(forecasts[day])
        regime_ok = math.isfinite(sma200[day]) and close[day] > sma200[day]
        positive_confirmation = (
            day >= start + XGB_CONFIRMATIONS - 1
            and all(
                math.isfinite(float(forecasts[index]))
                and float(forecasts[index]) > XGB_THRESHOLD
                for index in range(day - XGB_CONFIRMATIONS + 1, day + 1)
            )
        )
        rsi_entry = not position and regime_ok and rsi[day] < RSI_ENTRY
        xgb_entry = (
            not position and regime_ok and rsi[day] < XGB_RSI_CAP
            and math.isfinite(forecast) and forecast > XGB_THRESHOLD
            and positive_confirmation
        )
        recovery_entry = (
            not position and not regime_ok and day > start
            and rsi[day - 1] <= RSI_ENTRY < rsi[day]
            and close[day] > high[day - 1]
            and positive_confirmation
        )
        exit_position = position and (
            (source == 'rsi' and rsi[day] > RSI_EXIT)
            or (
                source in ('xgboost', 'recovery')
                and ((math.isfinite(forecast) and forecast < 0.0) or rsi[day] > XGB_EXIT_RSI)
            )
        )

        if rsi_entry or xgb_entry or recovery_entry:
            equity *= 1.0 - BUY_FEE
            equity /= 1.0 + SLIPPAGE
            position = True
            source = 'rsi' if rsi_entry else 'xgboost' if xgb_entry else 'recovery'
            rsi_entries += int(rsi_entry)
            xgb_entries += int(xgb_entry and not rsi_entry)
            recovery_entries += int(recovery_entry)
            trades += 1
            entry_equity = equity
            entry_fill = execution_open * (1.0 + SLIPPAGE)
            trade_log.append({
                'source': source,
                'signal_date': frame['date'].iloc[day].strftime('%Y-%m-%d'),
                'entry_date': frame['date'].iloc[day + 1].strftime('%Y-%m-%d'),
                'entry_price': entry_fill,
            })
        elif exit_position:
            exit_fill = execution_open * (1.0 - SLIPPAGE)
            equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
            wins += int(equity > entry_equity)
            trade_log[-1].update({
                'exit_date': frame['date'].iloc[day + 1].strftime('%Y-%m-%d'),
                'exit_price': exit_fill,
                'net_return': (
                    (1.0 - BUY_FEE) * exit_fill / entry_fill * (1.0 - SELL_FEE) - 1.0
                ),
            })
            position = False
            source = None

        if position:
            equity *= close[day + 1] / execution_open
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1.0)
        points.append({
            'date': frame['date'].iloc[day + 1].strftime('%Y-%m-%d'),
            'strategy': equity,
        })

    if position:
        exit_fill = close[end] * (1.0 - SLIPPAGE)
        equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
        wins += int(equity > entry_equity)
        trade_log[-1].update({
            'exit_date': frame['date'].iloc[end].strftime('%Y-%m-%d'),
            'exit_price': exit_fill,
            'net_return': (
                (1.0 - BUY_FEE) * exit_fill / entry_fill * (1.0 - SELL_FEE) - 1.0
            ),
        })
        points[-1]['strategy'] = equity
    return {
        'net_return': equity - 1.0,
        'max_drawdown': max_drawdown,
        'trades': trades,
        'wins': wins,
        'rsi_entries': rsi_entries,
        'xgboost_entries': xgb_entries,
        'recovery_entries': recovery_entries,
        'trade_log': trade_log,
        'points': points,
    }


def benchmark_path(frame, start, end):
    close = frame['close'].to_numpy(dtype=np.float64)
    open_price = frame['open'].to_numpy(dtype=np.float64)
    equity = 1.0
    points = [equity]
    for day in range(start, end):
        execution_open = open_price[day + 1]
        if day == start:
            equity *= (1.0 - BUY_FEE) / (1.0 + SLIPPAGE)
        else:
            equity *= execution_open / close[day]
        equity *= close[day + 1] / execution_open
        points.append(equity)
    equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
    points[-1] = equity
    return points


def run(output_path=None, data_path=DATASET):
    frame, provenance = load_csv(data_path)
    forecasts = walk_forward_forecasts(frame)
    start = MIN_TRAIN_ROWS
    end = len(frame) - 1
    result = simulate_path(frame, forecasts, start, end)
    baseline = benchmark_path(frame, start, end)
    checkpoints = list(range(0, len(result['points']), FORWARD_ROWS))
    if checkpoints[-1] != len(result['points']) - 1:
        checkpoints.append(len(result['points']) - 1)
    daily_points = [{
        **result['points'][index],
        'baseline': baseline[index],
    } for index in range(len(result['points']))]
    benchmark_return = baseline[-1] - 1.0
    report = {
        'strategy_label': 'Regime recovery + XGBoost',
        'evaluation_status': {
            'deployable_alpha_claim': False,
            'causal_execution': True,
            'classification': 'exploratory; recovery logic was designed after inspecting the BBCA historical period',
            'required_confirmation': 'freeze these rules and evaluate only later sessions',
        },
        'protocol': {
            'name': 'Regime strategy with walk-forward XGBoost and confirmed recovery entries',
            'rsi_entry': 'RSI14 below 30 and close above SMA200',
            'xgboost_entry': 'two consecutive positive walk-forward return forecasts, RSI14 below 45, and close above SMA200',
            'recovery_entry': 'below SMA200, RSI14 crosses above 30, close exceeds the prior high, and two consecutive forecasts are positive',
            'rsi_exit': 'RSI14 above 50',
            'xgboost_and_recovery_exit': 'predicted return below zero or RSI14 above 60',
            'xgboost_model': 'return target, 20-session OHLCV window, refit before each 63-session block',
            'signal_execution': 'complete day-t data; execute at day-(t+1) open',
            'position_policy': 'continuous positions; no artificial liquidation at chart checkpoints',
            'buy_fee': BUY_FEE,
            'sell_fee': SELL_FEE,
            'slippage_per_execution': SLIPPAGE,
        },
        'source': provenance,
        'period': {'start': daily_points[0]['date'], 'end': daily_points[-1]['date']},
        'folds': len(checkpoints) - 1,
        'strategy_return': result['net_return'],
        'benchmark_return': benchmark_return,
        'alpha': result['net_return'] - benchmark_return,
        'forward_trades': result['trades'],
        'wins': result['wins'],
        'rsi_entries': result['rsi_entries'],
        'xgboost_entries': result['xgboost_entries'],
        'recovery_entries': result['recovery_entries'],
        'max_drawdown': result['max_drawdown'],
        'trade_log': result['trade_log'],
        'points': daily_points,
    }
    destination = Path(output_path or ROOT / 'hybrid_strategy_report.json')
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote: {destination.resolve()}')
    print(
        f'Hybrid {report["strategy_return"]:+.2%} | Benchmark {benchmark_return:+.2%} | '
        f'Alpha {report["alpha"]:+.2%} | Trades {report["forward_trades"]} '
        f'(RSI {report["rsi_entries"]}, XGBoost {report["xgboost_entries"]}, '
        f'Recovery {report["recovery_entries"]})'
    )
    return report


if __name__ == '__main__':
    run()
