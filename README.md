# Egyptian Center for AI in Architecture & Urbanism

> **المركز المصري للذكاء الاصطناعي في العمارة والعمران**
>
> A bilingual architectural-restoration studio for developing high-fidelity, AI-assisted concepts for Egyptian facades and urban heritage.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%20v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Deployment](https://img.shields.io/badge/Deployment-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)

## Executive summary

The Egyptian Center for AI in Architecture & Urbanism is a national-facing design and research interface for exploring the restoration of Egyptian building facades with generative AI. The experience combines architectural briefing, heritage-style direction, image conditioning, and a presentation-ready output board in one focused workflow.

The initiative is developed in collaboration with the **Egyptian Engineers Syndicate (نقابة المهندسين المصرية)** and the committee chaired by **Dr. Ahmed**. Generated images are conceptual design studies—not structural, historic-preservation, or construction documents—and must be reviewed by licensed architects and engineers before use in a real project.

### What the application does

- Accepts an existing facade image through drag-and-drop or file selection.
- Compresses the client image before submission to protect serverless payload limits.
- Accepts a free-form architectural brief and optional heritage-style direction.
- Sends one restoration request to OpenRouter using `google/gemini-3.1-flash-lite-image`.
- Presents one cohesive 8K-style architectural triptych board with three restoration directions:
  1. **Khedivial Classic**
  2. **Hashami / Biophilic**
  3. **Islamic Mashrabiya**
- Supports English-first UI with an **EN | عربي** toggle and full Arabic RTL layout.
- Returns a hosted image URL whenever possible, avoiding oversized serverless responses.
- Provides an official syndicate-report download workflow for the generated board and metadata.

## Technical architecture

```text
Browser (React + Vite + Tailwind)
        |
        | POST /api/restore
        | { imageDataUrl, prompt }
        v
Vercel Serverless Function (api/restore.ts)
        |
        | OpenRouter Chat Completions
        | model: google/gemini-3.1-flash-lite-image
        v
Hosted image URL or compressed image data URL
        |
        v
Triptych output board + report download
```

### Frontend

- **React 19** with TypeScript.
- **Vite 6** for development and production bundling.
- **Tailwind CSS v4** for the dark obsidian / Cairo-gold visual system.
- **Lucide React** for interface icons.
- A shared i18n provider with English as the default language and Arabic RTL support.
- Client-side image compression before the API request.

### Backend

`api/restore.ts` is a Vercel serverless function. It validates the method, image data URL, and prompt; applies a lightweight in-memory request limiter; calls OpenRouter; extracts the generated image; and always returns structured JSON.

The model is configured as:

```text
google/gemini-3.1-flash-lite-image
```

The server reads the key only from the runtime environment:

```text
OPENROUTER_API_KEY
```

No API key belongs in source control, README files, browser code, or committed `.env` files.

## Master architectural engine

The restoration brief is intended to guide a single-call architectural presentation rather than three unrelated generations. The master direction covers Egyptian and international references including:

- Khedivial Cairo.
- Islamic Mamluk and Fatimid architecture.
- Hashami stone and biophilic facade treatments.
- Neo-Pharaonic revival language.
- Alexandrian Greco-Roman references.
- Hassan Fathy, Antonio Lasciac, and Mario Rossi as historical design references.

### Triptych specification

Every requested board should be composed as one coherent architectural presentation sheet with thin Cairo-gold separators and the same source-building geometry carried through all panels:

| Panel | Direction | Typical emphasis |
| --- | --- | --- |
| 1 | Khedivial Classic | Proportion, cornices, balconies, limestone, heritage color and light |
| 2 | Hashami / Biophilic | Hashami stone, planting, passive shade, tactile natural materials |
| 3 | Islamic Mashrabiya | Mashrabiya screens, rhythmic openings, Mamluk/Fatimid detail |

A single API call is designed to produce this board. The indicative generation estimate is **approximately $0.033 / 1.6 EGP per generation**, but actual pricing depends on the selected provider, model pricing, token/image usage, exchange rate, account plan, and OpenRouter billing changes.

## API contract

### `POST /api/restore`

Request body:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "prompt": "Restore this Egyptian facade while preserving its proportions..."
}
```

Successful response:

```json
{
  "imageDataUrl": "https://cdn.example.com/generated-board.png"
}
```

The client also accepts a compressed fallback such as:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

The API prefers hosted `https://` image URLs. If OpenRouter returns base64 data, `sharp` downsizes and re-encodes the image to keep the response comfortably below the Vercel serverless response limit. The implementation targets a fallback below **2 MB**, protecting against Vercel's approximately **4.5 MB** response ceiling.

### Error responses

Errors are returned as JSON rather than allowing an unhandled gateway failure:

```json
{
  "error": "A human-readable explanation"
}
```

Common statuses include:

- `400` — invalid method, missing image, malformed data URL, or invalid prompt.
- `401` — missing or invalid OpenRouter credentials.
- `402` / `429` — provider credits, quota, or rate-limit issue.
- `413` — input image is too large.
- `502` — upstream provider returned an unusable response.
- `500` — unexpected server-side failure.

## Local development

### Prerequisites

- Node.js 18+ (Node.js 20 LTS recommended).
- npm.
- An OpenRouter account and API key for live generation.

