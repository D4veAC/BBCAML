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
const REQUEST_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 60 * 1000;
const STALE_CACHE_TTL_MS = 30 * 60 * 1000;
const responseCache = new Map();

const LAST_KNOWN_QUOTES = {
  'BBCA.JK': {
    currency: 'IDR',
    price: 10100,
    previousClose: 10025,
    open: 10025,
    high: 10150,
    low: 10000,
    volume: 89600000,
  },
};

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

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const readCachedPayload = (key, maxAgeMs) => {
  const cached = responseCache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.createdAt;
  if (age > maxAgeMs) return null;

  return cached.payload;
};

const writeCachedPayload = (key, payload) => {
  responseCache.set(key, {
    createdAt: Date.now(),
    payload,
  });
};

const buildChartPayload = ({
  symbol,
  currency = 'IDR',
  price,
  previousClose,
  open,
  high,
  low,
  volume,
  source,
}) => ({
  chart: {
    result: [
      {
        meta: {
          currency,
          symbol,
          exchangeName: symbol.endsWith('.JK') ? 'JKT' : undefined,
          fullExchangeName: symbol.endsWith('.JK') ? 'Jakarta' : undefined,
          regularMarketPrice: price,
          previousClose,
          chartPreviousClose: previousClose,
          dataSource: source,
        },
        indicators: {
          quote: [
            {
              open: [open ?? price],
              high: [high ?? price],
              low: [low ?? price],
              close: [price],
              volume: [volume ?? 0],
            },
          ],
        },
      },
    ],
    error: null,
  },
});

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildStooqSymbol = (symbol) => {
  const jkMatch = symbol.match(/^([A-Z0-9-]+)\.JK$/i);
  if (jkMatch) return `${jkMatch[1].toLowerCase()}.id`;
  return symbol.toLowerCase();
};

const buildStooqFallback = async (symbol) => {
  if (!symbol.endsWith('.JK')) return null;

  const stooqSymbol = buildStooqSymbol(symbol);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const response = await fetchWithTimeout(url, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://stooq.com/',
    },
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCsvLine(lines[0]);
  const row = parseCsvLine(lines[1]);
  const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));

  const close = toFiniteNumber(record.Close);
  if (!close) return null;

  return buildChartPayload({
    symbol,
    currency: 'IDR',
    price: close,
    previousClose: toFiniteNumber(record.Open) ?? close,
    open: toFiniteNumber(record.Open) ?? close,
    high: toFiniteNumber(record.High) ?? close,
    low: toFiniteNumber(record.Low) ?? close,
    volume: toFiniteNumber(record.Volume) ?? 0,
    source: 'stooq',
  });
};

const buildLastKnownFallback = (symbol) => {
  const quote = LAST_KNOWN_QUOTES[symbol.toUpperCase()];
  if (!quote) return null;

  return buildChartPayload({
    symbol,
    ...quote,
    source: 'last-known',
  });
};

const buildForexFallback = async (symbol) => {
  const forexMatch = symbol.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (!forexMatch) return null;

  const base = forexMatch[1];
  const quote = forexMatch[2];
  const fallbackUrl = `https://open.er-api.com/v6/latest/${base}`;
  const response = await fetchWithTimeout(fallbackUrl, { headers: DEFAULT_HEADERS, cache: 'no-store' });
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
  const cacheKey = `${symbol}:${interval}:${range}`;
  const freshCachedPayload = readCachedPayload(cacheKey, CACHE_TTL_MS);
  if (freshCachedPayload) return freshCachedPayload;

  let lastError = null;
  for (const host of YAHOO_HOSTS) {
    const url = buildYahooUrl(host, symbol, interval, range);
    try {
      const response = await fetchWithTimeout(url, {
        headers: DEFAULT_HEADERS,
        cache: 'no-store',
      });
      if (!response.ok) {
        lastError = new Error(`${response.status} ${response.statusText}`);
        continue;
      }
      const payload = await response.json();
      writeCachedPayload(cacheKey, payload);
      return payload;
    } catch (err) {
      lastError = err;
    }
  }

  if (symbol.endsWith('=X')) {
    const fallback = await buildForexFallback(symbol);
    if (fallback) {
      writeCachedPayload(cacheKey, fallback);
      return fallback;
    }
  }

  const stooqFallback = await buildStooqFallback(symbol);
  if (stooqFallback) {
    writeCachedPayload(cacheKey, stooqFallback);
    return stooqFallback;
  }

  const staleCachedPayload = readCachedPayload(cacheKey, STALE_CACHE_TTL_MS);
  if (staleCachedPayload) {
    return staleCachedPayload;
  }

  const lastKnownFallback = buildLastKnownFallback(symbol);
  if (lastKnownFallback) {
    writeCachedPayload(cacheKey, lastKnownFallback);
    return lastKnownFallback;
  }

  throw lastError || new Error('Yahoo Finance fetch failed');
};

app.get('/api/yahoo', async (req, res) => {
  const symbol = String(req.query.symbol || 'BBCA.JK');
  const interval = String(req.query.interval || '1d');
  const range = String(req.query.range || '1d');

  try {
    const payload = await fetchYahooChart(symbol, interval, range);
    const source = payload?.chart?.result?.[0]?.meta?.dataSource || 'yahoo';
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    res.setHeader('X-Market-Data-Source', source);
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
