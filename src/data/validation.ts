import { MarketQuote, NewsResponse, OHLCVInput, PredictionHistoryItem, PredictionResponse } from '../types';
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
    && (value.sessionDate === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value.sessionDate))
    && (value.targetDate === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value.targetDate))
    && finite(value.prediction_price) && value.prediction_price > 0;
}
export function dateInJakarta(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp * 1000));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function parseMarketQuote(payload: any, requestedDate?: string): MarketQuote {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (payload?.chart?.error || (result?.meta?.dataSource && result.meta.dataSource !== 'yahoo')
      || !quote || !Array.isArray(timestamps) || !timestamps.length) throw new Error('Market data is unavailable. Enter values manually or retry.');
  const index = requestedDate
    ? timestamps.findIndex((timestamp: unknown) => finite(timestamp) && dateInJakarta(timestamp) === requestedDate)
    : timestamps.length - 1;
  if (index < 0) throw new Error('No BBCA trading session exists on the selected date.');
  const input = Object.fromEntries(fields.map(key => [key, quote[key]?.[index]]));
  if (!validInput(input) || !finite(timestamps[index])) throw new Error('The selected market session has incomplete data. Choose another date or retry.');
  const nextTimestamp = timestamps.slice(index + 1).find((timestamp: unknown, offset: number) => {
    const candidate = index + 1 + offset;
    return finite(timestamp) && validInput(Object.fromEntries(fields.map(key => [key, quote[key]?.[candidate]])));
  });
  return { input, timestamp: timestamps[index], ...(finite(nextTimestamp) ? { nextTimestamp } : {}) };
}
export function parseNews(value: any): NewsResponse {
  const statuses = ['ready', 'not_configured', 'unavailable'];
  if (!value || typeof value.as_of !== 'string' || typeof value.fetched_at !== 'string'
      || !Array.isArray(value.articles) || !statuses.includes(value.summary_status)
      || (value.summary !== null && typeof value.summary !== 'string')) throw new Error('News context is unavailable.');
  const articles = value.articles.filter((item: any) => item && typeof item.title === 'string'
    && typeof item.source === 'string' && typeof item.url === 'string' && typeof item.published_wib === 'string');
  return { as_of: value.as_of, fetched_at: value.fetched_at, articles, summary: value.summary,
    summary_status: value.summary_status, ...(typeof value.summary_model === 'string' || value.summary_model === null ? { summary_model: value.summary_model } : {}) };
}
