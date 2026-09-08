# BBCAML

A BBCA price-estimation workspace with session input, Yahoo Finance quote autofill, model results, and browser-local history.

The UI displays only successful model responses. Market-data and prediction failures show errors; no sample quotes, simulated predictions, confidence scores, or performance claims are substituted. Quote timestamps identify the supplied session and do not imply real-time delivery.

## Local setup

1. Run `npm ci`.
2. Install Python dependencies with `python -m pip install -r backend/requirements.txt`.
3. Run `npm run serve:api` for the Python model service.
4. Run `npm run serve:proxy` for the web/API server.
5. Run `npm run dev` and open the Vite URL.

Vite forwards `/api` requests to the web server on port 3001. The web server forwards `/api/predict` to the Python service, defaulting to `http://127.0.0.1:5000/predict`. Copy `.env.example` to `.env` to change the upstream address. The browser uses same-origin APIs by default.

## Model requirements

The checked-in bundle is the BBCA-only quantitative slice adopted from AgenticBBCA. The current leakage-controlled benchmark selected XGBoost with OHLCV-only features, a 20-session window, and a next-session return target. Sentiment, retrieval, LLM reporting, broker-flow rules, other bank notebooks, and FX inputs are not part of this price endpoint.

The backend retrieves the prior BBCA sessions required by the selected window, appends the submitted OHLCV session, scales each row with the stored deployment scaler, and sends the flattened sequence to XGBoost. The server accepts only leakage-controlled bundle schema version 4. Return targets are trained in basis points and converted back at inference; bundles whose trees contain no feature splits are rejected. Missing input, incomplete market history, a missing bundle, or incompatible metadata stops inference and returns an error; there is no model or rule fallback.

Python pickle compatibility depends on the versions used to train and save the model. The dependency file lists runtime packages, not a verified training environment.

The bundle includes source-file SHA-256, source date range, split sizes, chosen feature set, and held-out metrics for traceability. The held-out figures describe one historical split and are not shown as a promise in the UI.

The checked-in model stays frozen by default so demos use the same validated bundle, trained with market data through 7 September 2026. Set `AUTO_RETRAIN_DAILY=true` to opt into retraining on a persistent model server. With `AUTO_RETRAIN_ON_START=true`, the service also retrains at startup; otherwise the scheduler runs daily at 18:00 Asia/Jakarta. Retraining downloads current Yahoo history, removes an incomplete current session, writes a candidate bundle atomically, validates it, and hot-reloads it. Inference returns `503` while retraining and remains unavailable after a failed retrain. Configure the schedule with `AUTO_RETRAIN_TIME`, `AUTO_RETRAIN_TIMEZONE`, and `AUTO_RETRAIN_RETRY_SECONDS`.

The same daily job refreshes the independent BBCA explanation corpus through Google News, valid publisher RSS feeds, and GDELT. A news-source failure is reported but does not replace or alter the quantitative forecast. Exact-time news published at or after 15:50 WIB becomes retrievable on the following date. Legacy date-only news is also delayed until the following date. Retrieval excludes evidence whose availability date is later than the requested explanation date.

The news panel requests current Google News RSS results for the latest session and reads the checked-in timestamped corpus for historical sessions. When `GROQ_API_KEY` is configured, the service summarizes only the returned headlines; it does not change the XGBoost forecast. `GROQ_API_KEYS` can hold comma-separated secondary keys, and `GROQ_MODELS` defines the preferred model order. The service also discovers currently active general-purpose Groq models and tries them after the preferred list. Audio, speech, prompt-guard, and safeguard models are excluded. Without a working key or model, sourced headlines remain visible and no generated summary is substituted. Keys belong only in the ignored local `.env` or the deployment platform's secret settings.

Retraining benchmarks the AgenticBBCA OHLCV candidate grid across price/return targets and windows 1, 10, 20, and 30. Splits are chronological, the evaluation scaler is fit on training rows only, and one decision session is purged at each boundary so a next-session target cannot cross into the following split. Selection and early stopping use validation only. Test is evaluated once, then the deployment model is refit on all labelled history with the selected tree count fixed.

Strategy tuning is quant-only and nested rolling-origin. Each inner window may choose an XGBoost price/return target, window 10/20, forecast threshold, two/three-session confirmation, 20-session breakout buffer, volume confirmation, trend regime, ATR stop, and an optional 3×/5× ATR take-profit. If stop and take-profit are both inside one daily candle, the simulation assumes the stop fills first. A signal formed from complete day-t OHLCV executes at the day-(t+1) open. New entries do not receive the overnight return, and a gap below a known stop fills at the next open. The simulation applies 0.15% buy fees, 0.25% sell fees, and 0.05% slippage per execution. Every outer forward fold is isolated from its parameter-selection window and starts and ends flat; its benchmark follows the same next-open and fold-reset convention. A tuned rule is not activated unless forward results support it.

The experimental news overlay trains a hashed unigram/bigram logistic classifier on timestamp-safe news available in the current and previous four trading sessions. It acts only as an entry veto over quant signals. Its threshold and minimum article count are selected inside a 252-session inner window. Folds stay in cash when the inner window has no positive candidate with sufficient trades and drawdown no worse than 12%. Reports separate raw quant performance, the risk-off policy, and the incremental effect of the news veto.

The current news-overlay result is exploratory and cannot support a deployable alpha claim. Its historical outer folds were inspected repeatedly while the strategy rules were developed, and the historical news corpus was backfilled after publication rather than captured by a contemporaneous point-in-time archive. The current rule must be pre-registered and confirmed only on newly arriving sessions.

Rebuild from current Yahoo history:

```powershell
npm run train:model
```

For a fixed AgenticBBCA CSV snapshot, run `python backend/train_model.py --data <path>`.

## Vercel deployment

The Vercel deployment contains a Vite `frontend` service and an Express `backend` service under `server/`. The backend provides quote lookup, XGBoost inference, news, backtest data, and status on same-origin `/api/*` routes. Prediction uses the exported 85 KB tree model in `server/model.json`, so production does not need a persistent Python process or a server outside Vercel. The local three-process setup remains available for research and retraining.

After retraining, run `npm run export:model` and commit both `xgboost_ohlcv_bundle.pkl` and `server/model.json`. After regenerating the news-overlay report, `npm run tune:news` also exports compact simulation data to `server/backtest-data.json`; run `npm run export:backtest` when only the checked-in report changed. Run `npm run export:server` after updating the historical news corpus. Set `GROQ_API_KEY` and optional `GROQ_API_KEYS`/`GROQ_MODELS` in Vercel Project Settings. Then import the repository with the Vercel Framework Preset set to Services. Do not upload `.env`.

## Checks

- `npm run lint`: TypeScript checks
- `npm test`: API failure and data-validation tests
- `python -m unittest discover -s backend -p "test_*.py"`: bundle, input, timing, execution, and split-boundary validation
- `npm run train:model`: fail-fast download and leakage-controlled retraining
- `npm run tune:strategy`: nested walk-forward threshold, exit, ATR, and trend-gate tuning
- `npm run tune:news`: nested timestamp-safe news-veto and quant comparison
- `npm run audit:news`: audit temporal boundaries and mark research-selection/news-archive limitations
- `npm run compare:windows`: compare training start dates on identical validation/test dates
- `npm run news:update`: update the independent BBCA timestamped-news corpus
- `npm run news:expand`: expand low-coverage months using topic, site, direct-RSS, and GDELT collectors
- `npm run build`: frontend production build

New history uses a separate storage key because older records may include simulated results. Existing legacy records are left untouched and are not displayed as model results.
