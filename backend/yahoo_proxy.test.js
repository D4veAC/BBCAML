import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './yahoo_proxy.js';

const realFetch = globalThis.fetch;
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
test.after(() => { globalThis.fetch = realFetch; server.close(); });
const request = () => realFetch(`${origin}/api/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
test('upstream failures never become predictions or hardcoded quotes', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const prediction = await request();
  assert.equal(prediction.status, 502);
  assert.equal((await prediction.json()).prediction_price, undefined);
  const quote = await realFetch(`${origin}/api/yahoo`);
  assert.equal(quote.status, 502);
  assert.equal((await quote.json()).chart, undefined);
});
test('invalid model output is rejected', async () => {
  globalThis.fetch = async () => Response.json({ prediction_price: '100' });
  assert.equal((await request()).status, 502);
});
test('only model price is passed through', async () => {
  globalThis.fetch = async () => Response.json({ prediction_price: 123.45, confidence: .99, trend: 'Bullish' });
  assert.deepEqual(await (await request()).json(), { prediction_price: 123.45 });
});
test('model validation errors stay errors', async () => {
  globalThis.fetch = async () => Response.json({ error: 'invalid' }, { status: 400 });
  assert.equal((await request()).status, 400);
});
test('model input mismatch remains an explicit service error', async () => {
  globalThis.fetch = async () => Response.json({ code: 'MODEL_INPUT_MISMATCH' }, { status: 503 });
  const response = await request();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MODEL_INPUT_MISMATCH');
});
test('news endpoint passes through sourced news without inventing a summary', async () => {
  const payload = { as_of: '2026-09-08', fetched_at: '2026-09-08T12:00:00+07:00', summary: null, summary_status: 'not_configured', articles: [{ title: 'BBCA', source: 'Publisher', url: 'https://example.com', published_wib: '' }] };
  globalThis.fetch = async () => Response.json(payload);
  const response = await realFetch(`${origin}/api/news?date=2026-09-08`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
});
test('backtest endpoint returns a reconciled equity path', async () => {
  const response = await realFetch(`${origin}/api/backtest`);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.points.length, result.folds + 1);
  assert.ok(Math.abs(result.points.at(-1).strategy - 1 - result.strategyReturn) < 1e-12);
  assert.ok(Math.abs(result.points.at(-1).baseline - 1 - result.baselineReturn) < 1e-12);
});
