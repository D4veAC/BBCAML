export interface OHLCVInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TrendType = 'Bullish' | 'Bearish' | 'Neutral';

export interface PredictionResponse {
  prediction_price: number;
  trend: TrendType;
  confidence: number;
}

export interface PredictionHistoryItem extends PredictionResponse {
  id: string;
  timestamp: string;
  input: OHLCVInput;
}

export interface ChartDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  predicted?: number;
}

export type ActiveTab = 'landing' | 'predict' | 'history' | 'about';
