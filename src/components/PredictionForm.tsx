import React, { useState } from 'react';
import { OHLCVInput } from '../types';
import { Play, RotateCcw, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react';

interface PredictionFormProps {
  onPredict: (inputs: OHLCVInput) => void;
  isLoading: boolean;
  realtimeInput?: OHLCVInput | null;
  yahooAvailable: boolean;
  yahooStatusText: string;
  onRetryYahoo: () => void;
}

export default function PredictionForm({ onPredict, isLoading, realtimeInput, yahooAvailable, yahooStatusText, onRetryYahoo }: PredictionFormProps) {
  // Primary Form State
  const [inputs, setInputs] = useState<OHLCVInput>({
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  });

  // Validation Error State
  const [errors, setErrors] = useState<Partial<Record<keyof OHLCVInput | 'general', string>>>({});

  // Populate form with real BBCA spot prices for instant click-testing
  const handleLoadPreserveValues = () => {
    if (!realtimeInput) {
      setErrors({ general: 'Live Yahoo Finance data is unavailable right now. Please try again later.' });
      return;
    }

    setInputs({
      open: realtimeInput.open,
      high: realtimeInput.high,
      low: realtimeInput.low,
      close: realtimeInput.close,
      volume: realtimeInput.volume,
    });
    setErrors({});
  };

  const handleInputChange = (field: keyof OHLCVInput, value: string) => {
    const numericValue = value === '' ? 0 : parseFloat(value);
    
    // Update inputs
    const updatedInputs = {
      ...inputs,
      [field]: numericValue,
    };
    setInputs(updatedInputs);

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }

    // Dynamic warning clearance when relation looks alright
    if (errors.general) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.general;
        return copy;
      });
    }
  };

  const handleReset = () => {
    setInputs({
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
    });
    setErrors({});
  };

  // Safe submission validation
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Partial<Record<keyof OHLCVInput | 'general', string>> = {};

    // 1. Positive checks
    if (inputs.open <= 0) newErrors.open = 'Open price must be greater than Rp0';
    if (inputs.high <= 0) newErrors.high = 'High price must be greater than Rp0';
    if (inputs.low <= 0) newErrors.low = 'Low price must be greater than Rp0';
    if (inputs.close <= 0) newErrors.close = 'Close price must be greater than Rp0';
    if (inputs.volume <= 0) newErrors.volume = 'Trading volume must be greater than 0';

    // 2. Relative limits validation
    if (inputs.high < inputs.low) {
      newErrors.general = 'High price cannot be less than Low price';
    } else if (inputs.high < inputs.open || inputs.high < inputs.close) {
      newErrors.general = 'High price must represent the highest value in this session';
    } else if (inputs.low > inputs.open || inputs.low > inputs.close) {
      newErrors.general = 'Low price must represent the lowest value in this session';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Pass validated models
    onPredict(inputs);
  };

  return (
    <div className="glass-panel p-6 rounded-2xl glow-teal text-left space-y-6" id="prediction-input-panel">
      
      {/* Title block */}
      <div className="flex items-start justify-between border-b border-gray-800/60 pb-4 gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>OHLCV Vector Input</span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Input standard pricing segments for direct neural matrix parsing.
          </p>
          <p className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold ${
            yahooAvailable ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}>
            {yahooAvailable ? 'Yahoo Finance ON' : 'Yahoo Finance unavailable'}
          </p>
          {!yahooAvailable && (
            <div className="mt-2 space-y-2">
              <p className="text-[10px] text-rose-300 font-mono max-w-sm">
                {yahooStatusText}
              </p>
              <button
                type="button"
                onClick={onRetryYahoo}
                disabled={isLoading}
                className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry Yahoo
              </button>
            </div>
          )}
        </div>
        
        <button
          type="button"
          onClick={handleLoadPreserveValues}
          disabled={isLoading || !realtimeInput}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-200 ${
            realtimeInput
              ? 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border-teal-500/25'
              : 'bg-gray-950/30 text-gray-500 border-gray-700 cursor-not-allowed'
          }`}
          title={realtimeInput ? 'Fills inputs with BBCA current active indicators' : 'Live Yahoo Finance data not available for autofill'}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Quick Autofill</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* General Alert Error box */}
        {errors.general && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errors.general}</span>
          </div>
        )}

        {/* OHLC Fields Grid */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Open */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase block">
              Open Price
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono text-gray-500">
                Rp
              </div>
              <input
                type="number"
                min="0"
                step="25"
                placeholder="e.g. 10000"
                value={inputs.open || ''}
                onChange={(e) => handleInputChange('open', e.target.value)}
                disabled={isLoading}
                className={`block w-full pl-9 pr-3 py-2.5 text-sm bg-gray-950/60 border rounded-xl text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 transition-all ${
                  errors.open
                    ? 'border-rose-500/40 focus:border-rose-500 focus:ring-rose-500/30'
                    : 'border-gray-850 focus:border-teal-500 focus:ring-teal-500/30'
                }`}
              />
            </div>
            {errors.open && (
              <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1 mt-0.5">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.open}</span>
              </p>
            )}
          </div>

          {/* High */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase block">
              High Price
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono text-gray-500">
                Rp
              </div>
              <input
                type="number"
                min="0"
                step="25"
                placeholder="e.g. 10150"
                value={inputs.high || ''}
                onChange={(e) => handleInputChange('high', e.target.value)}
                disabled={isLoading}
                className={`block w-full pl-9 pr-3 py-2.5 text-sm bg-gray-950/60 border rounded-xl text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 transition-all ${
                  errors.high
                    ? 'border-rose-500/40 focus:border-rose-500 focus:ring-rose-500/30'
                    : 'border-gray-850 focus:border-teal-500 focus:ring-teal-500/30'
                }`}
              />
            </div>
            {errors.high && (
              <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1 mt-0.5">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.high}</span>
              </p>
            )}
          </div>

          {/* Low */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase block">
              Low Price
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono text-gray-500">
                Rp
              </div>
              <input
                type="number"
                min="0"
                step="25"
                placeholder="e.g. 9950"
                value={inputs.low || ''}
                onChange={(e) => handleInputChange('low', e.target.value)}
                disabled={isLoading}
                className={`block w-full pl-9 pr-3 py-2.5 text-sm bg-gray-950/60 border rounded-xl text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 transition-all ${
                  errors.low
                    ? 'border-rose-500/40 focus:border-rose-500 focus:ring-rose-500/30'
                    : 'border-gray-850 focus:border-teal-500 focus:ring-teal-500/30'
                }`}
              />
            </div>
            {errors.low && (
              <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1 mt-0.5">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.low}</span>
              </p>
            )}
          </div>

          {/* Close */}
          <div className="space-y-1.5 col-span-1">
            <label className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase block">
              Close Price
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono text-gray-500">
                Rp
              </div>
              <input
                type="number"
                min="0"
                step="25"
                placeholder="e.g. 10100"
                value={inputs.close || ''}
                onChange={(e) => handleInputChange('close', e.target.value)}
                disabled={isLoading}
                className={`block w-full pl-9 pr-3 py-2.5 text-sm bg-gray-950/60 border rounded-xl text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 transition-all ${
                  errors.close
                    ? 'border-rose-500/40 focus:border-rose-500 focus:ring-rose-500/30'
                    : 'border-gray-850 focus:border-teal-500 focus:ring-teal-500/30'
                }`}
              />
            </div>
            {errors.close && (
              <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1 mt-0.5">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.close}</span>
              </p>
            )}
          </div>

        </div>

        {/* Volume Field (Full Width) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase block">
            Traded Volume (Shares)
          </label>
          <div className="relative rounded-lg shadow-sm">
            <input
              type="number"
              min="0"
              placeholder="e.g. 78000000"
              value={inputs.volume || ''}
              onChange={(e) => handleInputChange('volume', e.target.value)}
              disabled={isLoading}
              className={`block w-full px-3 py-2.5 text-sm bg-gray-950/60 border rounded-xl text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 transition-all ${
                errors.volume
                  ? 'border-rose-500/40 focus:border-rose-500 focus:ring-rose-500/30'
                  : 'border-gray-850 focus:border-teal-500 focus:ring-teal-500/30'
              }`}
            />
          </div>
          {inputs.volume > 0 && (
            <p className="text-[10px] text-gray-500 mt-1 font-mono">
              Volume: {inputs.volume.toLocaleString()} shares
            </p>
          )}
          {errors.volume && (
            <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1 mt-0.5">
              <AlertCircle className="h-3 w-3" />
              <span>{errors.volume}</span>
            </p>
          )}
        </div>

        {/* Form CTA Buttons */}
        <div className="flex space-x-3 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={handleReset}
            className="flex-1 flex items-center justify-center space-x-1.5 bg-gray-900/40 hover:bg-gray-800/80 border border-gray-800 text-gray-400 hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Clear Fields</span>
          </button>
          
          <button
            type="submit"
            disabled={isLoading}
            id="btn-predict-submit"
            className="flex-2 flex items-center justify-center space-x-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-955 font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg shadow-teal-500/15 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current shrink-0" />
            <span>{isLoading ? 'Inference Running...' : 'Execute Forecast'}</span>
          </button>
        </div>

      </form>
    </div>
  );
}
