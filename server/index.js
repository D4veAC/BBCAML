import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const model = require('./model.json');
const backtest = require('./backtest-data.json');
const corpus = require('./news-corpus.json');
const FEATURES = ['open', 'high', 'low', 'close', 'volume'];
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const NEWS_QUERIES = [
  'BBCA saham', '"Bank Central Asia" saham', '"saham BCA"',
  'BBCA laba dividen buyback', 'BBCA asing broker target harga', 'BBCA kinerja kredit NPL',
];
const DEFAULT_MODELS = [
  'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'groq/compound',
  'groq/compound-mini', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b',
];
const app = express();
app.use(express.json({ limit: '16kb' }));

function asyncRoute(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((error) => {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: 'Service is unavailable.' });
  });
}

async function yahooChart(symbol, interval, range) {
  const params = new URLSearchParams({ interval, range });
  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (!payload?.chart?.error && payload?.chart?.result?.length) return payload;
    } catch { /* try the second Yahoo host */ }
  }
  throw new Error('Market data is unavailable');
}

function quoteRows(payload) {
  const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0];
  if (!quote) return [];
  const length = Math.max(...FEATURES.map((feature) => quote[feature]?.length || 0));
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    const row = FEATURES.map((feature) => quote[feature]?.[index]);
    if (row.every((value) => typeof value === 'number' && Number.isFinite(value))) rows.push(row);
  }
  return rows;
}

function validateSession(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected an input object');
  const row = FEATURES.map((feature) => input[feature]);
  if (row.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Missing or invalid market feature');
  const [open, high, low, close, volume] = row;
  if (Math.min(open, high, low, close) <= 0 || volume < 0) throw new TypeError('Prices must be positive and volume non-negative');
  if (high < Math.max(open, close, low) || low > Math.min(open, close)) throw new TypeError('Inconsistent session prices');
  return row;
}

function sameSession(left, right) {
  return left.slice(0, 4).every((value, index) => Math.abs(value - right[index]) <= 0.5)
    && Math.abs(left[4] - right[4]) <= Math.max(1, Math.abs(right[4]) * 0.0001);
}

function treeValue(tree, values) {
  let node = 0;
  while (tree.left[node] !== -1) {
    const value = values[tree.feature[node]];
    node = Number.isNaN(value)
      ? (tree.defaultLeft[node] ? tree.left[node] : tree.right[node])
      : (value < tree.threshold[node] ? tree.left[node] : tree.right[node]);
  }
  return tree.threshold[node];
}

function infer(current, history) {
  const rows = [...history];
  if (rows.length && sameSession(rows.at(-1), current)) rows.pop();
  const required = model.timestep - 1;
  if (rows.length < required) throw new Error(`At least ${required} prior market sessions are required`);
  const values = [...rows.slice(-required), current].flatMap((row) => row.map(
    (value, feature) => value * model.scalerScale[feature] + model.scalerMin[feature],
  ));
  const raw = model.baseScore + model.trees.reduce((sum, tree) => sum + treeValue(tree, values), 0);
  return model.targetMode === 'price' ? raw : current[3] * (1 + raw / model.targetScale);
}

function jakartaDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').trim();
}

function xmlTag(block, tag) {
  return decodeXml(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
}

async function liveNews(asOf) {
  if (asOf < jakartaDate(new Date(Date.now() - 86400000))) return [];
  const jobs = NEWS_QUERIES.map(async (query) => {
    try {
      const url = `https://news.google.com/rss/search?${new URLSearchParams({ q: query, hl: 'id', gl: 'ID', ceid: 'ID:id' })}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'BBCAML/1.0' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      const xml = await response.text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
        const published = new Date(xmlTag(match[1], 'pubDate'));
        const title = xmlTag(match[1], 'title');
        const source = xmlTag(match[1], 'source') || title.split(' - ').at(-1) || '';
        return { title, source, url: xmlTag(match[1], 'link'), pub_date: jakartaDate(published), published_wib: published.toISOString() };
      }).filter((item) => item.title && item.pub_date <= asOf);
    } catch { return []; }
  });
  return (await Promise.all(jobs)).flat();
}

async function summarize(articles) {
  const keys = [process.env.GROQ_API_KEY, ...(process.env.GROQ_API_KEYS || '').split(',')].map((x) => x?.trim()).filter(Boolean);
  if (!keys.length) return { summary: null, summary_status: 'not_configured', summary_model: null };
  const configured = (process.env.GROQ_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const evidence = articles.slice(0, 8).map(({ title, source, published_wib }) => ({ title, source, published_wib }));
  for (const key of [...new Set(keys)]) {
    let models = configured.length ? configured : DEFAULT_MODELS;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
      const available = response.ok ? (await response.json()).data.map((item) => item.id).filter((id) => !/whisper|orpheus|prompt-guard|safeguard/i.test(id)) : [];
      models = [...new Set([...models.filter((id) => !available.length || available.includes(id)), ...available])];
    } catch { /* use configured/default chain */ }
    for (const name of models) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: name, temperature: 0.1, max_completion_tokens: 400, messages: [
            { role: 'system', content: 'Ringkas bukti berita dalam bahasa Indonesia dalam 2-3 kalimat faktual. Jangan membuat prediksi harga, rekomendasi, angka, atau fakta baru.' },
            { role: 'user', content: JSON.stringify(evidence) },
          ] }),
        });
        if (!response.ok) continue;
        const summary = (await response.json())?.choices?.[0]?.message?.content?.trim();
        if (summary) return { summary, summary_status: 'ready', summary_model: name };
      } catch { /* continue fallback chain */ }
    }
  }
  return { summary: null, summary_status: 'unavailable', summary_model: null };
}

app.get('/api/status', (_req, res) => res.json({ status: 'ok', service: 'backend' }));
app.get('/api/yahoo', asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await yahooChart(String(req.query.symbol || 'BBCA.JK'), String(req.query.interval || '1d'), String(req.query.range || '1d')));
}));
app.post('/api/predict', asyncRoute(async (req, res) => {
  const current = validateSession(req.body);
  const history = quoteRows(await yahooChart(model.ticker, '1d', '6mo'));
  const prediction_price = infer(current, history);
  if (!Number.isFinite(prediction_price) || prediction_price <= 0) throw new Error('Model returned an invalid price');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ prediction_price });
}));
app.get('/api/backtest', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(backtest); });
app.get('/api/news', asyncRoute(async (req, res) => {
  const asOf = String(req.query.date || jakartaDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > jakartaDate()) return res.status(400).json({ error: 'Invalid news date' });
  const earliest = new Date(`${asOf}T00:00:00Z`); earliest.setUTCDate(earliest.getUTCDate() - 5);
  const combined = [...corpus.filter((item) => item.pub_date >= earliest.toISOString().slice(0, 10) && item.pub_date <= asOf), ...await liveNews(asOf)];
  const unique = [...new Map(combined.filter((item) => item.title).map((item) => [item.url || `${item.pub_date}|${item.title}`, item])).values()]
    .sort((a, b) => String(b.published_wib || b.pub_date).localeCompare(String(a.published_wib || a.pub_date))).slice(0, 12);
  const summary = await summarize(unique);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ as_of: asOf, fetched_at: new Date().toISOString(), ...summary,
    articles: unique.map(({ title, source = '', url = '', published_wib = '' }) => ({ title, source, url, published_wib })) });
}));

export { app, infer };
export default app;
