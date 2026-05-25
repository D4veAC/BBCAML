import { motion } from 'motion/react';
import { PredictionResponse, OHLCVInput } from '../types';
import { Sparkles, Calendar, TrendingUp, TrendingDown, MinusCircle, AlertCircle } from 'lucide-react';

interface PredictionResultProps {
  result: PredictionResponse;
  input: OHLCVInput;
  timestamp: string;
}

export default function PredictionResult({ result, input, timestamp }: PredictionResultProps) {
  const { prediction_price, trend, confidence } = result;

  // Formatting helpers
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getPercentageString = (val: number) => {
    return `${Math.round(val * 100)}%`;
  };

  // Theme profiles dependent on predicted vector
  const themeProfiles = {
    Bullish: {
      borderColor: 'border-emerald-500/30',
      bgColor: 'bg-emerald-500/5',
      glowClass: 'glow-emerald',
      textColor: 'text-emerald-400',
      gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
      Icon: TrendingUp,
      badgeText: 'BULLISH REBOUND',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      description: 'The XGBoost model identifies high buying momentum with short-term support flags. BBCA closing positions are highly likely to test upper resistances.'
    },
    Bearish: {
      borderColor: 'border-rose-500/30',
      bgColor: 'bg-rose-500/5',
      glowClass: 'glow-rose',
      textColor: 'text-rose-400',
      gradient: 'from-rose-500/10 via-red-500/5 to-transparent',
      Icon: TrendingDown,
      badgeText: 'BEARISH CONSOLIDATION',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      description: 'High distribution vectors are highlighted in this session range. Downward selling pressure suggests standard support zone re-testing ranges.'
    },
    Neutral: {
      borderColor: 'border-amber-500/30',
      bgColor: 'bg-amber-500/5',
      glowClass: 'glow-teal',
      textColor: 'text-amber-400',
      gradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
      Icon: MinusCircle,
      badgeText: 'NEUTRAL ACCUMULATION',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      description: 'Equilibrium identified between buyers and sellers. Market volume suggests sideways range-bound movements with reduced directional conviction.'
    }
  };

  const profile = themeProfiles[trend];
  const IconComponent = profile.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`glass-panel p-6 rounded-2xl border ${profile.borderColor} ${profile.glowClass} space-y-6 text-left relative overflow-hidden`}
      id="prediction-result-panel"
    >
      {/* Visual Ambient Strip */}
      <div className={`absolute top-0 right-0 w-60 h-60 bg-gradient-to-bl ${profile.gradient} rounded-full blur-3xl -z-10`} />

      {/* Title */}
      <div className="flex items-center justify-between border-b border-gray-800/60 pb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <h4 className="text-sm font-bold tracking-wider text-gray-300 font-mono uppercase">Inference Output Card</h4>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-gray-400 font-mono bg-gray-900/40 px-2 py-1 rounded-lg">
          <Calendar className="h-3.5 w-3.5" />
          <span>{timestamp}</span>
        </div>
      </div>

      {/* Main Stats Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        
        {/* Trend & Target */}
        <div className="space-y-4">
          <div>
            <span className="text-[10px] text-gray-500 font-mono tracking-wide uppercase block">Calculated Trend Direction</span>
            <div className="flex items-center space-x-2.5 mt-1">
              <span className={`text-2xl font-bold tracking-tight ${profile.textColor}`}>{trend}</span>
              <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full font-mono ${profile.badgeColor}`}>
                {profile.badgeText}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-gray-500 font-mono tracking-wide uppercase block">Predicted Stock valuation</span>
            <p className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight mt-1">
              {formatIDR(prediction_price)}
            </p>
          </div>
        </div>

        {/* Confidence Dial Display */}
        <div className="flex flex-col items-center justify-center p-4 bg-gray-950/45 border border-gray-900 rounded-xl space-y-2">
          <span className="text-[10px] text-gray-500 font-mono tracking-wide uppercase block">MODEL CONFIDENCE SCORE</span>
          
          <div className="relative flex items-center justify-center h-20 w-20">
            {/* Simple Circular progress track bar */}
            <svg className="absolute -rotate-90 h-full w-full">
              <circle
                cx="40"
                cy="40"
                r="34"
                stroke="#1e293b"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="40"
                cy="40"
                r="34"
                stroke={trend === 'Bullish' ? '#10b981' : trend === 'Bearish' ? '#f43f5e' : '#f59e0b'}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - confidence)}`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <span className="text-sm font-extrabold text-white font-mono pt-0.5">
              {getPercentageString(confidence)}
            </span>
          </div>

          <p className="text-[10px] text-gray-400 font-medium text-center max-w-[200px] leading-relaxed">
            Gradient Boost target weight verification index.
          </p>
        </div>

      </div>

      {/* Model Commentary Text */}
      <div className="p-4 bg-gray-950/50 rounded-xl border border-gray-900 space-y-2">
        <h5 className="text-xs font-bold text-gray-300 flex items-center space-x-1.5">
          <IconComponent className={`h-4 w-4 ${profile.textColor}`} />
          <span>XGBoost Synapse Report</span>
        </h5>
        <p className="text-xs text-gray-400 font-sans leading-relaxed">
          {profile.description}
        </p>
      </div>

      {/* Inputs Echo Summary */}
      <div className="pt-4 border-t border-gray-800/65">
        <span className="text-[10px] text-gray-500 font-mono tracking-wide uppercase block mb-3 text-left">EVALUATED OHLCV PARAMETERS</span>
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
          <div className="p-2 bg-gray-950/30 rounded-lg">
            <span className="text-[9px] text-gray-500 block uppercase">Open</span>
            <span className="text-gray-300 text-[11px] font-semibold">{formatIDR(input.open)}</span>
          </div>
          <div className="p-2 bg-gray-950/30 rounded-lg">
            <span className="text-[9px] text-gray-500 block uppercase text-emerald-500">High</span>
            <span className="text-emerald-400 text-[11px] font-semibold">{formatIDR(input.high)}</span>
          </div>
          <div className="p-2 bg-gray-950/30 rounded-lg">
            <span className="text-[9px] text-gray-500 block uppercase text-rose-500">Low</span>
            <span className="text-rose-400 text-[11px] font-semibold">{formatIDR(input.low)}</span>
          </div>
          <div className="p-2 bg-gray-950/30 rounded-lg">
            <span className="text-[9px] text-gray-500 block uppercase">Close</span>
            <span className="text-gray-300 text-[11px] font-semibold">{formatIDR(input.close)}</span>
          </div>
          <div className="p-2 bg-gray-950/30 rounded-lg">
            <span className="text-[9px] text-gray-500 block uppercase text-teal-500">Volume</span>
            <span className="text-teal-400 text-[10px] font-semibold block truncate">
              {input.volume >= 1000000 ? `${(input.volume / 1000000).toFixed(1)}M` : input.volume.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Advisory Warning bottom bar */}
      <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl flex items-start space-x-2">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-400 leading-normal">
          <span className="text-amber-400 font-semibold">Financial Disclaimer:</span> This projection is formulated strictly for analytical presentation of historical BBCA trading data under non-linear regression testing. Never trade real capitals based solely on neural outputs.
        </p>
      </div>

    </motion.div>
  );
}
