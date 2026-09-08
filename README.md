# Qattan AI (قطان AI)

> **Next-Gen AI Architectural & Interior Visualization Studio**

Qattan AI is an architectural visualization prototype for turning facade images and floor-plan references into focused, reviewable design studies. The public experience uses an original editorial interface with responsive RTL/LTR support, a unified studio, and a server-side Gemini image engine.

## Current scope

### Live: Facade Restoration

Upload a facade image, describe the architectural direction, and generate one coordinated ultra-wide triptych through a single server-side OpenRouter request. The result contains three views of the same building:

1. Khedivial Classic
2. Hashami / Biophilic
3. Islamic Mashrabiya

The browser keeps the result available for native-resolution lightbox viewing and can download an HTML project/report record containing the source image, brief, and generated output.

### Live: Floor Plan to CAD

Upload a colored 2D or 3D floor plan and generate one 2×2 image containing four consistent architectural views:

| Quadrant | Drawing |
| --- | --- |
| Top-left | Plan |
| Top-right | Elevation |
| Bottom-left | Section |
| Bottom-right | Perspective |

The generated image is cached in the browser. Each quadrant can be cropped and converted locally into an editable ASCII DXF, and the four DXFs can be processed sequentially into a ZIP without another AI request. The vector pipeline uses high-resolution crop preprocessing, Potrace-WASM decoding, binary/thinning cleanup, orthogonal snapping, line merging, and the verified AC1009 R12-compatible DXF template.

**Important:** DXF output is raster-derived conceptual linework. It is not a measured survey or construction document. A licensed architect or engineer must verify dimensions, wall thicknesses, openings, layers, structure, code compliance, and permissions before professional use. DWG is not generated in-browser; AutoCAD can open the DXF and save it as DWG when required.

### Planned showcase modes

Exterior AI, Interior AI, Sketch to Image, Masterplan AI, Landscape AI, Virtual Staging, and Render Enhancer are represented in the studio as planned modes. They do not submit requests or claim independent production pipelines in this slice.

Accounts, persistence, billing, credit debiting, checkout, authentication, independent inpainting, and separate model pipelines are intentionally deferred.

## Routes

| Route | Purpose | Direction |
| --- | --- | --- |
| `/` | Default Qattan marketing page | Arabic RTL |
| `/ar` | Arabic marketing page | Arabic RTL |
| `/en` | English marketing page | English LTR |
| `/studio` | Unified facade/CAD workspace | English LTR by default |
| `/studio?mode=cad` | Opens the CAD workflow | English LTR |
| `/api/restore` | Server-side image-generation contract | POST only |

The language links are explicit route links and the active locale updates the document language and direction. Studio history is session-only and held in React state.

## Technical architecture

```text
Next.js App Router
├── app/                         # public, locale, studio, and API routes
├── components/qattan/           # Qattan marketing and workspace UI
├── client/src/components/       # preserved tested live facade/CAD engines
├── client/src/lib/              # image, restore, report, DXF, and CAD utilities
├── server/openrouter-engine.ts  # shared server-only OpenRouter service
└── tests/                       # Vitest and React Testing Library coverage
```

The application runs on **Next.js 15**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Vitest**, **OpenRouter**, **Sharp**, **Potrace-WASM**, and **JSZip**. The old Vite browser entrypoint and Express static server are not part of the Next runtime. Vite packages remain in the development dependency graph because the current Vitest React transformer uses them.

## OpenRouter API

`POST /api/restore` accepts:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "prompt": "Preserve the facade geometry and restore it with warm limestone...",
  "mode": "facade"
}
```

`mode` is optional and accepts `facade` or `cad`. Successful responses are:

```json
{
  "imageDataUrl": "https://provider.example/generated-image.png"
}
```

The route is implemented in `app/api/restore/route.ts` and shares validation, rate limiting, prompt selection, OpenRouter fallback handling, image extraction, and Sharp output trimming with the compatibility adapter in `api/restore.ts`. The browser never receives the OpenRouter key.

Set the server-only environment variable locally or in Vercel:

```text
OPENROUTER_API_KEY=your_openrouter_key_here
```

Never commit `.env` or a real key.

## Local development

### Prerequisites

- Node.js 18+ (Node.js 20 LTS recommended).
- npm.
- An OpenRouter account and API key for live generation.

### Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

The Next development server prints its local URL, normally `http://localhost:3000`.

### Verification commands

```bash
npm run typecheck
npm test
npm run build
npm run start
```

The test suite covers the original facade/CAD engine contracts, DXF orientation and serialization, local caching and ZIP behavior, Qattan marketing sections, locale direction, slider interaction, studio mode selection, and the shared OpenRouter request boundary.

## Vercel deployment

The canonical repository is:

- **GitHub:** [yusef47/egyptian-ai-facade-center](https://github.com/yusef47/egyptian-ai-facade-center)
- **Branch:** `main`
- **Product identity:** Qattan AI / قطان AI

`vercel.json` uses the Next.js framework and preserves the 60-second generation limit for `app/api/restore/route.ts`. Configure `OPENROUTER_API_KEY` in the Vercel Project Settings for Preview and Production before using the live tools.

A normal release check is:

```bash
npm ci
npm run typecheck
npm test
npm run build
git push origin main
```

Do not claim a Vercel deployment succeeded unless the hosting provider returns a deployment signal.

## Safety and professional review

- AI images and DXF files are conceptual studies, not construction documents.
- Verify geometry, dimensions, wall thicknesses, openings, materials, accessibility, heritage constraints, structural decisions, code compliance, and permissions with licensed professionals.
- The in-memory limiter is best-effort and instance-local; a production multi-instance deployment should use an external rate-limit store.
- Hosted output URLs are rendered as images; the API does not fetch arbitrary user-supplied URLs.
- The current preview does not provide authentication, persistence, billing, credit accounting, checkout, DWG generation, or independent inpainting.

## Project structure

```text
.
├── app/
│   ├── api/restore/route.ts      # Next server-side generation route
│   ├── ar/page.tsx               # Arabic marketing route
│   ├── en/page.tsx               # English marketing route
│   ├── studio/page.tsx           # Unified workspace route
│   ├── globals.css               # Qattan visual system
│   └── page.tsx                  # Arabic default route
├── components/qattan/             # Public site and studio components
├── client/src/components/         # Preserved tested facade/CAD UI engines
├── client/src/lib/                # Report, restore, image, DXF, and CAD helpers
├── api/restore.ts                 # Vercel compatibility adapter
├── server/openrouter-engine.ts    # Shared server-only OpenRouter implementation
├── tests/                         # Unit and component regressions
├── next.config.ts
├── package.json
└── vercel.json
```

## License

See [LICENSE](LICENSE) for the repository's license terms.