### Install

```bash
git clone https://github.com/yusef47/egyptian-ai-facade-center.git
cd egyptian-ai-facade-center
npm install
cp .env.example .env
```

Set the key in `.env` for local serverless development or in your shell:

```bash
OPENROUTER_API_KEY=your_openrouter_key_here
```

Never commit `.env`. The repository's `.gitignore` excludes local environment files.

### Commands

```bash
# Start Vite development server
npm run dev

# TypeScript validation
npm run typecheck

# Run the Vitest suite once
npm test

# Watch tests during development
npm run test:watch

# Build the production bundle
npm run build

# Preview the production bundle
npm run preview
```

Vite serves the local application at the URL printed in the terminal (normally `http://localhost:5173`). For end-to-end serverless testing, use Vercel's local runtime or deploy a preview so `/api/restore` is available alongside the frontend.

## Vercel deployment

The canonical repository is:

- **GitHub:** [yusef47/egyptian-ai-facade-center](https://github.com/yusef47/egyptian-ai-facade-center)
- **Branch:** `main`
- **Live app:** [egyptian-ai-facade-center.vercel.app](https://egyptian-ai-facade-center.vercel.app)

### Configure the environment

In Vercel Project Settings → **Environment Variables**, add:

```text
OPENROUTER_API_KEY=<your key>
```

Apply it to the environments that need generation: Preview and/or Production. Redeploy after changing environment variables.

`vercel.json` configures the Vite build output and gives the restoration function up to 60 seconds:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist/public",
  "functions": {
    "api/restore.ts": {
      "maxDuration": 60
    }
  }
}
```

A normal release flow is:

```bash
git checkout main
git pull --ff-only origin main
npm ci
npm run typecheck
npm test
npm run build
git push origin main
```

Vercel then creates a deployment from the updated `main` branch.

## Security and operational notes

- Keep `OPENROUTER_API_KEY` server-side. The browser must call `/api/restore`, never OpenRouter directly.
- Do not paste keys into source files, issues, screenshots, commit messages, or README files.
- Input images are converted to data URLs in the browser and sent only when the user submits the restoration request.
- Hosted image URLs returned by the provider are rendered as images; the API does not fetch arbitrary user-supplied URLs.
- The in-memory limiter is best-effort and instance-local. Use an external rate-limit store before operating at national or multi-instance scale.
- AI outputs can contain visual inaccuracies, invented details, or stylistic artifacts. Preserve the original facade and validate all dimensions, materials, accessibility, heritage constraints, and structural decisions independently.

## Project structure

```text
.
├── api/
│   └── restore.ts                 # Vercel OpenRouter restoration endpoint
├── client/
│   └── src/
│       ├── components/            # Navbar, hero, studio, report and page sections
│       ├── lib/
│       │   ├── i18n.tsx           # EN/AR translations and RTL state
│       │   ├── restore.ts         # Client request/response helper
│       │   └── report.ts           # Syndicate report download helpers
│       ├── pages/                 # Routed application pages
│       └── index.css               # Global visual system and fonts
├── tests/                         # Vitest and React Testing Library tests
├── .env.example                   # Environment variable names only
├── package.json                   # Scripts and dependencies
├── vercel.json                    # Vercel build/function configuration
├── vite.config.ts                 # Vite configuration
└── vitest.config.ts               # Test configuration
```

## Troubleshooting

### `OPENROUTER_API_KEY` is missing

Add the variable to the local `.env` file or Vercel Project Settings, then restart the dev server or redeploy. Do not add a literal key to the repository.

### `402` or insufficient credits

The provider accepted the request but the OpenRouter account cannot currently fund it. Check the account credits and model availability at [OpenRouter settings](https://openrouter.ai/settings/credits). This is an account condition, not a frontend build failure.

### `429` or quota exceeded

Wait for the provider window to reset, reduce repeated submissions, or review the OpenRouter account/model limits. The API returns a structured error so the client can display a useful message.

### `413` or payload too large

Use a smaller source image. The client compresses uploads and the server limits input size, while `sharp` optimizes generated base64 output. Hosted image URLs are preferred because they avoid returning the image bytes through the serverless response.

### The UI builds but `/api/restore` is unavailable locally

Vite alone serves the frontend. Run the project through a Vercel-compatible local workflow or use a deployed Preview environment when testing the serverless function.

## Status and responsibility

This repository is an evolving architectural AI prototype and presentation tool. It is not a replacement for measured surveys, conservation approvals, engineering calculations, planning permissions, material specifications, or construction supervision.

The visual identity and product direction honor Egyptian architectural heritage and the collaboration with the Egyptian Engineers Syndicate. Any public deployment should add the project's approved governance, privacy, retention, accessibility, and professional-review policies.

## License

See [LICENSE](LICENSE) for the repository's license terms.

## Acknowledgements

- Egyptian Center for AI in Architecture & Urbanism — **المركز المصري للذكاء الاصطناعي في العمارة والعمران**.
- Egyptian Engineers Syndicate — **نقابة المهندسين المصرية**.
- Committee Chair Dr. Ahmed.
- OpenRouter and the configured Gemini image-generation model.
- The open-source React, Vite, Tailwind CSS, Lucide, Vitest, and Sharp communities.
