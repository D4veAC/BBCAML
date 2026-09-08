import { createRequire } from 'node:module';

const model = createRequire(import.meta.url)('./model.json');

const FEATURES = ['open', 'high', 'low', 'close', 'volume'];
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

function validateSession(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an input object');
  const row = FEATURES.map((feature) => input[feature]);
  if (row.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Missing or invalid market feature');
  const [open, high, low, close, volume] = row;
  if (Math.min(open, high, low, close) <= 0 || volume < 0) throw new Error('Prices must be positive and volume non-negative');
  if (high < Math.max(open, close, low) || low > Math.min(open, close)) throw new Error('Inconsistent session prices');
  return row;
}

async function fetchHistory() {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(model.ticker)}?interval=1d&range=6mo`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const result = (await response.json())?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      if (!quote) continue;
      const length = Math.max(...FEATURES.map((feature) => quote[feature]?.length || 0));
      const rows = [];
      for (let index = 0; index < length; index += 1) {
        const row = FEATURES.map((feature) => quote[feature]?.[index]);
        if (row.every((value) => typeof value === 'number' && Number.isFinite(value))) rows.push(row);
      }
      if (rows.length) return rows;
    } catch {
      // Try the second Yahoo endpoint; an unavailable source remains an error.
    }
  }
  throw new Error('Historical market data is unavailable');
}

function sameSession(left, right) {
  return left.slice(0, 4).every((value, index) => Math.abs(value - right[index]) <= 0.5)
    && Math.abs(left[4] - right[4]) <= Math.max(1, Math.abs(right[4]) * 0.0001);
}

function treeValue(tree, values) {
  let node = 0;
  while (tree.left[node] !== -1) {
    const value = values[tree.feature[node]];
    if (Number.isNaN(value)) node = tree.defaultLeft[node] ? tree.left[node] : tree.right[node];
    else node = value < tree.threshold[node] ? tree.left[node] : tree.right[node];
  }
  return tree.threshold[node];
}

export function infer(current, history) {
  const rows = [...history];
  if (rows.length && sameSession(rows.at(-1), current)) rows.pop();
  const required = model.timestep - 1;
  if (rows.length < required) throw new Error(`At least ${required} prior market sessions are required`);
  const sequence = [...rows.slice(-required), current];
  const values = sequence.flatMap((row) => row.map(
    (value, feature) => value * model.scalerScale[feature] + model.scalerMin[feature],
  ));
  const raw = model.baseScore + model.trees.reduce((sum, tree) => sum + treeValue(tree, values), 0);
  return model.targetMode === 'price' ? raw : current[3] * (1 + raw / model.targetScale);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const current = validateSession(req.body);
    const price = infer(current, await fetchHistory());
    if (!Number.isFinite(price) || price <= 0) throw new Error('Model returned an invalid price');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ prediction_price: price });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Model prediction failed';
    const status = message.startsWith('Historical') || message.startsWith('At least') ? 503 : 400;
    return res.status(status).json({ error: message });
  }
}
