import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketQuote, parsePrediction, validInput } from './validation';
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
