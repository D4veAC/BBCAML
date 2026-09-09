import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBacktest, parseMarketQuote, parseNews, parsePrediction, validInput } from './validation';
const input = { open: 100, high: 110, low: 90, close: 105, volume: 0 };
test('reject invalid and missing model prices', () => {
  for (const value of [{}, { prediction_price: null }, { prediction_price: NaN }, { prediction_price: -1 }]) assert.throws(() => parsePrediction(value));
});
test('quote selection uses latest session and preserves zero volume', () => {
  const payload = { chart: { result: [{ timestamp: [1, 2], indicators: { quote: [Object.fromEntries(Object.entries(input).map(([key, value]) => [key, [null, value]]))] } }] } };
  assert.deepEqual(parseMarketQuote(payload), { input, timestamp: 2 });
  payload.chart.result[0].indicators.quote[0].close[1] = null;
  assert.throws(() => parseMarketQuote(payload));
});
test('invalid inputs and synthetic quote sources are rejected', () => {
  assert.equal(validInput({ ...input, high: 99 }), false);
  assert.equal(validInput({ ...input, close: Infinity }), false);
  assert.throws(() => parseMarketQuote({ chart: { result: [{ meta: { dataSource: 'last-known' } }] } }));
});
test('historical quote selection returns its following trading session', () => {
  const timestamps = [Date.UTC(2026, 8, 7, 2) / 1000, Date.UTC(2026, 8, 8, 2) / 1000];
  const quote = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, [value, value + (key === 'volume' ? 1 : 0)]]));
  assert.deepEqual(parseMarketQuote({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [quote] } }] } }, '2026-09-07'), {
    input, timestamp: timestamps[0], nextTimestamp: timestamps[1],
  });
  assert.throws(() => parseMarketQuote({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [quote] } }] } }, '2026-09-06'));
});
test('news parser keeps sourced articles and rejects malformed responses', () => {
  const value = { as_of: '2026-09-08', fetched_at: '2026-09-08T12:00:00+07:00', summary: null, summary_status: 'not_configured', articles: [{ title: 'BBCA', source: 'Source', url: 'https://example.com', published_wib: '2026-09-08T09:00:00+07:00' }] };
  assert.deepEqual(parseNews(value), value);
  assert.throws(() => parseNews({ articles: [] }));
});
test('backtest parser requires positive equity paths', () => {
  const value = { period: { start: '2020-01-01', end: '2021-01-01' }, folds: 1, trades: 1, strategyReturn: .1, baselineReturn: .05, alpha: .05, maxDrawdown: -.03,
    points: [{ date: '2020-01-01', strategy: 1, baseline: 1 }, { date: '2021-01-01', strategy: 1.1, baseline: 1.05 }] };
  assert.deepEqual(parseBacktest(value), value);
  assert.throws(() => parseBacktest({ ...value, points: [{ date: '', strategy: 0, baseline: 1 }] }));
});
