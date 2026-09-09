import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def export(source=ROOT / 'hybrid_strategy_report.json', destination=ROOT / 'server' / 'backtest-data.json'):
    report = json.loads(Path(source).read_text(encoding='utf-8'))
    if isinstance(report.get('points'), list) and len(report['points']) >= 2:
        points = report['points']
        if not all(
            isinstance(point.get('strategy'), (int, float))
            and isinstance(point.get('baseline'), (int, float))
            and isinstance(point.get('date'), str)
            for point in points
        ):
            raise ValueError('Backtest report contains an invalid equity point')
        data = {
            'period': report['period'],
            'folds': len(points) - 1,
            'trades': report['forward_trades'],
            'strategyLabel': report.get('strategy_label', 'Strategy'),
            'evaluationStatus': 'exploratory',
            'strategyReturn': points[-1]['strategy'] - 1.0,
            'baselineReturn': points[-1]['baseline'] - 1.0,
            'alpha': points[-1]['strategy'] - points[-1]['baseline'],
            'maxDrawdown': report['max_drawdown'],
            'points': points,
        }
        Path(destination).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
        print(f'Wrote backtest deployment data: {Path(destination).resolve()}')
        return data
    folds = report.get('fold_reports')
    if not isinstance(folds, list) or not folds:
        raise ValueError('Backtest report has no folds')

    strategy = baseline = 1.0
    points = [{'date': report['period']['start'], 'strategy': strategy, 'baseline': baseline}]
    for fold in folds:
        strategy_return = fold['forward']['net_return']
        baseline_return = fold['benchmark_return']
        if not all(isinstance(value, (int, float)) for value in (strategy_return, baseline_return)):
            raise ValueError('Backtest report contains a non-numeric return')
        strategy *= 1.0 + strategy_return
        baseline *= 1.0 + baseline_return
        points.append({'date': fold['end'], 'strategy': strategy, 'baseline': baseline})

    data = {
        'period': report['period'],
        'folds': report['folds'],
        'trades': sum(fold['forward']['trades'] for fold in folds),
        'strategyLabel': report.get('strategy_label', 'Strategy'),
        'evaluationStatus': 'exploratory',
        'strategyReturn': strategy - 1.0,
        'baselineReturn': baseline - 1.0,
        'alpha': strategy - baseline,
        'maxDrawdown': report['max_drawdown'],
        'points': points,
    }
    Path(destination).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote backtest deployment data: {Path(destination).resolve()}')
    return data


if __name__ == '__main__':
    export()
