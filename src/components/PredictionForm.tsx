import React, { useEffect, useState } from 'react';
import { OHLCVInput } from '../types';
import { validInput } from '../data/validation';

const fields = ['open', 'high', 'low', 'close', 'volume'] as const;
export default function PredictionForm({ onPredict, isLoading, realtimeInput, yahooStatusText, onRetryYahoo }: {
  onPredict: (input: OHLCVInput) => void; isLoading: boolean; realtimeInput?: OHLCVInput | null;
  yahooStatusText: string; onRetryYahoo: () => void;
}) {
  const [values, setValues] = useState<Record<keyof OHLCVInput, string>>({ open: '', high: '', low: '', close: '', volume: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (realtimeInput) setValues(Object.fromEntries(fields.map(key => [key, String(realtimeInput[key])])) as Record<keyof OHLCVInput, string>);
  }, [realtimeInput]);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!realtimeInput) { setError('Choose an available trading session first.'); return; }
    const input = Object.fromEntries(fields.map(key => [key, Number(values[key])]));
    if (fields.some(key => values[key].trim() === '') || !validInput(input)) {
      setError('Enter positive prices and non-negative volume. High and low must contain the open and close.');
      return;
    }
    setError(''); onPredict(input);
  }
  return <section className="input-panel" data-od-id="session-input">
    <div className="section-heading"><span className="eyebrow">Session input</span><span className="unit-label">Prices in IDR</span></div>
    <h2>Session data</h2>
    <div className="market-source" data-od-id="market-source">
      <p role="status">{yahooStatusText}</p>
      <div className="text-actions">
        <button type="button" disabled={isLoading} onClick={onRetryYahoo}>Refresh quote</button>
      </div>
    </div>
    <form onSubmit={submit}>
      <div className="field-grid">{fields.map(key => <label key={key} className={key === 'volume' ? 'volume-field' : ''}>
        <span>{key === 'volume' ? 'Volume' : key.charAt(0).toUpperCase() + key.slice(1)}</span>
        <div className="field-control"><input aria-label={key} name={key} type="number" min="0" step={key === 'volume' ? '1' : 'any'} required
          value={values[key]} disabled={isLoading} onChange={event => { setValues({ ...values, [key]: event.target.value }); setError(''); }} />
          <span>{key === 'volume' ? 'shares' : 'Rp'}</span></div>
      </label>)}</div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="primary-button" type="submit" disabled={isLoading || !realtimeInput}>{isLoading ? 'Requesting estimate…' : 'Estimate next close'}<span aria-hidden="true">↗</span></button>
      <p className="field-note">Use open, high, low, close and volume from the same session.</p>
    </form>
  </section>;
}
