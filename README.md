<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6e1800c6-d311-4718-805b-15fa7fa9a8a3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the Python prediction API server:
   `npm run serve:api`
4. Run the app:
   `npm run dev`

If you’d like to use another backend address, set `VITE_PREDICT_API_URL` in your environment before starting the app.
