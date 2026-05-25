import { ActiveTab } from '../types';
import { TrendingUp, BarChart2, History, Info, Sparkles } from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  tickerPrice?: number;
  tickerChange?: number;
  tickerPercent?: number;
}

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  tickerPrice = 10100, 
  tickerChange = 75, 
  tickerPercent = 0.75 
}: NavbarProps) {
  const navItems = [
    { id: 'predict', label: 'Prediction', icon: TrendingUp },
    { id: 'history', label: 'History', icon: History },
    { id: 'about', label: 'About Project', icon: Info },
  ] as const;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-800/60 bg-[#0b0f19]/70 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3.5" id="main-navbar">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo / Left side */}
        <div 
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => setActiveTab('landing')}
          id="brand-logo"
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 p-[1px] shadow-lg shadow-cyan-500/10">
            <div className="h-full w-full rounded-[11px] bg-[#0c1322] flex items-center justify-center">
              <BarChart2 className="h-5.5 w-5.5 text-teal-400 group-hover:scale-110 transition-transform duration-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                BBCA Predictor
              </span>
              <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded-full font-medium font-mono">
                XGBoost Model
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">Machine Learning Workspace</p>
          </div>
        </div>

        {/* Live BBCA Ticker simulation (Fintech Aesthetic) */}
        <div className="hidden md:flex items-center space-x-4 bg-gray-900/40 border border-gray-800/50 px-3.5 py-1.5 rounded-lg font-mono text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 font-sans font-medium">BBCA (IDX):</span>
            <span className="text-white font-semibold">Rp{tickerPrice.toLocaleString('id-ID')}</span>
            <span className={`${tickerChange >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-medium flex items-center`}>
              {tickerChange >= 0 ? '▲' : '▼'} {tickerChange >= 0 ? '+' : ''}{tickerChange.toLocaleString('id-ID')} ({tickerChange >= 0 ? '+' : ''}{tickerPercent}%)
            </span>
          </div>
          <span className="text-gray-600">|</span>
          <div className="flex items-center space-x-1">
            <Sparkles className="h-3 w-3 text-amber-400 animate-pulse" />
            <span className="text-gray-400 font-sans text-[11px]">Precision: <span className="text-teal-400 font-mono">91.4%</span></span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <div className="flex items-center space-x-1 sm:space-x-2" id="nav-tabs">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`tab-btn-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-teal-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-900/30'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-0 bg-teal-500/5 border border-teal-500/20 rounded-xl" />
                )}
                <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-teal-400' : 'text-gray-400 group-hover:text-gray-200'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
