import json
from collections import Counter
from datetime import timedelta
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import LogisticRegression

from backend.news_retriever import available_date, load_articles
from backend.train_model import load_yahoo
from backend.tune_strategy import (
    BUY_FEE, FORWARD_ROWS, MIN_TRAIN_ROWS, MODEL_SPECS, SELL_FEE, SLIPPAGE,
    candidates, fit_predict_before, simulate, technicals,
)

NEWS_THRESHOLDS = [0.50, 0.55, 0.60, 0.65, 0.70]
MIN_ARTICLES = [1, 2, 3]
MIN_TUNING_TRADES = 2
MIN_BASE_TUNING_TRADES = 4
MAX_TUNING_DRAWDOWN = -0.12
MIN_NEWS_TRAIN_DAYS = 50
NEWS_TUNING_ROWS = 252
VECTORIZER = HashingVectorizer(
    n_features=4096, alternate_sign=False, lowercase=True,
    ngram_range=(1, 2), norm='l2',
)


def cash_result():
    return {
        'net_return': 0.0, 'max_drawdown': 0.0, 'trades': 0,
        'position_changes': 0, 'early_stop_exits': 0,
        'take_profit_exits': 0,
        'blocked_entries': 0, 'invalidated_at_open': 0, 'score': 0.0,
    }


def build_daily_documents(frame, articles=None, lookback_sessions=5):
    items = load_articles() if articles is None else articles
    buckets = {}
    for article in items:
        usable = available_date(article)
        text = f"{article.get('title', '')} {article.get('snippet', '')}".strip()
        if text:
            buckets.setdefault(usable, []).append(text)

    dates = [value.date() for value in frame['date']]
    session_texts = []
    for index, current in enumerate(dates):
        previous = dates[index - 1] if index else current - timedelta(days=4)
        texts = [text for usable, values in buckets.items() if previous < usable <= current for text in values]
        session_texts.append(texts)
    documents, counts = [], []
    for index in range(len(session_texts)):
        rolling = [text for values in session_texts[max(0, index - lookback_sessions + 1):index + 1] for text in values]
        documents.append(' '.join(rolling))
        counts.append(len(rolling))
    return documents, np.asarray(counts, dtype=np.int64)


def fit_news_before(frame, documents, counts, train_end, prediction_indices):
    open_price = frame['open'].to_numpy(dtype=np.float64)
    close = frame['close'].to_numpy(dtype=np.float64)
    train_indices = np.arange(0, train_end - 1, dtype=np.int64)
    train_indices = train_indices[counts[train_indices] > 0]
    if len(train_indices) < MIN_NEWS_TRAIN_DAYS:
        raise RuntimeError('Insufficient timestamp-safe news days for causal training')
    required_return = (1.0 + BUY_FEE) * (1.0 + SELL_FEE) * (1.0 + 2.0 * SLIPPAGE) - 1.0
    labels = (close[train_indices + 1] / open_price[train_indices + 1] - 1.0 > required_return).astype(np.int8)
    if len(np.unique(labels)) != 2:
        raise RuntimeError('News training window contains only one outcome class')
    model = LogisticRegression(C=1.0, class_weight='balanced', max_iter=1000, random_state=42)
    model.fit(VECTORIZER.transform([documents[index] for index in train_indices]), labels)
    prediction_indices = np.asarray(prediction_indices, dtype=np.int64)
    probabilities = model.predict_proba(
        VECTORIZER.transform([documents[index] for index in prediction_indices])
    )[:, 1]
    return probabilities


def select_base_config(frame, indices, forecasts, indicators):
    scored = [(simulate(frame, indices, forecasts, indicators, config), config) for config in candidates()]
    active = [item for item in scored if item[0]['trades'] >= MIN_BASE_TUNING_TRADES]
    if not active:
        raise RuntimeError('No quant configuration produced enough inner-window entries')
    return max(active, key=lambda item: (item[0]['score'], item[0]['net_return'], -item[0]['position_changes']))


