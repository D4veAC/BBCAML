import json
import math
from pathlib import Path

import numpy as np

from backend.train_model import load_csv
from backend.tune_strategy import (
    BUY_FEE, FORWARD_ROWS, MIN_TRAIN_ROWS, SELL_FEE, SLIPPAGE, technicals,
)

ENTRY_RSI = 30.0
EXIT_RSI = 50.0
ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / 'data' / 'bbca_ohlcv_snapshot.csv'


def simulate_path(frame, start, end, indicators=None):
    """Trade signals known at close t at the next session's open."""
    values = technicals(frame) if indicators is None else indicators
    close = frame['close'].to_numpy(dtype=np.float64)
    open_price = frame['open'].to_numpy(dtype=np.float64)
    rsi = values['rsi14']
    sma200 = values['sma200']
    equity = peak = 1.0
    max_drawdown = 0.0
    position = False
    trades = wins = 0
    entry_equity = 0.0
    points = [{'date': frame['date'].iloc[start].strftime('%Y-%m-%d'), 'strategy': 1.0}]

    for day in range(start, end):
        execution_open = open_price[day + 1]
        if position:
            equity *= execution_open / close[day]

        enter = (
            not position
            and math.isfinite(rsi[day])
            and math.isfinite(sma200[day])
            and rsi[day] < ENTRY_RSI
            and close[day] > sma200[day]
        )
        exit_position = position and rsi[day] > EXIT_RSI
        if enter:
            equity *= 1.0 - BUY_FEE
            equity /= 1.0 + SLIPPAGE
            position = True
            trades += 1
            entry_equity = equity
        elif exit_position:
            equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
            wins += int(equity > entry_equity)
            position = False

        if position:
            equity *= close[day + 1] / execution_open
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1.0)
        points.append({
            'date': frame['date'].iloc[day + 1].strftime('%Y-%m-%d'),
            'strategy': equity,
        })

    if position:
        equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
        wins += int(equity > entry_equity)
        points[-1]['strategy'] = equity
    return {
        'net_return': equity - 1.0,
        'max_drawdown': max_drawdown,
        'trades': trades,
        'wins': wins,
        'points': points,
    }


def simulate(frame, start, end, indicators=None):
    result = simulate_path(frame, start, end, indicators)
    return {key: value for key, value in result.items() if key != 'points'}


def run(output_path=None, data_path=DATASET):
    frame, provenance = load_csv(data_path)
    indicators = technicals(frame)
    close = frame['close'].to_numpy(dtype=np.float64)
    open_price = frame['open'].to_numpy(dtype=np.float64)
    start = MIN_TRAIN_ROWS
    end = len(frame) - 1
    forward = simulate_path(frame, start, end, indicators)
    benchmark_points = [1.0]
    benchmark_equity = 1.0
    for day in range(start, end):
        execution_open = open_price[day + 1]
        if day == start:
            benchmark_equity *= (1.0 - BUY_FEE) / (1.0 + SLIPPAGE)
        else:
            benchmark_equity *= execution_open / close[day]
        benchmark_equity *= close[day + 1] / execution_open
        benchmark_points.append(benchmark_equity)
    benchmark_equity *= (1.0 - SELL_FEE) * (1.0 - SLIPPAGE)
    benchmark_points[-1] = benchmark_equity

    checkpoints = list(range(0, len(forward['points']), FORWARD_ROWS))
    if checkpoints[-1] != len(forward['points']) - 1:
        checkpoints.append(len(forward['points']) - 1)
    points = [{
        **forward['points'][index],
        'baseline': benchmark_points[index],
    } for index in checkpoints]
    strategy_return = forward['net_return']
    benchmark_return = benchmark_equity - 1.0
    report = {
        'strategy_label': 'RSI 30/50 · SMA200',
        'evaluation_status': {
            'deployable_alpha_claim': False,
            'causal_execution': True,
            'classification': 'exploratory; RSI thresholds were inspected on this historical period',
            'required_confirmation': 'freeze RSI 30/50 and SMA200 rules, then evaluate only later sessions',
        },
        'protocol': {
            'name': 'RSI mean reversion in a long-term uptrend',
            'entry': 'RSI14 below 30 and close above SMA200',
            'exit': 'RSI14 above 50',
            'signal_execution': 'complete day-t data; execute at day-(t+1) open',
            'rsi': '14-session simple rolling average gain/loss',
            'position_policy': 'continuous positions; no artificial liquidation at chart checkpoints',
            'buy_fee': BUY_FEE,
            'sell_fee': SELL_FEE,
            'slippage_per_execution': SLIPPAGE,
        },
        'source': provenance,
        'period': {'start': points[0]['date'], 'end': points[-1]['date']},
        'folds': len(points) - 1,
        'strategy_return': strategy_return,
        'benchmark_return': benchmark_return,
        'alpha': strategy_return - benchmark_return,
        'forward_trades': forward['trades'],
        'wins': forward['wins'],
        'max_drawdown': forward['max_drawdown'],
        'points': points,
    }
    destination = Path(output_path or ROOT / 'rsi_strategy_report.json')
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote: {destination.resolve()}')
    print(
        f'RSI {strategy_return:+.2%} | Benchmark {benchmark_return:+.2%} | '
        f'Alpha {report["alpha"]:+.2%} | Trades {report["forward_trades"]}'
    )
    return report


if __name__ == '__main__':
    run()
