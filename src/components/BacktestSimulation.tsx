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
    const step = Math.max(1, Math.ceil(data.points.length / 120));
    const timer = window.setInterval(() => setVisible(value => {
      if (value >= data.points.length) { window.clearInterval(timer); return value; }
      return Math.min(data.points.length, value + step);
    }), 50);
    return () => window.clearInterval(timer);
  }, [data, run]);

  const chart = useMemo(() => {
    if (!data) return null;
    const width = 920, height = 390, left = 52, right = 18, top = 22, bottom = 68;
    const all = data.points.flatMap(point => [point.strategy, point.baseline]);
    const min = Math.min(...all), max = Math.max(...all), span = Math.max(.01, max - min);
    const start = Date.parse(data.period.start), end = Date.parse(data.period.end);
    const xAtDate = (date: string) => left + (Date.parse(date) - start) * (width - left - right) / Math.max(1, end - start);
    const y = (value: number) => top + (max - value) * (height - top - bottom) / span;
    const line = (key: 'strategy' | 'baseline') => data.points.slice(0, visible).map((point, index) => `${index ? 'L' : 'M'}${xAtDate(point.date).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
    const strategyYAtDate = (date: string) => {
      const target = Date.parse(date);
      const upper = data.points.findIndex(point => Date.parse(point.date) >= target);
      if (upper <= 0) return y(data.points[0].strategy);
      const before = data.points[upper - 1], after = data.points[upper];
      const beforeTime = Date.parse(before.date), afterTime = Date.parse(after.date);
      const ratio = (target - beforeTime) / Math.max(1, afterTime - beforeTime);
      return y(before.strategy + (after.strategy - before.strategy) * ratio);
    };
    return { width, height, left, right, top, bottom, min, max, xAtDate, y, strategyYAtDate, strategy: line('strategy'), baseline: line('baseline') };
  }, [data, visible]);

  if (error) return <p role="alert" className="error-message">{error}</p>;
  if (!data || !chart) return <p role="status" className="status-message">Loading simulation…</p>;
  const current = data.points[Math.min(visible, data.points.length) - 1];
  const strategyLabel = data.strategyLabel || 'XGBoost';
  const currentTime = Date.parse(current.date);
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
        {visibleTrades.flatMap((trade, index) => {
          const markers = [<g key={`buy-${index}`} className="plot-marker buy-plot-marker" transform={`translate(${chart.xAtDate(trade.entryDate)} ${chart.strategyYAtDate(trade.entryDate) - 12})`}>
            <title>{`Buy · ${trade.entryDate} · ${trade.source}`}</title><line x1="0" y1="7" x2="0" y2="-5" /><path d="m-4-1 4-4 4 4" />
          </g>];
          if (trade.exitDate && Date.parse(trade.exitDate) <= currentTime) markers.push(<g key={`sell-${index}`} className="plot-marker sell-plot-marker" transform={`translate(${chart.xAtDate(trade.exitDate)} ${chart.strategyYAtDate(trade.exitDate) + 12})`}>
            <title>{`Sell · ${trade.exitDate}`}</title><line x1="0" y1="-7" x2="0" y2="5" /><path d="m-4 1 4 4 4-4" />
          </g>);
          return markers;
        })}
        <circle className="baseline-dot" cx={chart.xAtDate(current.date)} cy={chart.y(current.baseline)} r="4" />
        <circle className="strategy-dot" cx={chart.xAtDate(current.date)} cy={chart.y(current.strategy)} r="4" />
        <g className="position-plot" aria-label={`Position on ${current.date}: ${activeTrade ? 'hold stock' : 'hold cash'}`}>
          <line className="cash-state-line" x1={chart.left} x2={chart.xAtDate(current.date)} y1="342" y2="342" />
          {visibleTrades.map((trade, index) => <line key={`hold-${index}`} className="stock-state-line"
            x1={chart.xAtDate(trade.entryDate)}
            x2={chart.xAtDate(trade.exitDate && Date.parse(trade.exitDate) <= currentTime ? trade.exitDate : current.date)}
            y1="342" y2="342" />)}
          <text className={activeTrade ? 'stock-state-label' : 'cash-state-label'} x={chart.left} y="374">{`Position: ${activeTrade ? 'Hold stock' : 'Hold cash'}`}</text>
          <g className="plot-key buy-plot-marker" transform="translate(560 371)"><line x1="0" y1="5" x2="0" y2="-5" /><path d="m-4-1 4-4 4 4" /><text x="10" y="4">Buy</text></g>
          <g className="plot-key sell-plot-marker" transform="translate(635 371)"><line x1="0" y1="-5" x2="0" y2="5" /><path d="m-4 1 4 4 4-4" /><text x="10" y="4">Sell</text></g>
          <g className="plot-key stock-state-label" transform="translate(710 371)"><line x1="0" y1="0" x2="14" y2="0" /><text x="20" y="4">Hold stock</text></g>
          <g className="plot-key cash-state-label" transform="translate(815 371)"><line x1="0" y1="0" x2="14" y2="0" /><text x="20" y="4">Hold cash</text></g>
        </g>
      </svg>
    </div>
    <div className="chart-legend"><span><i className="strategy-key" />{strategyLabel}</span><span><i className="baseline-key" />Buy &amp; hold</span><time>{current.date}</time></div>
    <p className="simulation-meta">{data.period.start}—{data.period.end} · XGBoost refit every 63 sessions · next-open execution · fees and slippage included · exploratory</p>
  </section>;
}
