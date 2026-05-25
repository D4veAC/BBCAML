import { Cpu, BarChart2, TrendingUp, Sparkles, Code, CheckCircle2 } from 'lucide-react';

export default function AboutSection() {
  const modelMetrics = [
    { title: 'MAE', desc: 'Rp 155 average absolute error across test samples', icon: Code },
    { title: 'RMSE', desc: 'Rp 208 root mean squared error for model residuals', icon: Cpu },
    { title: 'MAPE / Dir Acc', desc: '2.05% MAPE with 52.59% directional accuracy', icon: TrendingUp },
  ];

  const featuresList = [
    {
      name: 't-0_low',
      desc: 'Today low price for current session.',
      importance: 0.086656,
    },
    {
      name: 't-7_low',
      desc: 'Low price from seven bars ago, capturing weekly support structure.',
      importance: 0.064126,
    },
    {
      name: 't-13_close',
      desc: 'Close price 13 bars ago, used for medium-term momentum anchoring.',
      importance: 0.060516,
    },
    {
      name: 't-2_low',
      desc: 'Low price two bars ago, indicating recent pullback support.',
      importance: 0.060131,
    },
    {
      name: 't-0_high',
      desc: 'Today high price for current session.',
      importance: 0.047905,
    },
    {
      name: 't-1_low',
      desc: 'Previous bar low price, a local support indicator.',
      importance: 0.046139,
    },
    {
      name: 't-0_open',
      desc: 'Current session open price, capturing opening sentiment.',
      importance: 0.041946,
    },
    {
      name: 't-14_low',
      desc: 'Low price from 14 bars ago, reflecting longer-term support.',
      importance: 0.040364,
    },
    {
      name: 't-6_close',
      desc: 'Close price six bars ago, used for short-term reversal detection.',
      importance: 0.037396,
    },
    {
      name: 't-6_high',
      desc: 'High price six bars ago, capturing prior resistance points.',
      importance: 0.032182,
    },
  ];

  return (
    <div className="space-y-12 py-4 text-left" id="about-section">
      
      {/* Introduction Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Core Description card */}
        <div className="lg:col-span-7 glass-panel p-6 sm:p-8 rounded-2xl glow-teal flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <span className="inline-flex items-center space-x-1.5 text-[10px] font-mono font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/15 px-2.5 py-1 rounded-full uppercase tracking-wider">
              System Architecture
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
              XGBoost Regression <br className="hidden sm:inline" />
              Against Banking Spot Channels
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed font-sans">
              XGBoost (Extreme Gradient Boosting) stands as a highly optimized distributed gradient boosting library designed for extreme hardware-efficient speed and machine learning scaling. Unlike traditional neutral nets (such as LSTMs) which require immense sequence sizes and fail at sudden stock distribution breaks, XGBoost works by serially training shallow decision trees on tabular OHLCV data to construct maximum local support margins.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed font-sans">
              For BBCA (Bank Central Asia) — the largest market-capitalization private banking stock on the Indonesia Stock Exchange — price action is closely linked to macro institutional liquidity. This model maps relationships between intra-session ranges and volume arrays to predict targeted bullish or bearish breakouts with extreme speed.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-900 text-xs font-mono">
            <div>
              <span className="text-gray-500 block">BASE ENGINE</span>
              <span className="text-teal-400 font-bold block mt-0.5">XGBoost v2.0+</span>
            </div>
            <div>
              <span className="text-gray-500 block">TUNING MATRIX</span>
              <span className="text-teal-400 font-bold block mt-0.5">Optuna Hyper-set</span>
            </div>
            <div>
              <span className="text-gray-500 block">MODEL STATS</span>
              <span className="text-teal-400 font-bold block mt-0.5">MAE 155 / RMSE 208</span>
            </div>
          </div>
        </div>

        {/* Visual Pipeline flow card */}
        <div className="lg:col-span-5 glass-panel p-6 sm:p-8 rounded-2xl glow-teal flex flex-col justify-between space-y-6">
          <h4 className="text-sm font-bold tracking-wider text-gray-300 font-mono uppercase">Inference Pipeline Flow</h4>
          
          <div className="space-y-4">
            
            {/* Step 1 */}
            <div className="flex items-start space-x-3.5 relative">
              <div className="absolute top-5 left-3.5 w-0.5 h-8 bg-gray-800" />
              <div className="h-7 w-7 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center font-mono text-teal-400 text-xs font-bold shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">OHLCV Ingestion</span>
                <p className="text-[11px] text-gray-500">Retrieves real-time session vectors and measures gaps.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-3.5 relative">
              <div className="absolute top-5 left-3.5 w-0.5 h-8 bg-gray-800" />
              <div className="h-7 w-7 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center font-mono text-teal-400 text-xs font-bold shrink-0">
                2
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Feature Normalization</span>
                <p className="text-[11px] text-gray-500">Scales volume and processes logarithmic volatility bands.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-3.5 relative">
              <div className="absolute top-5 left-3.5 w-0.5 h-8 bg-gray-800" />
              <div className="h-7 w-7 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center font-mono text-teal-400 text-xs font-bold shrink-0">
                3
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">XGBoost Regression Decisioning</span>
                <p className="text-[11px] text-gray-500">Evaluates 150+ tree levels using gradient descent step indices.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start space-x-3.5">
              <div className="h-7 w-7 rounded-lg bg-teal-500/10 border border-teal-500/25 flex items-center justify-center font-mono text-teal-400 text-xs font-bold shrink-0">
                4
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Probability Filtering</span>
                <p className="text-[11px] text-gray-500">Combines prediction target and assigns categorical trend scores.</p>
              </div>
            </div>

          </div>

          <div className="p-3 bg-gray-950/40 rounded-xl border border-gray-950/80 text-[11px] text-gray-400 font-sans">
            Through parallel leaf-wise split allocations, XGBoost outputs responses in under <span className="text-emerald-400 font-mono font-medium">5ms</span> at live servers.
          </div>
        </div>

      </div>

      {/* Feature Weighting Breakdown Card */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl glow-teal space-y-6">
        <div>
          <h4 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>Real XGBoost Feature Importance</span>
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            This chart shows the actual trained importance ranking from the model, using real lagged OHLC features.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            The values are derived from the trained XGBoost importance scores, so the UI now reflects model-driven feature priorities rather than generic assumptions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {featuresList.map((item, idx) => {
            const relativeWidth = `${((item.importance / 0.086656) * 100).toFixed(0)}%`;
            return (
              <div key={idx} className="bg-gray-950/40 p-4 border border-gray-900 rounded-xl flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-teal-400 font-semibold truncate max-w-[120px]" title={item.name}>{item.name}</span>
                    <span className="text-xs font-bold text-white font-mono">{item.importance.toFixed(6)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-normal">{item.desc}</p>
                </div>
                
                {/* Importance Visual Bar graph */}
                <div className="w-full bg-[#111827] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full"
                    style={{ width: relativeWidth }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project Objectives */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modelMetrics.map((met, key) => {
          const IconComponent = met.icon;
          return (
            <div key={key} className="p-5 bg-gray-950/30 border border-gray-900 rounded-2xl.5 flex items-start space-x-4">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 shrink-0">
                <IconComponent className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-500 font-mono block tracking-wider uppercase">{met.title}</span>
                <span className="text-sm font-bold text-white leading-snug block">{met.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
