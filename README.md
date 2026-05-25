# BBCAML

BBCAML is a BBCA stock prediction workspace built with React, Vite, and an XGBoost-based OHLCV prediction flow. The app shows a live BBCA ticker, lets users run price-direction predictions, and keeps recent prediction history in the browser.

## Features

- Live BBCA.JK market data through a server-side Yahoo Finance proxy
- OHLCV prediction form with XGBoost-style output
- Interactive stock chart and prediction result panel
- Local prediction history saved in browser storage
- Production-ready single-service setup for Railway

## Tech Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS
- Express
- Python prediction server for the local model workflow

## Local Setup

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the Yahoo Finance proxy:

```bash
npm run serve:proxy
```

Optional: run the local Python prediction API:

```bash
npm run serve:api
```

By default, local development uses:

- Frontend: `http://127.0.0.1:3000`
- Yahoo proxy: `http://127.0.0.1:3001/api/yahoo`
- Prediction API: `http://127.0.0.1:5000/predict`

## Environment Variables

Set these only when you need to override the defaults:

```bash
VITE_YAHOO_PROXY_URL=
VITE_PREDICT_API_URL=
```

For production on Railway, leave `VITE_YAHOO_PROXY_URL` unset if the frontend and proxy run from the same service. The app will automatically call:

```text
/api/yahoo?symbol=BBCA.JK&interval=1d&range=1d
```

## Production Build

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The Express server serves both:

- the built frontend from `dist`
- the Yahoo Finance proxy at `/api/yahoo`

## Railway Deploy

Use these Railway settings:

- Build command: `npm run build`
- Start command: `npm start`

Current production URL:

```text
https://bbcaml-production.up.railway.app/
```

## Scripts

- `npm run dev` - start the Vite development server
- `npm run build` - create the production frontend build
- `npm start` - serve the production app and Yahoo proxy
- `npm run serve:proxy` - run only the Yahoo Finance proxy
- `npm run serve:api` - run the local Python prediction API
- `npm run lint` - run TypeScript checks

