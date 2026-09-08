import { useEffect, useState, useRef } from 'react';
import { NewsResponse, OHLCVInput, PredictionHistoryItem } from './types';
import PredictionForm from './components/PredictionForm';
import PredictionResult from './components/PredictionResult';
import PredictionHistory from './components/PredictionHistory';
import { dateInJakarta, parseMarketQuote, parseNews, parsePrediction, isHistoryItem } from './data/validation';

// Keep legacy records untouched: they may contain simulated results.
const HISTORY_KEY = 'bbca_model_predictions_v2';
const MARKET_URL = import.meta.env.VITE_YAHOO_PROXY_URL || '/api/yahoo?symbol=BBCA.JK&interval=1d&range=1d';
const PREDICT_URL = import.meta.env.VITE_PREDICT_API_URL || '/api/predict';
const NEWS_URL = import.meta.env.VITE_NEWS_API_URL || '/api/news';

function marketUrl(range: string) {
  const url = new URL(MARKET_URL, window.location.origin);
  url.searchParams.set('symbol', 'BBCA.JK');
  url.searchParams.set('interval', '1d');
  url.searchParams.set('range', range);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
}

export default function App() {
  const [tab, setTab] = useState<'predict' | 'history'>('predict');
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [result, setResult] = useState<PredictionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const quoteRequest = useRef(0);
  const newsRequest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [quote, setQuote] = useState<OHLCVInput | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('Loading market data…');
  const [sessionMode, setSessionMode] = useState<'latest' | 'historical'>('latest');
  const [sessionDate, setSessionDate] = useState('');
  const [targetDate, setTargetDate] = useState<string | undefined>();
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [newsStatus, setNewsStatus] = useState('Loading news…');

  async function fetchNews(asOf: string) {
    const requestId = ++newsRequest.current;
    setNews(null); setNewsStatus('Loading news…');
    try {
      const response = await fetch(`${NEWS_URL}?date=${encodeURIComponent(asOf)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('News is unavailable.');
      const value = parseNews(await response.json());
      if (requestId !== newsRequest.current) return;
      setNews(value); setNewsStatus(value.articles.length ? '' : 'No matching news for this session.');
    } catch (err) { if (requestId === newsRequest.current) setNewsStatus(err instanceof Error ? err.message : 'News is unavailable.'); }
  }

  async function fetchQuote(requestedDate?: string) {
    const requestId = ++quoteRequest.current;
    ++newsRequest.current;
    setQuote(null);
    setResult(null);
    setQuoteStatus('Loading market data…');
    try {
      const response = await fetch(marketUrl(requestedDate ? '10y' : '1mo'), { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Market data is unavailable. Enter values manually or retry.');
      const market = parseMarketQuote(await response.json(), requestedDate);
      if (requestId !== quoteRequest.current) return;
      const resolvedDate = dateInJakarta(market.timestamp);
      setQuote(market.input);
      setSessionDate(resolvedDate);
      setTargetDate(market.nextTimestamp ? dateInJakarta(market.nextTimestamp) : undefined);
      setQuoteStatus(`Yahoo Finance · ${new Date(market.timestamp * 1000).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' })}`);
      void fetchNews(resolvedDate);
    } catch (err) {
      if (requestId !== quoteRequest.current) return;
      setQuoteStatus(err instanceof Error ? err.message : 'Market data is unavailable.');
      setTargetDate(undefined); setNews(null); setNewsStatus('Choose an available trading session.');
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
      const item = { ...prediction, id: crypto.randomUUID(), timestamp: new Date().toISOString(), input,
        ...(sessionDate ? { sessionDate } : {}), ...(targetDate ? { targetDate } : {}) };
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
        <div className="session-bar" data-od-id="session-selector">
          <p className="workspace-intro">Market session</p>
          <div className="session-controls">
            <div className="session-toggle" aria-label="Market session mode">
              <button type="button" aria-pressed={sessionMode === 'latest'} disabled={loading} onClick={() => { setSessionMode('latest'); void fetchQuote(); }}>Latest</button>
              <button type="button" aria-pressed={sessionMode === 'historical'} disabled={loading} onClick={() => setSessionMode('historical')}>Choose date</button>
            </div>
            {sessionMode === 'historical' && <input aria-label="Trading session date" className="date-input" type="date" value={sessionDate}
              max={new Date().toISOString().slice(0, 10)} disabled={loading} onChange={event => { setSessionDate(event.target.value); if (event.target.value) void fetchQuote(event.target.value); }} />}
          </div>
        </div>
        <dl className="quote-strip" data-od-id="quote-strip" aria-label="Market session quote">
          <div><dt>Instrument</dt><dd className="instrument-name">BBCA.JK</dd></div>
          {(['close', 'high', 'low', 'volume'] as const).map(field => <div key={field}>
            <dt>{field === 'volume' ? 'Volume · shares' : `${field.charAt(0).toUpperCase() + field.slice(1)} · IDR`}</dt>
            <dd>{quote ? quote[field].toLocaleString('id-ID') : <span aria-label="Unavailable">—</span>}</dd>
          </div>)}
        </dl>
        <div className="workspace-grid">
          <PredictionForm onPredict={predict} isLoading={loading} realtimeInput={quote}
            yahooStatusText={quoteStatus} onRetryYahoo={() => fetchQuote(sessionMode === 'historical' ? sessionDate : undefined)} />
          <section aria-label="Prediction result" aria-live="polite" className="result-region" data-od-id="result">
            <span className="eyebrow">Model estimate</span>
            {loading && <p role="status" className="status-message">Requesting prediction…</p>}
            {error && <p role="alert" className="error-message">{error}</p>}
            {result && <PredictionResult result={result} input={result.input} timestamp={result.timestamp}
              sessionDate={result.sessionDate} targetDate={result.targetDate} />}
            {!loading && !error && !result && <div className="empty-result"><h2>No estimate yet.</h2><p>Enter the session prices and volume, then request an estimate.</p></div>}
          </section>
        </div>
        <section className="news-section" data-od-id="news-context" aria-live="polite">
          <div className="news-heading"><span className="eyebrow">News context</span>{sessionDate && <span className="unit-label">{sessionDate}</span>}</div>
          {news?.summary && <p className="news-summary">{news.summary}</p>}
          {newsStatus && <p className="news-status">{newsStatus}</p>}
          {news && <div className="news-list">{news.articles.slice(0, 6).map(article => <a key={`${article.url}-${article.title}`} href={article.url} target="_blank" rel="noreferrer">
            <span>{article.title}</span><small>{article.source}{article.published_wib ? ` · ${new Date(article.published_wib).toLocaleString('id-ID')}` : ''}</small>
          </a>)}</div>}
        </section>
      </> : <>
        <h2 className="history-title">Prediction history</h2>
        <p className="status-message">Model results saved in this browser.</p>
        <PredictionHistory history={history} onClear={clearHistory} onSelect={item => { setResult(item); setTab('predict'); setError(null); }} />
      </>}
    </main>
  </div>;
}
