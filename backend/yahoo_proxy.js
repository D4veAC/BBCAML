import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

const MAX_ACTIVE_TICKERS = 30;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('*', (_req, res) => {
  res.sendStatus(204);
});

const buildYahooUrl = (host, symbol, interval, range) => {
  const params = new URLSearchParams({ interval, range });
  return `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
};

const buildForexFallback = async (symbol) => {
  const forexMatch = symbol.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (!forexMatch) return null;

  const base = forexMatch[1];
  const quote = forexMatch[2];
  const fallbackUrl = `https://open.er-api.com/v6/latest/${base}`;
  const response = await fetch(fallbackUrl, { headers: DEFAULT_HEADERS, cache: 'no-store' });
  if (!response.ok) return null;

  const data = await response.json();
  const rate = data?.rates?.[quote];
  if (!rate) return null;

  return {
    chart: {
      result: [
        {
          meta: {
            currency: quote,
            regularMarketPrice: rate,
            previousClose: rate,
          },
          indicators: {
            quote: [
              {
                open: [rate],
                high: [rate],
                low: [rate],
                close: [rate],
                volume: [0],
              },
            ],
          },
        },
      ],
    },
  };
};

const fetchYahooChart = async (symbol, interval, range) => {
  let lastError = null;
  for (const host of YAHOO_HOSTS) {
    const url = buildYahooUrl(host, symbol, interval, range);
    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        cache: 'no-store',
      });
      if (!response.ok) {
        lastError = new Error(`${response.status} ${response.statusText}`);
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
    }
  }

  if (symbol.endsWith('=X')) {
    const fallback = await buildForexFallback(symbol);
    if (fallback) return fallback;
  }

  throw lastError || new Error('Yahoo Finance fetch failed');
};

app.get('/api/yahoo', async (req, res) => {
  const symbol = String(req.query.symbol || 'BBCA.JK');
  const interval = String(req.query.interval || '1d');
  const range = String(req.query.range || '1d');

  try {
    const payload = await fetchYahooChart(symbol, interval, range);
    res.json(payload);
  } catch (error) {
    res.status(502).json({
      error: 'Yahoo Finance proxy failed',
      details: String(error),
    });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', message: 'Yahoo Finance proxy running' });
});

app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({
        error: 'Frontend build not found',
        details: 'Run npm run build before starting the production server.',
      });
    }
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Yahoo proxy server listening on port ${PORT}`);
});
