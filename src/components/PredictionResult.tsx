import { OHLCVInput, PredictionResponse } from '../types';
export default function PredictionResult({ result, input, timestamp, sessionDate, targetDate }: {
  result: PredictionResponse; input: OHLCVInput; timestamp: string; sessionDate?: string; targetDate?: string;
}) {
  const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(value);
  const difference = result.prediction_price - input.close;
  return <div className="result-card" id="prediction-result-panel">
    <h2 className="result-heading">{targetDate ? `${targetDate} close estimate` : 'Next-session close estimate'}</h2>
    <p className="result-price">{currency(result.prediction_price)}</p>
    <p className="result-difference">{difference > 0 ? '+' : ''}{currency(difference)} compared with the entered close of {currency(input.close)}.</p>
    <dl className="result-inputs">{Object.entries(input).map(([key, value]) => <div key={key}>
      <dt className="input-name">{key}</dt><dd>{key === 'volume' ? value.toLocaleString() : currency(value)}</dd>
    </div>)}</dl>
    <p className="result-time">{sessionDate ? `Based on ${sessionDate} session · ` : ''}Requested {new Date(timestamp).toLocaleString()}</p>
  </div>;
}
