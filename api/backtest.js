// Vercel Serverless Function — /api/backtest
// Reads the checked-in news_overlay_tuning_report.json and returns
// the cumulative equity path for the strategy vs. the BBCA buy-and-hold baseline.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'news_overlay_tuning_report.json',
);

export default async function handler(_req, res) {
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!Array.isArray(report.fold_reports) || !report.fold_reports.length) {
      throw new Error('Invalid report');
    }
    let strategy = 1;
    let baseline = 1;
    const points = [{ date: report.period.start, strategy, baseline }];
    for (const fold of report.fold_reports) {
      const strategyReturn = fold?.forward_overlay?.net_return;
      const baselineReturn = fold?.benchmark_return;
      if (
        typeof strategyReturn !== 'number' || !Number.isFinite(strategyReturn) ||
        typeof baselineReturn !== 'number' || !Number.isFinite(baselineReturn)
      ) throw new Error('Invalid fold');
      strategy *= 1 + strategyReturn;
      baseline *= 1 + baselineReturn;
      points.push({ date: fold.end, strategy, baseline });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      period: report.period,
      folds: report.folds,
      trades: report.forward_trades,
      strategyReturn: strategy - 1,
      baselineReturn: baseline - 1,
      alpha: strategy - baseline,
      points,
    });
  } catch {
    return res.status(503).json({ error: 'Simulation data is unavailable.' });
  }
}
