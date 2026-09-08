// Vercel Serverless Function — /api/status
export default function handler(_req, res) {
  res.json({ status: 'ok', service: 'web' });
}
