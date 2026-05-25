import { ChartDataPoint } from '../types';

export const dummyHistoricalData: ChartDataPoint[] = [
  { date: '2026-05-01', open: 9600, high: 9675, low: 9550, close: 9625, volume: 68500000 },
  { date: '2026-05-04', open: 9650, high: 9750, low: 9600, close: 9725, volume: 72100000 },
  { date: '2026-05-05', open: 9725, high: 9800, low: 9675, close: 9750, volume: 54300000 },
  { date: '2026-05-06', open: 9750, high: 9775, low: 9625, close: 9650, volume: 83900000 },
  { date: '2026-05-07', open: 9650, high: 9700, low: 9575, close: 9600, volume: 49200000 },
  { date: '2026-05-08', open: 9600, high: 9675, low: 9575, close: 9650, volume: 51000000 },
  { date: '2026-05-11', open: 9675, high: 9825, low: 9650, close: 9800, volume: 91400000 },
  { date: '2026-05-12', open: 9825, high: 9900, low: 9775, close: 9850, volume: 88700000 },
  { date: '2026-05-13', open: 9850, high: 9875, low: 9725, close: 9750, volume: 62400000 },
  { date: '2026-05-14', open: 9750, high: 9800, low: 9700, close: 9775, volume: 55900000 },
  { date: '2026-05-15', open: 9775, high: 9850, low: 9750, close: 9825, volume: 61000000 },
  { date: '2026-05-18', open: 9825, high: 9950, low: 9800, close: 9925, volume: 74500000 },
  { date: '2026-05-19', open: 9925, high: 10050, low: 9900, close: 10025, volume: 105400000 },
  { date: '2026-05-20', open: 10025, high: 10100, low: 9975, close: 10000, volume: 92100000 },
  { date: '2026-05-21', open: 10000, high: 10075, low: 9950, close: 10025, volume: 78300000 },
  { date: '2026-05-22', open: 10025, high: 10150, low: 10000, close: 10100, volume: 89600000 },
];

export const getEstimatedTarget = (close: number): number => {
  // Let the client predict a realistic valuation in case connection to custom endpoint can't be reached
  const randomFactor = (Math.random() - 0.45) * 0.04; // Slightly bullish bias
  return Math.round(close * (1 + randomFactor) / 25) * 25; // BBCA ticks in multiples of 25 IDR
};
