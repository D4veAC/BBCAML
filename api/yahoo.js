// Vercel Serverless Function — /api/yahoo
// Proxies Yahoo Finance chart requests. Identical logic to yahoo_proxy.js
// but packaged as a standalone Vercel function with no Express dependency.

const yahooHosts = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || 'BBCA.JK');
  const interval = String(req.query.interval || '1d');
  const range = String(req.query.range || '1d');
  const params = new URLSearchParams({ interval, range });

  for (const host of yahooHosts) {
    try {
      const response = await fetch(
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.chart?.error || !payload?.chart?.result?.length) continue;
      res.setHeader('Cache-Control', 'no-store');
      return res.json(payload);
    } catch {
      /* Try the other Yahoo host; never synthesize a quote. */
    }
  }
  return res.status(502).json({ error: 'Market data is unavailable.' });
}
