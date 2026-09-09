import assert from 'node:assert/strict';
import test from 'node:test';

import app from '../server/index.js';

async function request(path, options) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${server.address().port}${path}`, options); }
  finally { server.close(); }
}

test('Vercel prediction rejects coerced string inputs before fetching history', async () => {
  const response = await request('/api/predict', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ open: '6600', high: 6700, low: 6500, close: 6650, volume: 1000 }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /invalid market feature/i);
});

test('Vercel backtest response reconciles checked-in report totals', async () => {
  const response = await request('/api/backtest');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.trades, 25);
  assert.equal(body.maxDrawdown, -0.1336802237750203);
  const last = body.points.at(-1);
  assert.ok(Math.abs(body.strategyReturn - (last.strategy - 1)) < 1e-12);
  assert.ok(Math.abs(body.alpha - (last.strategy - last.baseline)) < 1e-12);
});
