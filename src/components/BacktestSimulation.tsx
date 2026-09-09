import { useEffect, useMemo, useState } from 'react';
import { BacktestResponse } from '../types';
import { parseBacktest } from '../data/validation';

const BACKTEST_URL = import.meta.env.VITE_BACKTEST_API_URL || '/api/backtest';
const percent = (value: number) => new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
type PositionKind = 'buy' | 'sell' | 'stock' | 'cash';

function PositionIcon({ kind }: { kind: PositionKind }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'buy' && <><path d="M12 19V6" /><path d="m7 11 5-5 5 5" /></>}
    {kind === 'sell' && <><path d="M12 5v13" /><path d="m7 13 5 5 5-5" /></>}
    {kind === 'stock' && <><path d="M3 17 8 12l4 3 7-8" /><path d="M15 7h4v4" /></>}
    {kind === 'cash' && <><path d="M4 7.5h16v10H4z" /><path d="M7 5h10" /><circle cx="12" cy="12.5" r="2.5" /></>}
  </svg>;
}

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
  const strategyLabel = data.strategyLabel || 'XGBoost';
  const startTime = Date.parse(data.period.start);
  const endTime = Date.parse(data.period.end);
  const currentTime = Date.parse(current.date);
  const datePosition = (date: string) => Math.max(0, Math.min(100,
    (Date.parse(date) - startTime) * 100 / Math.max(1, endTime - startTime)));
  const visibleTrades = data.tradeLog.filter(trade => Date.parse(trade.entryDate) <= currentTime);
  const activeTrade = visibleTrades.find(trade => !trade.exitDate || Date.parse(trade.exitDate) > currentTime);
  return <section className="simulation" data-od-id="backtest-simulation">
    <div className="simulation-heading">
      <div><span className="eyebrow">Research simulation</span><h2>Walk-forward, fold by fold.</h2></div>
      <button type="button" className="replay-button" onClick={() => setRun(value => value + 1)}>Replay</button>
    </div>
    <div className="simulation-stats">
      <div><span>{strategyLabel}</span><strong>{percent(current.strategy - 1)}</strong></div>
      <div><span>Buy &amp; hold</span><strong>{percent(current.baseline - 1)}</strong></div>
      <div><span>Max drawdown</span><strong>{percent(data.maxDrawdown)}</strong></div>
      <div><span>Trades</span><strong>{data.trades}</strong></div>
    </div>
    <div className="chart-wrap">
      <svg className="equity-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Animated cumulative return comparison between ${strategyLabel} and buy-and-hold baseline`}>
        {[0, .5, 1].map(position => { const y = chart.top + position * (chart.height - chart.top - chart.bottom); const value = chart.max - position * (chart.max - chart.min); return <g key={position}><line className="grid-line" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} /><text className="axis-label" x={chart.left - 10} y={y + 4}>{percent(value - 1)}</text></g>; })}
        <path className="baseline-line" d={chart.baseline} />
        <path className="strategy-line" d={chart.strategy} />
        <circle className="baseline-dot" cx={chart.x(visible - 1)} cy={chart.y(current.baseline)} r="4" />
        <circle className="strategy-dot" cx={chart.x(visible - 1)} cy={chart.y(current.strategy)} r="4" />
      </svg>
    </div>
    <div className="chart-legend"><span><i className="strategy-key" />{strategyLabel}</span><span><i className="baseline-key" />Buy &amp; hold</span><time>{current.date}</time></div>
    <div className="position-panel" data-od-id="position-timeline">
      <div className="position-heading">
        <div className="position-now"><PositionIcon kind={activeTrade ? 'stock' : 'cash'} /><span>Position on {current.date}</span><strong>{activeTrade ? 'Hold stock' : 'Hold cash'}</strong></div>
        <div className="position-key" aria-label="Trading action legend">
          {(['buy', 'sell', 'stock', 'cash'] as PositionKind[]).map(kind => <span key={kind}><PositionIcon kind={kind} />{kind === 'stock' ? 'Hold stock' : kind === 'cash' ? 'Hold cash' : kind[0].toUpperCase() + kind.slice(1)}</span>)}
        </div>
      </div>
      <div className="position-track" aria-label="Historical invested and cash periods">
        <span className="cash-track" />
        {visibleTrades.map((trade, index) => {
          const left = datePosition(trade.entryDate);
          const right = datePosition(trade.exitDate && Date.parse(trade.exitDate) <= currentTime ? trade.exitDate : current.date);
          return <span key={`${trade.entryDate}-${index}`} className="stock-range" style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }} />;
        })}
        {visibleTrades.flatMap((trade, index) => {
          const markers = [<span key={`buy-${index}`} className="trade-marker buy-marker" style={{ left: `${datePosition(trade.entryDate)}%` }} title={`Buy · ${trade.entryDate} · ${trade.source}`}><PositionIcon kind="buy" /></span>];
          if (trade.exitDate && Date.parse(trade.exitDate) <= currentTime) markers.push(<span key={`sell-${index}`} className="trade-marker sell-marker" style={{ left: `${datePosition(trade.exitDate)}%` }} title={`Sell · ${trade.exitDate}`}><PositionIcon kind="sell" /></span>);
          return markers;
        })}
        <span className="position-playhead" style={{ left: `${datePosition(current.date)}%` }} />
      </div>
    </div>
    <p className="simulation-meta">{data.period.start}—{data.period.end} · XGBoost refit every 63 sessions · next-open execution · fees and slippage included · exploratory</p>
  </section>;
}
