import { useEffect, useState, useRef } from 'react';
import { OHLCVInput, PredictionHistoryItem } from './types';
import PredictionForm from './components/PredictionForm';
import PredictionResult from './components/PredictionResult';
import PredictionHistory from './components/PredictionHistory';
import { parseMarketQuote, parsePrediction, isHistoryItem } from './data/validation';

// Keep legacy records untouched: they may contain simulated results.
const HISTORY_KEY = 'bbca_model_predictions_v2';
const MARKET_URL = import.meta.env.VITE_YAHOO_PROXY_URL || '/api/yahoo?symbol=BBCA.JK&interval=1d&range=1d';
const PREDICT_URL = import.meta.env.VITE_PREDICT_API_URL || '/api/predict';

export default function App() {
  const [tab, setTab] = useState<'predict' | 'history'>('predict');
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [result, setResult] = useState<PredictionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [quote, setQuote] = useState<OHLCVInput | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('Loading market data…');

  async function fetchQuote() {
    setQuote(null);
    setQuoteStatus('Loading market data…');
    try {
      const response = await fetch(MARKET_URL, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Market data is unavailable. Enter values manually or retry.');
      const market = parseMarketQuote(await response.json());
      setQuote(market.input);
      setQuoteStatus(`Yahoo Finance · Quote time: ${new Date(market.timestamp * 1000).toLocaleString()}`);
    } catch (err) {
      setQuoteStatus(err instanceof Error ? err.message : 'Market data is unavailable.');
    }
  }

  useEffect(() => {
    void fetchQuote();
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(saved) || !saved.every(isHistoryItem)) throw new Error('Invalid history');
      setHistory(saved);
    } catch { setStorageError('Saved history could not be loaded.'); }
  }, []);

  async function predict(input: OHLCVInput) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(PREDICT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (failure.code === 'MODEL_INPUT_MISMATCH') throw new Error('Estimates are unavailable because the model configuration needs repair.');
        throw new Error('Prediction failed. Check that the model service is running and try again.');
      }
      const prediction = parsePrediction(await response.json());
      const item = { ...prediction, id: crypto.randomUUID(), timestamp: new Date().toISOString(), input };
      setResult(item);
      const updated = [item, ...history];
      setHistory(updated);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        setStorageError(null);
      } catch { setStorageError('Prediction completed, but history could not be saved in this browser.'); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed. Please try again.');
    } finally { busy.current = false; setLoading(false); }
  }

  function clearHistory() {
    if (!confirm('Clear saved prediction history?')) return;
    try { localStorage.removeItem(HISTORY_KEY); setHistory([]); setStorageError(null); }
    catch { setStorageError('Saved history could not be cleared.'); }
  }

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <h1 className="brand">BBCA Predictor</h1>
        <nav aria-label="Main navigation" className="navigation">
          {(['predict', 'history'] as const).map(value => <button key={value} onClick={() => setTab(value)}
            aria-current={tab === value ? 'page' : undefined}
            className="nav-button">
            {value === 'predict' ? 'Prediction' : 'History'}
          </button>)}
        </nav>
      </div>
    </header>
    <main className="workspace" data-od-id="workspace">
      {storageError && <p role="status" className="error-message">{storageError}</p>}
      {tab === 'predict' ? <>
        <p className="workspace-intro">Market snapshot</p>
        <dl className="quote-strip" data-od-id="quote-strip" aria-label="Market session quote">
          <div><dt>Instrument</dt><dd className="instrument-name">BBCA.JK</dd></div>
          {(['close', 'high', 'low', 'volume'] as const).map(field => <div key={field}>
            <dt>{field === 'volume' ? 'Volume · shares' : `${field.charAt(0).toUpperCase() + field.slice(1)} · IDR`}</dt>
            <dd>{quote ? quote[field].toLocaleString('id-ID') : <span aria-label="Unavailable">—</span>}</dd>
          </div>)}
        </dl>
        <div className="workspace-grid">
          <PredictionForm onPredict={predict} isLoading={loading} realtimeInput={quote}
            yahooAvailable={quote !== null} yahooStatusText={quoteStatus} onRetryYahoo={fetchQuote} />
          <section aria-label="Prediction result" aria-live="polite" className="result-region" data-od-id="result">
            <span className="eyebrow">Model estimate</span>
            {loading && <p role="status" className="status-message">Requesting prediction…</p>}
            {error && <p role="alert" className="error-message">{error}</p>}
            {result && <PredictionResult result={result} input={result.input} timestamp={result.timestamp} />}
            {!loading && !error && !result && <div className="empty-result"><h2>No estimate yet.</h2><p>Enter the session prices and volume, then request an estimate.</p></div>}
          </section>
        </div>
      </> : <>
        <h2 className="history-title">Prediction history</h2>
        <p className="status-message">Model results saved in this browser.</p>
        <PredictionHistory history={history} onClear={clearHistory} onSelect={item => { setResult(item); setTab('predict'); setError(null); }} />
      </>}
    </main>
  </div>;
}
