import { PredictionHistoryItem } from '../types';
export default function PredictionHistory({ history, onClear, onSelect }: {
  history: PredictionHistoryItem[]; onClear: () => void; onSelect: (item: PredictionHistoryItem) => void;
}) {
  if (!history.length) return <p className="history-note">No saved predictions.</p>;
  const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value);
  return <div className="history-content" data-od-id="history">
    <button onClick={onClear} className="clear-button">Clear history</button>
    <div className="history-table"><table className="history-data">
      <thead className="history-head"><tr><th className="history-cell">Session</th><th className="history-cell">Target</th><th className="history-cell">Model estimate</th><th className="history-cell"><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{history.map(item => <tr key={item.id} className="history-row">
        <td className="history-cell">{item.sessionDate || new Date(item.timestamp).toLocaleDateString()}</td>
        <td className="history-cell">{item.targetDate || 'Next session'}</td>
        <td className="history-cell">{currency(item.prediction_price)}</td>
        <td className="history-cell"><button onClick={() => onSelect(item)} className="view-button">View</button></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