def run(output_path=None):
    frame, provenance = load_yahoo()
    documents, article_counts = build_daily_documents(frame)
    indicators = technicals(frame)
    close = frame['close'].to_numpy(dtype=np.float64)
    open_price = frame['open'].to_numpy(dtype=np.float64)
    overlay_equity = baseline_equity = risk_controlled_equity = benchmark_equity = 1.0
    reports = []
    selected_counts = Counter()
    skipped_warmup_folds = 0

    for forward_start in range(MIN_TRAIN_ROWS, len(frame) - 1, FORWARD_ROWS):
        forward_end = min(forward_start + FORWARD_ROWS, len(frame) - 1)
        tuning_start = forward_start - NEWS_TUNING_ROWS
        if int(np.sum(article_counts[:tuning_start - 1] > 0)) < MIN_NEWS_TRAIN_DAYS:
            skipped_warmup_folds += 1
            continue
        tuning_indices = np.arange(tuning_start, forward_start - 1, dtype=np.int64)
        forward_indices = np.arange(forward_start, forward_end, dtype=np.int64)
        news_tuning = fit_news_before(frame, documents, article_counts, tuning_start, tuning_indices)

        overlay_candidates = []
        for target_mode, window in MODEL_SPECS:
            forecasts, _ = fit_predict_before(frame, tuning_start, tuning_indices, target_mode, window)
            try:
                _, base_config = select_base_config(frame, tuning_indices, forecasts, indicators)
            except RuntimeError:
                continue
            for threshold in NEWS_THRESHOLDS:
                for minimum in MIN_ARTICLES:
                    permission = (news_tuning >= threshold) & (article_counts[tuning_indices] >= minimum)
                    result = simulate(frame, tuning_indices, forecasts, indicators, base_config, permission)
                    overlay_candidates.append((result, {
                        **base_config, 'target_mode': target_mode, 'window': window,
                        'news_threshold': threshold, 'minimum_articles': minimum,
                    }))
        if not overlay_candidates:
            benchmark = (
                close[forward_end] * (1.0 - SLIPPAGE)
                / (open_price[forward_start + 1] * (1.0 + SLIPPAGE))
                * (1.0 - BUY_FEE) * (1.0 - SELL_FEE) - 1.0
            )
            empty = cash_result()
            selected = {'risk_off': True, 'reason': 'insufficient_inner_quant_opportunities'}
            benchmark_equity *= 1.0 + benchmark
            selected_counts[json.dumps(selected, sort_keys=True)] += 1
            reports.append({
                'start': frame['date'].iloc[forward_start].strftime('%Y-%m-%d'),
                'end': frame['date'].iloc[forward_end].strftime('%Y-%m-%d'),
                'selected': selected, 'tuning': empty,
                'forward_overlay': empty, 'forward_risk_controlled_quant': empty,
                'forward_raw_matched_quant': empty,
                'benchmark_return': benchmark,
                'news_probability_mean': 0.0,
                'news_days': int(np.sum(article_counts[forward_indices] > 0)),
            })
            continue
        feasible = [
            item for item in overlay_candidates
            if item[0]['trades'] >= MIN_TUNING_TRADES
            and item[0]['net_return'] > 0.0
            and item[0]['max_drawdown'] >= MAX_TUNING_DRAWDOWN
        ]
        selection_pool = feasible or overlay_candidates
        tuning_result, selected = max(
            selection_pool,
            key=lambda item: (item[0]['score'], item[0]['net_return'], -item[0]['position_changes']),
        )
        selected = {**selected, 'risk_off': not bool(feasible)}

        forward_forecasts, _ = fit_predict_before(
            frame, forward_start, forward_indices, selected['target_mode'], selected['window'],
        )
        news_forward = fit_news_before(frame, documents, article_counts, forward_start, forward_indices)
        permission = (
            (news_forward >= selected['news_threshold'])
            & (article_counts[forward_indices] >= selected['minimum_articles'])
        )
        if selected['risk_off']:
            permission[:] = False
        overlay = simulate(frame, forward_indices, forward_forecasts, indicators, selected, permission)
        baseline = simulate(frame, forward_indices, forward_forecasts, indicators, selected)
        risk_controlled = cash_result() if selected['risk_off'] else baseline
        benchmark = (
            close[forward_end] * (1.0 - SLIPPAGE)
            / (open_price[forward_start + 1] * (1.0 + SLIPPAGE))
            * (1.0 - BUY_FEE) * (1.0 - SELL_FEE) - 1.0
        )
        overlay_equity *= 1.0 + overlay['net_return']
        baseline_equity *= 1.0 + baseline['net_return']
        risk_controlled_equity *= 1.0 + risk_controlled['net_return']
        benchmark_equity *= 1.0 + benchmark
        selected_counts[json.dumps(selected, sort_keys=True)] += 1
        reports.append({
            'start': frame['date'].iloc[forward_start].strftime('%Y-%m-%d'),
            'end': frame['date'].iloc[forward_end].strftime('%Y-%m-%d'),
            'selected': selected, 'tuning': tuning_result,
            'forward_overlay': overlay, 'forward_risk_controlled_quant': risk_controlled,
            'forward_raw_matched_quant': baseline,
            'benchmark_return': benchmark,
            'news_probability_mean': float(np.mean(news_forward)),
            'news_days': int(np.sum(article_counts[forward_indices] > 0)),
        })

    overlay_return = overlay_equity - 1.0
    baseline_return = baseline_equity - 1.0
    risk_controlled_return = risk_controlled_equity - 1.0
    benchmark_return = benchmark_equity - 1.0
    report = {
        'evaluation_status': {
            'deployable_alpha_claim': False,
            'classification': 'exploratory; historical outer folds were reused during iterative strategy development',
            'point_in_time_news_archive': False,
            'required_confirmation': 'pre-register the current rules and evaluate only sessions after the last inspected date',
        },
        'protocol': {
            'name': 'nested rolling-origin timestamp-safe news veto',
            'news_model': 'hashed word unigram/bigram features plus balanced logistic regression',
            'label': 'next-session open-to-close return exceeds modeled round-trip friction',
            'availability': 'pre-15:50 WIB same date; later or date-only next date; weekend carried to next session',
            'news_memory': 'documents contain only news made available during the current and previous four trading sessions',
            'selection': 'within one run, quant config and news threshold are selected on the inner window before scoring the outer fold; repeated research runs have contaminated those outer folds',
            'minimum_tuning_trades': MIN_TUNING_TRADES,
            'tuning_rows': NEWS_TUNING_ROWS,
            'minimum_base_quant_tuning_trades': MIN_BASE_TUNING_TRADES,
            'minimum_tuning_return': 0.0,
            'maximum_tuning_drawdown': MAX_TUNING_DRAWDOWN,
            'risk_off_policy': 'stay in cash for the next outer fold when no inner candidate passes all constraints',
            'take_profit_policy': 'fixed 3x or 5x entry ATR target, or disabled; chosen only on the inner window; stop wins when both levels touch in one daily candle',
            'news_thresholds': NEWS_THRESHOLDS,
            'minimum_article_counts': MIN_ARTICLES,
        },
        'source': provenance,
        'period': {'start': reports[0]['start'], 'end': reports[-1]['end']},
        'folds': len(reports),
        'skipped_warmup_folds': skipped_warmup_folds,
        'overlay_return': overlay_return,
        'raw_matched_quant_return': baseline_return,
        'risk_controlled_quant_return': risk_controlled_return,
        'benchmark_return': benchmark_return,
        'overlay_alpha': overlay_return - benchmark_return,
        'news_incremental_return': overlay_return - risk_controlled_return,
        'risk_policy_incremental_return': risk_controlled_return - baseline_return,
        'forward_trades': sum(item['forward_overlay']['trades'] for item in reports),
        'blocked_entry_signals': sum(item['forward_overlay']['blocked_entries'] for item in reports),
        'entries_invalidated_at_open': sum(item['forward_overlay']['invalidated_at_open'] for item in reports),
        'early_stop_exits': sum(item['forward_overlay']['early_stop_exits'] for item in reports),
        'take_profit_exits': sum(item['forward_overlay']['take_profit_exits'] for item in reports),
        'selected_configuration_counts': dict(selected_counts),
        'fold_reports': reports,
    }
    destination = Path(output_path or Path(__file__).resolve().parent.parent / 'news_overlay_tuning_report.json').resolve()
    destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote: {destination}')
    print(f'Overlay {overlay_return:+.2%} | Risk-controlled quant {risk_controlled_return:+.2%} | Raw quant {baseline_return:+.2%} | Benchmark {benchmark_return:+.2%}')
    print(f'Alpha {report["overlay_alpha"]:+.2%} | News increment {report["news_incremental_return"]:+.2%} | Risk-policy increment {report["risk_policy_incremental_return"]:+.2%}')
    print(f'Trades {report["forward_trades"]} | News-blocked {report["blocked_entry_signals"]} | Open-invalidated {report["entries_invalidated_at_open"]} | Early stops {report["early_stop_exits"]}')
    return report


if __name__ == '__main__':
    run()
