import { OHLCVInput, PredictionHistoryItem, PredictionResponse } from '../types';
const fields = ['open', 'high', 'low', 'close', 'volume'] as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function validInput(value: any): value is OHLCVInput {
  return value && fields.every(key => finite(value[key]) && (key === 'volume' ? value[key] >= 0 : value[key] > 0))
    && value.high >= Math.max(value.open, value.close, value.low) && value.low <= Math.min(value.open, value.close);
}
export function parsePrediction(value: any): PredictionResponse {
  if (!value || !finite(value.prediction_price) || value.prediction_price <= 0) throw new Error('The model returned an invalid result. Please try again.');
  return { prediction_price: value.prediction_price };
}
export function isHistoryItem(value: any): value is PredictionHistoryItem {
  return value && typeof value.id === 'string' && typeof value.timestamp === 'string'
    && Number.isFinite(Date.parse(value.timestamp)) && validInput(value.input)
    && finite(value.prediction_price) && value.prediction_price > 0;
}
export function parseMarketQuote(payload: any): { input: OHLCVInput; timestamp: number } {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (payload?.chart?.error || (result?.meta?.dataSource && result.meta.dataSource !== 'yahoo')
      || !quote || !Array.isArray(timestamps) || !timestamps.length) throw new Error('Market data is unavailable. Enter values manually or retry.');
  const index = timestamps.length - 1;
  const input = Object.fromEntries(fields.map(key => [key, quote[key]?.[index]]));
  if (!validInput(input) || !finite(timestamps[index])) throw new Error('The latest market session has incomplete data. Enter values manually or retry.');
  return { input, timestamp: timestamps[index] };
}
