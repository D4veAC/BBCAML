import assert from 'node:assert/strict';
import test from 'node:test';

import backtestHandler from '../api/backtest.js';
import predictHandler from '../api/predict.js';

function responseHarness() {
  const output = { statusCode: 200, headers: {} };
  return {
    output,
    response: {
      setHeader(name, value) { output.headers[name] = value; },
      status(code) { output.statusCode = code; return this; },
      json(body) { output.body = body; return this; },
    },
  };
}

test('Vercel prediction rejects coerced string inputs before fetching history', async () => {
  const { output, response } = responseHarness();
  await predictHandler({
    method: 'POST',
    body: { open: '6600', high: 6700, low: 6500, close: 6650, volume: 1000 },
  }, response);
  assert.equal(output.statusCode, 400);
  assert.match(output.body.error, /invalid market feature/i);
});

test('Vercel backtest response reconciles checked-in report totals', async () => {
  const { output, response } = responseHarness();
  await backtestHandler({}, response);
  assert.equal(output.statusCode, 200);
  assert.equal(output.body.trades, 5);
  const last = output.body.points.at(-1);
  assert.ok(Math.abs(output.body.strategyReturn - (last.strategy - 1)) < 1e-12);
  assert.ok(Math.abs(output.body.alpha - (last.strategy - last.baseline)) < 1e-12);
});
