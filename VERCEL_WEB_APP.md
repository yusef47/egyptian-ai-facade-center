# V109.0 Vercel Web App

This directory is the root Vite + React + TypeScript + Tailwind implementation of the Egyptian Center facade mockup. The existing Python/Kaggle app remains unchanged.

## Local development

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Verification

```bash
npm test -- --run
npm run typecheck
npm run build
```

## Vercel deployment

1. Import this repository into Vercel.
2. Keep the detected framework as Vite.
3. Add `OPENROUTER_API_KEY` in Vercel Project Settings → Environment Variables. Do not prefix it with `VITE_`.
4. Deploy with the configured build command `npm run build` and output directory `dist`.
5. The server-side route is `/api/restore`; it calls `google/gemini-3.1-flash-lite-image` and never exposes the key to the browser.

## Security and rate-limit note

The route validates prompts and compressed image payloads, hides upstream errors, and applies a six-request-per-minute in-memory limiter per observed client address on each warm serverless instance. This is a best-effort burst guard, not distributed abuse protection: Vercel instances do not share memory. Before opening the endpoint to untrusted public traffic or significant spend, add authentication and/or a distributed limiter such as Upstash Redis using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
