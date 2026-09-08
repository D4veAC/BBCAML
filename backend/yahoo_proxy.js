import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

export const app = express();
const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const yahooHosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
app.use(express.json({ limit: '16kb' }));

app.get('/api/yahoo', async (req, res) => {
  const symbol = String(req.query.symbol || 'BBCA.JK');
  const params = new URLSearchParams({ interval: String(req.query.interval || '1d'), range: String(req.query.range || '1d') });
  for (const host of yahooHosts) {
    try {
      const response = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.chart?.error || !payload?.chart?.result?.length) continue;
      res.setHeader('Cache-Control', 'no-store');
      return res.json(payload);
    } catch { /* Try the other Yahoo host; never synthesize a quote. */ }
  }
  res.status(502).json({ error: 'Market data is unavailable.' });
});

app.post('/api/predict', async (req, res) => {
  try {
    const response = await fetch(process.env.PREDICT_API_URL || 'http://127.0.0.1:5000/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (failure.code === 'MODEL_INPUT_MISMATCH') {
        return res.status(503).json({ error: 'The model and its input configuration are incompatible.', code: 'MODEL_INPUT_MISMATCH' });
      }
      return res.status(response.status >= 500 ? 502 : 400).json({ error: 'The model service could not process this input.' });
    }
    const result = await response.json();
    if (typeof result.prediction_price !== 'number' || !Number.isFinite(result.prediction_price) || result.prediction_price <= 0) {
      return res.status(502).json({ error: 'The model service returned an invalid result.' });
    }
    res.json({ prediction_price: result.prediction_price });
  } catch { res.status(502).json({ error: 'The model service is unavailable.' }); }
});
app.get('/api/status', (_req, res) => res.json({ status: 'ok', service: 'web' }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(process.env.PORT || 3001, () => console.log('Web server started'));
}
