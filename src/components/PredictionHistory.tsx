import { useState } from 'react';
import { PredictionHistoryItem, TrendType } from '../types';
import { Trash2, TrendingUp, TrendingDown, MinusCircle, Search, HelpCircle, ArrowUpRight } from 'lucide-react';

interface PredictionHistoryProps {
  history: PredictionHistoryItem[];
  onClear: () => void;
  onSelect: (item: PredictionHistoryItem) => void;
}

export default function PredictionHistory({ history, onClear, onSelect }: PredictionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [trendFilter, setTrendFilter] = useState<'ALL' | TrendType>('ALL');

  // Format currency
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Filter conditions
  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.timestamp.includes(searchTerm) || 
                          item.prediction_price.toString().includes(searchTerm) || 
                          item.input.close.toString().includes(searchTerm);
    const matchesTrend = trendFilter === 'ALL' || item.trend === trendFilter;
    return matchesSearch && matchesTrend;
  });

  const getTrendBadge = (trend: TrendType) => {
    switch (trend) {
      case 'Bullish':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Bullish</span>
          </span>
        );
      case 'Bearish':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <TrendingDown className="h-3.5 w-3.5" />
            <span>Bearish</span>
          </span>
        );
      case 'Neutral':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <MinusCircle className="h-3.5 w-3.5" />
            <span>Neutral</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" id="prediction-history-tab">
      
      {/* Search and filter controls toolbar */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
            <Search className="h-4.5 w-4.5" />
          </div>
          <input
            type="text"
            placeholder="Search price, source target, or dates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-4 py-2 text-sm bg-gray-950/60 border border-gray-850 focus:border-teal-500 focus:ring-teal-500/30 rounded-xl text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 font-medium mr-2">Filter Matrix:</span>
          {(['ALL', 'Bullish', 'Bearish', 'Neutral'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setTrendFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                trendFilter === filter
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900/40 bg-transparent border border-transparent'
              }`}
            >
              {filter}
            </button>
          ))}

          {history.length > 0 && (
            <button
              onClick={onClear}
              className="ml-auto md:ml-4 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

      </div>

      {/* Main interactive history layout table */}
      <div className="glass-panel rounded-2xl overflow-hidden glow-teal">
        {filteredHistory.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-gray-950/50 border border-gray-800 flex items-center justify-center mx-auto">
              <HelpCircle className="h-6 w-6 text-gray-500" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-300">No Historical Log Found</h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                Inputs you predict will store automatically in local memory stacks for comparative visual forecasting. Make a predict run now!
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800/60">
              
              {/* Header */}
              <thead className="bg-[#0e1423]">
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 font-mono tracking-wider">
                    TIMESTAMP UTC
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 font-mono tracking-wider">
                    OHLC BENCHMARK
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 font-mono tracking-wider">
                    TARGET FORECAST
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 font-mono tracking-wider">
                    TREND STATE
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 font-mono tracking-wider">
                    CONFIDENCE WEIGHT
                  </th>
                  <th scope="col" className="relative px-5 py-3.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              {/* Rows */}
              <tbody className="divide-y divide-gray-900/60 bg-transparent text-xs font-mono">
                {filteredHistory.map((item) => {
                  const subVolume = item.input.volume >= 1000000 
                    ? `${(item.input.volume / 1000000).toFixed(1)}M` 
                    : item.input.volume.toLocaleString();
                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-gray-900/25 transition-colors group"
                    >
                      {/* Time */}
                      <td className="px-5 py-4 text-left whitespace-nowrap text-gray-300">
                        {item.timestamp}
                      </td>

                      {/* OHLC Mini details */}
                      <td className="px-5 py-4 text-left whitespace-nowrap space-y-1">
                        <div className="flex space-x-2 text-gray-500">
                          <span>O: <span className="text-gray-300">{formatIDR(item.input.open)}</span></span>
                          <span>H: <span className="text-emerald-400">{formatIDR(item.input.high)}</span></span>
                        </div>
                        <div className="flex space-x-2 text-gray-500">
                          <span>L: <span className="text-rose-400">{formatIDR(item.input.low)}</span></span>
                          <span>C: <span className="text-gray-300">{formatIDR(item.input.close)}</span></span>
                          <span className="text-teal-400">({subVolume})</span>
                        </div>
                      </td>

                      {/* Forecast Target */}
                      <td className="px-5 py-4 text-left whitespace-nowrap text-white font-bold text-sm">
                        {formatIDR(item.prediction_price)}
                      </td>

                      {/* Trend badge */}
                      <td className="px-5 py-4 text-left whitespace-nowrap">
                        {getTrendBadge(item.trend)}
                      </td>

                      {/* Confidence weight */}
                      <td className="px-5 py-4 text-left whitespace-nowrap font-semibold text-teal-400">
                        {Math.round(item.confidence * 100)}%
                      </td>

                      {/* Link mapper button */}
                      <td className="px-5 py-4 text-right whitespace-nowrap text-gray-500">
                        <button
                          onClick={() => onSelect(item)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-teal-500/5 hover:bg-teal-500/10 text-teal-400 hover:text-teal-200 border border-teal-500/10 transition-all cursor-pointer opacity-80 hover:opacity-100"
                          title="Restore parameters to active simulator charts"
                        >
                          <span>Visualize</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

    </div>
  );
}
