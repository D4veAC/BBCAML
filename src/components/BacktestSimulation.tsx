import { useEffect, useMemo, useState } from 'react';
import { BacktestResponse } from '../types';
import { parseBacktest } from '../data/validation';

const BACKTEST_URL = import.meta.env.VITE_BACKTEST_API_URL || '/api/backtest';
const percent = (value: number) => new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function BacktestSimulation() {
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(1);
  const [run, setRun] = useState(0);

  useEffect(() => {
    fetch(BACKTEST_URL, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(value => setData(parseBacktest(value)))
      .catch(() => setError('Simulation data is unavailable.'));
  }, []);

  useEffect(() => {
    if (!data) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(data.points.length); return; }
    setVisible(1);
    const timer = window.setInterval(() => setVisible(value => {
      if (value >= data.points.length) { window.clearInterval(timer); return value; }
      return value + 1;
    }), 120);
    return () => window.clearInterval(timer);
  }, [data, run]);

  const chart = useMemo(() => {
    if (!data) return null;
    const width = 920, height = 360, left = 52, right = 18, top = 22, bottom = 38;
    const all = data.points.flatMap(point => [point.strategy, point.baseline]);
    const min = Math.min(...all), max = Math.max(...all), span = Math.max(.01, max - min);
    const x = (index: number) => left + index * (width - left - right) / (data.points.length - 1);
    const y = (value: number) => top + (max - value) * (height - top - bottom) / span;
    const line = (key: 'strategy' | 'baseline') => data.points.slice(0, visible).map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
    return { width, height, left, right, top, bottom, min, max, x, y, strategy: line('strategy'), baseline: line('baseline') };
  }, [data, visible]);

  if (error) return <p role="alert" className="error-message">{error}</p>;
  if (!data || !chart) return <p role="status" className="status-message">Loading simulation…</p>;
  const current = data.points[Math.min(visible, data.points.length) - 1];
  return <section className="simulation" data-od-id="backtest-simulation">
    <div className="simulation-heading">
      <div><span className="eyebrow">Research simulation</span><h2>Walk-forward, fold by fold.</h2></div>
      <button type="button" className="replay-button" onClick={() => setRun(value => value + 1)}>Replay</button>
    </div>
    <div className="simulation-stats">
      <div><span>XGBoost</span><strong>{percent(current.strategy - 1)}</strong></div>
      <div><span>Buy &amp; hold</span><strong>{percent(current.baseline - 1)}</strong></div>
      <div><span>Completed</span><strong>{Math.max(0, visible - 1)} / {data.folds}</strong></div>
      <div><span>Trades</span><strong>{data.trades}</strong></div>
    </div>
    <div className="chart-wrap">
      <svg className="equity-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Animated cumulative return comparison between the XGBoost strategy and buy-and-hold baseline">
        {[0, .5, 1].map(position => { const y = chart.top + position * (chart.height - chart.top - chart.bottom); const value = chart.max - position * (chart.max - chart.min); return <g key={position}><line className="grid-line" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} /><text className="axis-label" x={chart.left - 10} y={y + 4}>{percent(value - 1)}</text></g>; })}
        <path className="baseline-line" d={chart.baseline} />
        <path className="strategy-line" d={chart.strategy} />
        <circle className="baseline-dot" cx={chart.x(visible - 1)} cy={chart.y(current.baseline)} r="4" />
        <circle className="strategy-dot" cx={chart.x(visible - 1)} cy={chart.y(current.strategy)} r="4" />
      </svg>
    </div>
    <div className="chart-legend"><span><i className="strategy-key" />XGBoost</span><span><i className="baseline-key" />Buy &amp; hold</span><time>{current.date}</time></div>
    <p className="simulation-meta">{data.period.start}—{data.period.end} · {data.folds} chronological forward folds · fees and slippage included</p>
  </section>;
}
