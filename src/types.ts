export interface OHLCVInput {
  open: number; high: number; low: number; close: number; volume: number;
}
export interface PredictionResponse { prediction_price: number; }
export interface PredictionHistoryItem extends PredictionResponse {
  id: string; timestamp: string; input: OHLCVInput;
}
