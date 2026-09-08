import json
import math
import os
import pickle
import urllib.request
import numpy as np
import pandas as pd

def run_backtest():
    bundle_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'xgboost_ohlcv_bundle.pkl')
    with open(bundle_path, 'rb') as fp:
        bundle = pickle.load(fp)

    model = bundle['model']
    scaler_X = bundle['scaler_X']
    features = bundle['features']
    timestep = bundle['timestep']
    ticker = bundle['ticker']
    if (
        bundle.get('bundle_version') != 3
        or bundle.get('target_mode') not in ('price', 'return')
        or ticker != 'BBCA.JK'
        or features != ['open', 'high', 'low', 'close', 'volume']
        or timestep not in (1, 10, 20, 30)
    ):
        raise RuntimeError('Backtest requires the leakage-controlled bundle schema version 3')

    headers = {'User-Agent': 'Mozilla/5.0'}
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?range=5y&interval=1d'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    res = data['chart']['result'][0]
    quote = res['indicators']['quote'][0]
    df = pd.DataFrame({
        'timestamp': res['timestamp'],
        'open': quote['open'],
        'high': quote['high'],
        'low': quote['low'],
        'close': quote['close'],
        'volume': quote['volume']
    }).dropna().reset_index(drop=True)
    df['date'] = pd.to_datetime(df['timestamp'], unit='s').dt.strftime('%Y-%m-%d')
    df = df[(df['open'] > 0) & (df['high'] > 0) & (df['low'] > 0) & (df['close'] > 0)].reset_index(drop=True)

    scaled_X = scaler_X.transform(df[features].values)
    n = len(df)
    samples = []
    dates = []
    curr_close = []
    actual_next_close = []
    lows = []

    for i in range(n - timestep):
        window = scaled_X[i : i + timestep].flatten()
        samples.append(window)
        dates.append(df['date'].iloc[i + timestep])
        curr_close.append(df['close'].iloc[i + timestep - 1])
        actual_next_close.append(df['close'].iloc[i + timestep])
        lows.append(df['low'].iloc[i + timestep])

    samples = np.array(samples)
    curr_close = np.array(curr_close)
    actual_next_close = np.array(actual_next_close)
    lows = np.array(lows)

    raw_prediction = model.predict(samples)
    pred_next_close = raw_prediction if bundle['target_mode'] == 'price' else curr_close * (1.0 + raw_prediction)

    split_idx = int(len(samples) * 0.85)

    def evaluate_period(label, start, end, thr=0.005, sl_pct=0.015, fee=0.0015):
        p_c = curr_close[start:end]
        p_act = actual_next_close[start:end]
        p_pred = pred_next_close[start:end]
        p_low = lows[start:end]
        d_range = f'{dates[start]} s/d {dates[end - 1]}'

        # Statistical metrics
        mae = float(np.mean(np.abs(p_pred - p_act)))
        rmse = float(math.sqrt(np.mean((p_pred - p_act) ** 2)))
        mape = float(np.mean(np.abs((p_act - p_pred) / p_act)) * 100)
        da = float(np.mean(np.sign(p_act - p_c) == np.sign(p_pred - p_c)) * 100)

        # Simulation
        capital = 100_000_000.0
        peak = capital
        mdd = 0.0
        in_pos = False
        trades = 0
        wins = 0
        sl_hits = 0
        entry_price = 0.0

        for t in range(len(p_c)):
            pred_ret = (p_pred[t] - p_c[t]) / p_c[t]
            buy_signal = pred_ret > thr

            if buy_signal and not in_pos:
                in_pos = True
                capital *= (1 - fee)
                entry_price = p_c[t]
                trades += 1

            if in_pos:
                if sl_pct and p_low[t] <= entry_price * (1 - sl_pct):
                    sl_hits += 1
                    exit_price = entry_price * (1 - sl_pct)
                    ret = (exit_price - p_c[t]) / p_c[t]
                    capital *= (1 + ret) * (1 - fee)
                    in_pos = False
                else:
                    ret = (p_act[t] - p_c[t]) / p_c[t]
                    capital *= (1 + ret)
                    if not buy_signal:
                        in_pos = False
                        capital *= (1 - fee)
                        if p_act[t] > entry_price:
                            wins += 1

            peak = max(peak, capital)
            dd = (capital - peak) / peak * 100
            mdd = min(mdd, dd)

        if in_pos:
            capital *= (1 - fee)
            if p_act[-1] > entry_price:
                wins += 1

        strat_return = (capital - 100_000_000.0) / 100_000_000.0 * 100
        bh_return = (p_act[-1] - p_c[0]) / p_c[0] * 100
        alpha = strat_return - bh_return
        win_rate = (wins / trades * 100) if trades > 0 else 0.0

        return {
            'label': label,
            'period': d_range,
            'sessions': end - start,
            'mae': mae,
            'rmse': rmse,
            'mape': mape,
            'da': da,
            'strat_return': strat_return,
            'bh_return': bh_return,
            'alpha': alpha,
            'mdd': mdd,
            'trades': trades,
            'sl_hits': sl_hits,
            'win_rate': win_rate
        }

    # This Yahoo replay can overlap the training dates stored in the bundle, so
    # it is deliberately not labelled as an out-of-sample evaluation.
    recent = evaluate_period('Recent 15% replay', split_idx, len(samples), thr=0.005, sl_pct=0.015)
    conservative = evaluate_period('Recent 15% replay (threshold 1%, stop 1.5%)', split_idx, len(samples), thr=0.01, sl_pct=0.015)
    full_sample = evaluate_period('Available Yahoo history replay', 0, len(samples), thr=0.005, sl_pct=0.015)

    print(json.dumps({'recent_replay': recent, 'conservative_replay': conservative, 'full_replay': full_sample}, indent=2))

if __name__ == '__main__':
    run_backtest()
