// Vercel Serverless Function — /api/backtest
// Serves the compact, checked-in simulation export. Static import keeps the
// data inside the function bundle across Vercel's standard and Services modes.

import { createRequire } from 'node:module';

const data = createRequire(import.meta.url)('./backtest-data.json');

export default async function handler(_req, res) {
  try {
    if (!Array.isArray(data.points) || data.points.length < 2) throw new Error('Invalid simulation export');
    res.setHeader('Cache-Control', 'no-store');
    return res.json(data);
  } catch {
    return res.status(503).json({ error: 'Simulation data is unavailable.' });
  }
}
