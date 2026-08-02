# Egyptian Center for AI in Architecture & Urbanism — AI Facade Restoration

National AI platform for restoring and regenerating Egyptian architectural facades in 8K.

## Stack

- React 19 + Vite 6 + TypeScript + Tailwind CSS v4
- Bilingual (English default / Arabic RTL toggle)
- `/api/restore` serverless route → OpenRouter `google/gemini-3.1-flash-lite-image`

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # vite build → dist/public
```

## Environment

`OPENROUTER_API_KEY` must be configured (Vercel project env vars).

## Deploy

Push to GitHub `main` — Vercel builds `npm run build` and serves `dist/public`.
