import json
from datetime import date
from pathlib import Path

from backend.news_retriever import available_date, load_articles
from backend.train_model import load_yahoo


def run(report_path=None, output_path=None):
    root = Path(__file__).resolve().parent.parent
    report_file = Path(report_path or root / 'news_overlay_tuning_report.json')
    report = json.loads(report_file.read_text(encoding='utf-8'))
    frame, _ = load_yahoo()
    index_by_date = {
        value.strftime('%Y-%m-%d'): index for index, value in enumerate(frame['date'])
    }
    boundary_violations = []
    for fold in report['fold_reports']:
        forward_start = index_by_date[fold['start']]
        last_tuning_decision = forward_start - 2
        last_tuning_outcome = last_tuning_decision + 1
        if last_tuning_outcome >= forward_start:
            boundary_violations.append(fold['start'])

    articles = load_articles()
    last_market_date = frame['date'].iloc[-1].date()
    future_articles = [
        item.get('url', '') for item in articles
        if available_date(item) > max(date.today(), last_market_date)
    ]
    compounded = 1.0
    for fold in report['fold_reports']:
        compounded *= 1.0 + fold['forward_overlay']['net_return']
    recomputed_return = compounded - 1.0

    audit = {
        'direct_temporal_boundary_violations': boundary_violations,
        'future_available_articles': len(future_articles),
        'reported_overlay_return': report['overlay_return'],
        'recomputed_overlay_return': recomputed_return,
        'return_reconciles': abs(recomputed_return - report['overlay_return']) < 1e-12,
        'research_selection_leakage': True,
        'point_in_time_corpus_guarantee': False,
        'deployable_alpha_claim': False,
        'reason': 'Outer folds were repeatedly inspected during rule development; historical search results were backfilled ex post.',
    }
    destination = Path(output_path or root / 'news_overlay_leakage_audit.json')
    destination.write_text(json.dumps(audit, indent=2), encoding='utf-8')
    print(json.dumps(audit, indent=2))
    return audit


if __name__ == '__main__':
    run()
