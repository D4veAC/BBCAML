import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { ChartDataPoint } from '../types';
import { AreaChart as AreaIcon, BarChart3, TrendingUp, Info } from 'lucide-react';

interface StockChartProps {
  data: ChartDataPoint[];
}

export default function StockChart({ data }: StockChartProps) {
  const [chartView, setChartView] = useState<'area' | 'line' | 'volume'>('area');

  // Format currency
  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format Volume
  const formatVolume = (val: number) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M`;
    }
    return val.toLocaleString();
  };

  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as ChartDataPoint;
      const isBullish = dataPoint.close >= dataPoint.open;
      return (
        <div className="bg-[#0f172a]/95 border border-gray-800 p-4 rounded-xl shadow-2xl backdrop-blur-md text-left text-xs font-mono space-y-2">
          <p className="text-gray-400 font-sans font-semibold text-sm border-b border-gray-800 pb-1.5">{dataPoint.date}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-500">Open:</span>
            <span className="text-white text-right font-semibold">{formatIDR(dataPoint.open)}</span>
            
            <span className="text-gray-500">High:</span>
            <span className="text-emerald-400 text-right font-semibold">{formatIDR(dataPoint.high)}</span>
            
            <span className="text-gray-500">Low:</span>
            <span className="text-rose-400 text-right font-semibold">{formatIDR(dataPoint.low)}</span>
            
            <span className="text-gray-500">Close:</span>
            <span className="text-white text-right font-semibold">{formatIDR(dataPoint.close)}</span>
            
            <span className="text-gray-500">Volume:</span>
            <span className="text-teal-400 text-right font-semibold">{formatVolume(dataPoint.volume)}</span>
            
            {dataPoint.predicted && (
              <>
                <span className="text-amber-400 font-sans font-semibold">Predicted:</span>
                <span className="text-amber-400 text-right font-bold">{formatIDR(dataPoint.predicted)}</span>
              </>
            )}
          </div>
          <p className={`mt-2 text-center text-[10px] font-bold px-1.5 py-0.5 rounded ${isBullish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            Session Result: {isBullish ? 'BULLISH' : 'BEARISH'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel p-5 rounded-2xl glow-teal space-y-4" id="stock-chart">
      {/* Chart Headers and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/60 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>BBCA Historical Price Action</span>
            <span className="text-[10px] font-normal font-mono bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">
              Live Chart Context
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Visualizing Indonesia Stock Exchange (IDX: BBCA) closing benchmarks matching neural inputs.
          </p>
        </div>

        {/* View Switchers */}
        <div className="flex bg-gray-950/80 p-1 rounded-xl border border-gray-800 w-fit self-start sm:self-auto">
          <button
            onClick={() => setChartView('area')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              chartView === 'area'
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <PieChartIcon className="h-3.5 w-3.5" />
            <span>Price Area</span>
          </button>
          <button
            onClick={() => setChartView('line')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              chartView === 'line'
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>OHLC Band</span>
          </button>
          <button
            onClick={() => setChartView('volume')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              chartView === 'volume'
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Volume Log</span>
          </button>
        </div>
      </div>

      {/* Actual Chart render box */}
      <div className="h-80 min-h-80 md:h-96 md:min-h-96 w-full min-w-0 pt-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
          {chartView === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#64748b" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                dy={10}
              />
              <YAxis 
                domain={['auto', 'auto']} 
                stroke="#64748b" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => `Rp${val.toLocaleString()}`}
                dx={-10}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="close" stroke="#14b8a6" strokeWidth={2} fillOpacity={1} fill="url(#colorClose)" name="Close" />
              {data.some(d => d.predicted !== undefined) && (
                <Area type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="4 4" fillOpacity={1} fill="url(#colorPred)" name="Forecast" />
              )}
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            </AreaChart>
          ) : chartView === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
              <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `Rp${val.toLocaleString()}`} dx={-10} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="high" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 5" name="Highest Session Price" />
              <Line type="monotone" dataKey="low" stroke="#f43f5e" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 5" name="Lowest Session Price" />
              <Line type="monotone" dataKey="close" stroke="#06b6d4" strokeWidth={2.5} activeDot={{ r: 6 }} name="Close Price" />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatVolume} dx={-10} />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="volume" 
                fill="#14b8a6" 
                radius={[4, 4, 0, 0]} 
                name="Traded Shares Traded"
                fillOpacity={0.6}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Tip panel beneath chart */}
      <div className="bg-gray-950/40 border border-gray-900/60 p-3 rounded-xl flex items-start space-x-2.5">
        <Info className="h-4.5 w-4.5 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
          <strong className="text-gray-300">Technical Tip:</strong> Hover on any date index point above to read extensive open/close margins. Predictions display automatically in continuous orange indicators when custom inputs are processed via the XGBoost regression array.
        </p>
      </div>

    </div>
  );
}

// Inline fallback icon to prevent complex importing paths
function PieChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}
