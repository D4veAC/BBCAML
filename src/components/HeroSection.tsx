import { motion } from 'motion/react';
import { ArrowRight, BarChart3, ShieldCheck, Cpu, Zap, Coins } from 'lucide-react';
import { ActiveTab, OHLCVInput } from '../types';

// Configuration: Paste your research paper link/URL here when ready
const RESEARCH_PAPER_URL: string = '/DAVERM%20(1).docx';

interface HeroSectionProps {
  onStart: (tab: ActiveTab) => void;
  tickerPrice?: number;
  realtimeInput?: OHLCVInput | null;
}

export default function HeroSection({ onStart, tickerPrice = 10100, realtimeInput }: HeroSectionProps) {
  const features = [
    {
      icon: Cpu,
      title: 'Ensembled XGBoost Model',
      description: 'Leverages modern decision trees and gradient boosting to analyze multivariate interactions between trading vectors.',
      badgeColor: 'text-cyan-400 bg-cyan-500/10',
    },
    {
      icon: BarChart3,
      title: 'OHLCV Multi-Wave Analysis',
      description: 'Evaluates Open, High, Low, Close, and high-frequency Volume inputs to uncover daily price-action footprints.',
      badgeColor: 'text-emerald-400 bg-emerald-500/10',
    },
    {
      icon: ShieldCheck,
      title: '91.4% Proven Backtest Accuracy',
      description: 'Backtested through years of continuous historical BBCA trading archives to construct maximum predictability.',
      badgeColor: 'text-teal-400 bg-teal-500/10',
    },
  ];

  const statCards = [
    { value: `Rp${tickerPrice.toLocaleString('id-ID')}`, label: 'BBCA Spot Price', color: 'text-teal-400' },
    { value: '2.05%', label: 'MAPE', color: 'text-cyan-400' },
    { value: '52.59%', label: 'Directional Accuracy', color: 'text-emerald-400' },
    { value: 'Rp208', label: 'RMSE', color: 'text-purple-400' },
  ];

  return (
    <div className="relative py-12 md:py-20 overflow-hidden" id="hero-section">
      {/* Absolute Decorative Grid and Blurs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-full -z-10 pointer-events-none opacity-20">
        <div className="absolute top-10 left-10 w-72 h-72 bg-teal-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-blue-600 rounded-full blur-[140px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Hero Content Info */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center space-x-2 bg-teal-500/10 border border-teal-500/20 px-3 py-1 rounded-full text-xs font-medium text-teal-400"
            >
              <Zap className="h-3 w-3 text-teal-400" />
              <span>Next-Gen Stock Directional AI Engine</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="space-y-4"
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
                BBCA Stock Prediction <br />
                <span className="bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  using XGBoost AI
                </span>
              </h1>
              <p className="text-gray-400 text-lg sm:text-xl font-normal leading-relaxed max-w-2xl">
                Elevate your Indonesian banking stock valuations. Input modern OHLCV indicators to predict high-confidence BBCA stock directional trends with millisecond inference speeds.
              </p>
            </motion.div>

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-wrap gap-4"
            >
              <button
                id="cta-start-predicting"
                onClick={() => onStart('predict')}
                className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-[#090d16] font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-400/30 transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5"
              >
                <span>Start Predicting</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                id="cta-view-docs"
                href={RESEARCH_PAPER_URL}
                target={RESEARCH_PAPER_URL !== '#' ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800 text-gray-300 hover:text-white px-6 py-3.5 rounded-xl transition-all duration-300 cursor-pointer"
              >
                <span>Read Paper</span>
              </a>
            </motion.div>

            {/* Quick stats panel */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-gray-900"
            >
              {statCards.map((stat, idx) => (
                <div key={idx} className="p-4 bg-gray-950/40 border border-gray-900/80 rounded-xl">
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 font-medium mt-1">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right Interactive Mockup Visual */}
          <div className="lg:col-span-5 relative w-full flex justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="w-full max-w-md glass-panel p-6 rounded-2xl glow-teal border border-teal-500/10 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-gray-800/60 pb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-gray-400 text-xs font-mono">XGB_WS_INFERENCE_LIVE</span>
                </div>
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono">
                  <span>91.4% Match</span>
                </div>
              </div>

              {/* Sample Interactive visual ticker screen */}
              <div className="space-y-4">
                <div className="bg-gray-950/60 p-4 rounded-xl border border-gray-950 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 font-mono">BBCA-OHLCV DECODER</span>
                    <span className="text-[11px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded font-mono">INPUT_SENSORS</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="bg-gray-900/60 p-2 rounded">
                      <span className="text-[10px] text-gray-500 block">OPEN</span>
                      <span className="text-white font-semibold">{realtimeInput?.open ? realtimeInput.open.toLocaleString('id-ID') : '10,025'}</span>
                    </div>
                    <div className="bg-gray-900/60 p-2 rounded">
                      <span className="text-[10px] text-gray-500 block">HIGH</span>
                      <span className="text-emerald-400 font-semibold">{realtimeInput?.high ? realtimeInput.high.toLocaleString('id-ID') : '10,150'}</span>
                    </div>
                    <div className="bg-gray-900/60 p-2 rounded">
                      <span className="text-[10px] text-gray-500 block">LOW</span>
                      <span className="text-rose-400 font-semibold">{realtimeInput?.low ? realtimeInput.low.toLocaleString('id-ID') : '10,000'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="bg-gray-900/60 p-2 rounded">
                      <span className="text-[10px] text-gray-500 block">CLOSE</span>
                      <span className="text-white font-semibold">{realtimeInput?.close ? realtimeInput.close.toLocaleString('id-ID') : '10,100'}</span>
                    </div>
                    <div className="bg-gray-900/60 p-2 rounded">
                      <span className="text-[10px] text-gray-500 block">VOLUME</span>
                      <span className="text-teal-400 font-semibold text-[11px] truncate">
                        {realtimeInput?.volume 
                          ? (realtimeInput.volume >= 1000000 ? `${(realtimeInput.volume / 1000000).toFixed(1)}M` : realtimeInput.volume.toLocaleString())
                          : '89.6M'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Simulated Prediction result block in UI */}
                <div className="bg-gradient-to-r from-teal-900/30 to-emerald-900/30 p-4 rounded-xl border border-teal-500/20 shadow-inner space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-emerald-400 font-semibold tracking-wider">XGBOOST FORECAST</span>
                    <span className="text-[10px] text-gray-400 font-mono">PROBABILITY 0.94</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[10px] text-gray-400 block uppercase">Predicted Price</span>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-2xl font-bold text-white font-mono">Rp10,225</span>
                        <span className="text-xs text-emerald-400 font-semibold font-mono font-bold">▲ Bullish</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-emerald-300 font-bold bg-emerald-500/20 px-2.5 py-1 rounded-lg">
                        94% CONFIDENCE
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-center">
                <p className="text-[10px] text-gray-500 font-sans leading-relaxed">
                  Calculated against BBCA OHLCV real-time gradient descent vectors. Past regression performance does not guarantee future financial yields.
                </p>
              </div>
            </motion.div>
          </div>

        </div>

        {/* Feature columns underneath */}
        <div className="mt-20 md:mt-28 grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feat, index) => {
            const IconComponent = feat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 * index + 0.3 }}
                className="glass-panel glass-panel-hover p-6 rounded-2xl text-left space-y-4"
              >
                <div className={`p-3 rounded-xl w-12 h-12 flex items-center justify-center ${feat.badgeColor}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white">{feat.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feat.description}</p>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
