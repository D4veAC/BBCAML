import { OHLCVInput, PredictionResponse } from '../types';
import { idxPriceTick, nearestTradablePrice } from '../data/price';
export default function PredictionResult({ result, input, timestamp, sessionDate, targetDate }: {
  result: PredictionResponse; input: OHLCVInput; timestamp: string; sessionDate?: string; targetDate?: string;
}) {
  const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)}`;
  const tick = idxPriceTick(input.close);
  const displayPrice = nearestTradablePrice(result.prediction_price, input.close);
  const displayDifference = displayPrice - input.close;
  const rawReturn = (result.prediction_price - input.close) / input.close;
  return <div className="result-card" id="prediction-result-panel">
    <h2 className="result-heading">{targetDate ? `${targetDate} close estimate` : 'Next-session close estimate'}</h2>
    <p className="result-price">{currency(displayPrice)}</p>
    <p className="result-difference">{displayDifference === 0
      ? `Model move ${signedPercent(rawReturn)} is below one IDX price tick (${currency(tick)}). Nearest tradable price remains ${currency(input.close)}.`
      : `${displayDifference > 0 ? '+' : ''}${currency(displayDifference)} from ${currency(input.close)} · raw model move ${signedPercent(rawReturn)}.`}</p>
    <dl className="result-inputs">{Object.entries(input).map(([key, value]) => <div key={key}>
      <dt className="input-name">{key}</dt><dd>{key === 'volume' ? value.toLocaleString() : currency(value)}</dd>
    </div>)}</dl>
    <p className="result-time">{sessionDate ? `Based on ${sessionDate} session · ` : ''}Requested {new Date(timestamp).toLocaleString()}</p>
  </div>;
}
