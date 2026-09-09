export interface OHLCVInput {
  open: number; high: number; low: number; close: number; volume: number;
}
export interface PredictionResponse { prediction_price: number; }
export interface PredictionHistoryItem extends PredictionResponse {
  id: string; timestamp: string; input: OHLCVInput; sessionDate?: string; targetDate?: string;
}
export interface MarketQuote { input: OHLCVInput; timestamp: number; nextTimestamp?: number; }
export interface NewsArticle { title: string; source: string; url: string; published_wib: string; }
export interface NewsResponse {
  as_of: string; fetched_at: string; articles: NewsArticle[]; summary: string | null;
  summary_status: 'ready' | 'not_configured' | 'unavailable';
  summary_model?: string | null;
}
export interface BacktestPoint { date: string; strategy: number; baseline: number; }
export interface BacktestResponse {
  period: { start: string; end: string }; folds: number; trades: number;
  strategyReturn: number; baselineReturn: number; alpha: number; maxDrawdown: number; points: BacktestPoint[];
  coreAllocation?: number; strategyLabel?: string; evaluationStatus?: string;
}
