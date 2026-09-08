# Qattan AI (قطان AI)

> **Architectural & Interior Visualization AI Platform**
> An original, MNML.ai-inspired product implementation for turning architectural intent into presentation-ready visual studies.

Qattan AI is a bilingual Arabic/English architectural visualization platform. It combines a public product site with a unified browser studio for facade restoration and floor-plan-to-CAD workflows. The application is designed as an MNML.ai-style clone at the product and information-architecture level while using original Qattan AI copy, components, styling, and local visual treatments rather than copying proprietary source code or assets.

## Platform identity and current scope

### Product identity

- **Name:** Qattan AI / قطان AI
- **Positioning:** Architectural & Interior Visualization AI Platform
- **Primary users:** Architects, interior designers, urban designers, visualization artists, students, and review committees
- **Locales:** Arabic RTL and English LTR
- **Deployment target:** Vercel
- **Canonical repository:** [`yusef47/egyptian-ai-facade-center`](https://github.com/yusef47/egyptian-ai-facade-center)

### Live workflows

#### 1. Facade Restoration / Architectural Triptych

The user uploads a facade image and supplies a design brief. One server-side OpenRouter request returns one ultra-wide architectural presentation image containing three coordinated views of the same building:

1. **Khedivial Classic**
2. **Hashami / Biophilic**
3. **Islamic Mashrabiya**

The source building's massing, proportions, floor levels, and opening rhythm are preserved while the architectural skin and material direction vary. The browser keeps the generated result available for native-resolution viewing, fullscreen inspection, and Syndicate report export.

#### 2. Floor Plan to CAD

The user uploads a colored 2D or 3D floor plan. One server-side request generates a single 2×2 image containing four consistent architectural views:

| Quadrant | Output |
| --- | --- |
| Top-left | Plan |
| Top-right | Elevation |
| Bottom-left | Section |
| Bottom-right | Perspective |

The generated image is cached in browser memory. Each quadrant is cropped, upscaled, thresholded, vectorized locally, and exported as an editable ASCII DXF. The four DXFs can be processed sequentially into a ZIP without making another AI request.

> **Professional-use notice:** AI images and raster-derived DXF files are conceptual studies, not measured surveys or construction documents. A licensed architect or engineer must verify dimensions, wall thicknesses, openings, structure, materials, code compliance, and permissions before professional use. The browser exports DXF; AutoCAD can open the DXF and save it as DWG when required.

## Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Web framework | **Next.js 15 App Router** | Public routes, studio route, metadata, and server route handlers |
| UI runtime | **React 19** | Interactive marketing, locale, studio, upload, and export interfaces |
| Language | **TypeScript** | Typed route boundaries, content dictionaries, server contracts, and utilities |
| Styling | **Tailwind CSS v4** plus authored CSS | Responsive layout, design tokens, RTL/LTR presentation, and Qattan visual system |
| Component system | **Shadcn UI patterns / Radix UI primitives** | Accessible component foundations retained in `client/src/components/ui` and used as the project UI vocabulary |
| Motion | **Framer Motion** | Available for product motion and interaction polish as the interface evolves |
| Icons | **Lucide React** | Consistent, accessible interface iconography |
| AI provider | **OpenRouter** | Secure server-side gateway to multimodal image generation |
| AI model | **Google Gemini multimodal image model** — `google/gemini-3.1-flash-lite-image` | Facade triptych and four-view CAD image generation |
| Image processing | **Sharp** | Server-side output compression to stay within serverless response limits |
| Raster vectorization | **Potrace-WASM** and browser canvas preprocessing | Local contour/path extraction for conceptual CAD linework |
| CAD packaging | **ASCII DXF AC1009/R12 template** and **JSZip** | AutoCAD-compatible individual DXF and ZIP downloads |
| Testing | **Vitest** and **React Testing Library** | Unit, contract, locale, component, export, and migration-parity coverage |
| Hosting | **Vercel** | Next.js deployment and serverless API execution |

## Application architecture

```text
Browser
  │
  ├── Public marketing routes: /, /ar, /en
  │      └── QattanMarketingPage
  │
  └── Unified studio: /studio
         └── QattanStudio
              ├── Facade Restoration
              │     └── EngineSection → client restore helper
              └── Floor Plan to CAD
                    └── CadVectorizerSection
                          ├── one /api/restore request in CAD mode
                          └── local crop → upscale → threshold → Potrace → DXF/ZIP

Next App Router
  └── /api/restore
        └── lib/openrouter-engine.ts
              └── OpenRouter → Gemini multimodal image generation
```

The OpenRouter key is read only by server-side code. The browser sends an image data URL, prompt, and optional mode to `/api/restore`; it never receives or bundles the provider credential.

## Routes

| Route | Purpose | Direction / status |
| --- | --- | --- |
| `/` | Default Qattan AI marketing page | Arabic RTL |
| `/ar/` | Explicit Arabic marketing page | Arabic RTL |
| `/en/` | Explicit English marketing page | English LTR |
| `/studio/` | Unified architectural workspace | English LTR by default |
| `/studio?mode=cad` | Opens Floor Plan to CAD | Live |
| `/studio?mode=facade` | Opens Facade Restoration | Live |
| `/studio?mode=<planned-mode>` | Shows an honest planned-mode notice | Non-submitting showcase state |
| `/api/restore` | Secure multimodal generation endpoint | `POST` only |

## Complete directory map

The primary implementation locations are:

- Public marketing pages: `/app/page.tsx`, `/app/ar/`, and `/app/en/`
- Unified Architectural Studio: `/app/studio/page.tsx`
- Qattan product and studio components: `/components/qattan/*`
- API and engine routes: `/app/api/` — currently `/app/api/restore/route.ts`

```text
.
├── app/
│   ├── page.tsx                       # Default Arabic marketing page
│   ├── ar/page.tsx                    # Explicit Arabic marketing route
│   ├── en/page.tsx                    # Explicit English marketing route
│   ├── studio/page.tsx                # Unified Architectural Studio route
│   ├── api/
│   │   └── restore/route.ts           # Next.js OpenRouter API adapter
│   ├── layout.tsx                     # Root metadata, document shell, providers
│   ├── globals.css                    # Qattan tokens, layout, responsive styles
│   ├── icon.svg                       # App Router favicon
│   └── not-found.tsx                  # Branded not-found screen
│
├── components/
│   └── qattan/
│       ├── QattanMarketingPage.tsx    # Full public marketing composition
│       ├── QattanHeader.tsx            # Responsive brand/navigation header
│       ├── QattanHero.tsx              # Hero and primary studio CTAs
│       ├── BeforeAfterSlider.tsx       # Accessible visual comparison slider
│       ├── WorkflowSection.tsx         # Three-step workflow section
│       ├── ToolShowcase.tsx            # Live and planned tool cards
│       ├── IntegrationStrip.tsx        # Architectural software compatibility copy
│       ├── PricingPreview.tsx          # Non-purchasing access/pricing preview
│       ├── FaqSection.tsx              # Accessible FAQ accordion
│       ├── QattanFooter.tsx            # Footer and professional-use disclaimer
│       ├── QattanProviders.tsx         # Locale and client provider boundary
│       ├── LocaleLink.tsx              # Locale-aware internal links
│       ├── qattan-content.ts           # Typed Arabic/English copy and tool metadata
│       ├── QattanStudio.tsx             # Unified studio state boundary
│       ├── StudioControlRail.tsx       # Mode and upload control region
│       ├── StudioViewport.tsx          # Live output / planned-state viewport
│       ├── StudioHistoryRail.tsx       # Session-only history and exports
│       └── PlannedModeNotice.tsx       # Honest non-live tool state
│
├── client/src/
│   ├── components/
│   │   ├── EngineSection.tsx           # Live facade restoration engine UI
│   │   ├── CadVectorizerSection.tsx    # Live four-view CAD/DXF engine UI
│   │   ├── SyndicateReport.tsx         # Existing report compatibility surface
│   │   └── ui/                         # Shadcn/Radix-style UI primitives
│   └── lib/
│       ├── restore.ts                  # Browser API client for /api/restore
│       ├── image.ts                    # Image compression and data URL helpers
│       ├── report.ts                   # Syndicate report generation
│       ├── cadExport.ts                # Quadrant crop, timeout, ZIP orchestration
│       ├── dxf.ts                      # Potrace transform and AC1009 DXF serializer
│       ├── i18n.tsx                    # Existing engine translation provider
│       └── rateLimit.ts                # Client/test-compatible rate-limit utility
│
├── server/
│   └── openrouter-engine.ts             # Shared server-only prompts and OpenRouter logic
├── api/
│   └── restore.ts                       # Vercel compatibility adapter
├── public/
│   └── logos/                           # Static official branding assets, when present
├── tests/                               # Vitest and React Testing Library regressions
├── next.config.ts                       # Next and browser-only dependency boundaries
├── package.json                          # Scripts and production dependencies
├── package-lock.json                     # Reproducible npm dependency lockfile
├── tsconfig.json                         # TypeScript configuration
├── postcss.config.mjs                    # Tailwind/PostCSS configuration
├── vercel.json                           # Vercel Next.js deployment configuration
└── .env.example                          # Environment variable template
```

## Core tool catalog

The product catalog is intentionally broader than the currently enabled generation engines. This allows the marketing experience to describe the full Qattan AI vision while keeping production behavior truthful.

### Live tools

- **Facade Restoration:** One request, one ultra-wide triptych result, fullscreen inspection, and report export.
- **Floor Plan to CAD:** One request, four architectural views, local Potrace/DXF vectorization, individual downloads, and ZIP export.

### Planned showcase tools

The following tool names are represented in the product roadmap and/or planned studio states. They do not submit unsupported requests in the current slice:

- **Exterior AI** — facade and massing studies
- **Interior AI** — interior atmosphere and finish studies
- **Sketch2Img / Sketch to Image** — early sketch to visual concept workflow
- **Canvas Inpainting** — targeted edits to selected regions of an image
- **Masterplan AI** — site and urban design direction studies
- **Landscape AI** — planting, public realm, and landscape atmosphere studies
- **Virtual Staging** — furnishing and presentation studies
- **Render Enhancer** — future high-resolution render enhancement workflow
- **Video AI** — future architectural animation and motion studies

Planned tools display a planned/coming-soon state and never pretend to have independent production pipelines, billing, authentication, or model routes.

## AI backend engine

### Provider and model

The backend uses Gemini multimodal image generation models through OpenRouter. The current model constant is:

```text
google/gemini-3.1-flash-lite-image
```

The primary Next.js route is:

```text
/app/api/restore/route.ts
```

Shared server behavior is implemented in:

```text
/lib/openrouter-engine.ts
```

The compatibility adapter at `api/restore.ts` remains available for the existing Vercel/server contract, while the deployed Next App Router uses `app/api/restore/route.ts`.

### Request contract

`POST /api/restore` accepts JSON:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "prompt": "Preserve the facade geometry and explore warm limestone...",
  "mode": "facade"
}
```

`mode` is optional and currently accepts:

- `facade` — the master architectural triptych prompt
- `cad` — the zero-text, four-quadrant architectural CAD prompt

Successful responses use the stable contract:

```json
{
  "imageDataUrl": "https://provider.example/generated-image.png"
}
```

Validation rejects missing/invalid images, oversized data URLs, and prompts shorter than the minimum length. The server also applies best-effort instance-local rate limiting, retries providers that reject a system message by inlining the system prompt, extracts hosted or base64 image responses, and uses Sharp to reduce oversized data URL responses.

### Cost-preserving generation strategy

- **Facade:** one API request produces the complete three-panel presentation board.
- **CAD:** one API request produces the complete 2×2 image; four DXF downloads are local browser work.
- Downloading an individual DXF or the ZIP does **not** call `/api/restore` again.
- Actual provider cost depends on OpenRouter pricing, account configuration, and model availability; the application does not hard-code a billing guarantee.

## Local setup

### Prerequisites

- Node.js 18.18+; Node.js 20 LTS is recommended.
- npm.
- An OpenRouter account and API key for live generation.

### Install

From the repository root:

```bash
npm install
cp .env.example .env
```

Set the server-only key in `.env`:

```dotenv
OPENROUTER_API_KEY=your_openrouter_api_key
```

Never commit `.env` or a real key. Do not rename this variable with a `NEXT_PUBLIC_` prefix.

### Development

```bash
npm run dev
```

The Next.js development server normally runs at `http://localhost:3000`.

### Production build and verification

```bash
npm run typecheck
npm test
npm run build
npm run start
```

The repository's test suite covers the route contract, OpenRouter request construction, bilingual direction, public marketing sections, before/after interaction, live/planned studio modes, facade reports, CAD caching, Potrace/DXF serialization, ZIP behavior, and migration route parity.

## Deployment on Vercel

The project is deployed as a Next.js App Router application through Vercel. The canonical GitHub repository and deployment branch are:

```text
https://github.com/yusef47/egyptian-ai-facade-center
branch: main
```

The root `vercel.json` intentionally selects Next.js and does not configure the legacy Vite `dist` output directory:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "functions": {
    "app/api/restore/route.ts": {
      "maxDuration": 60
    }
  }
}
```

Configure `OPENROUTER_API_KEY` in Vercel Project Settings for the required Preview and Production environments. The serverless restore route has a 60-second maximum duration. Vercel should run the standard Next.js build and use `.next` as its generated output; no `outputDirectory: "dist"` setting is required.

A release verification sequence is:

```bash
npm ci
npm run typecheck
npm test
npm run build
git diff --check
git push origin main
```

Do not treat a successful Git push as proof that a Vercel deployment completed. Confirm the deployment result in Vercel's build/deployment logs separately.

## Security, reliability, and product boundaries

- `OPENROUTER_API_KEY` is server-only and is never rendered into client code.
- Image data URLs are validated and bounded before they reach the provider.
- The in-memory rate limiter is best-effort and instance-local; a multi-instance production deployment should use an external rate-limit store.
- Hosted output URLs are rendered as images; the API does not fetch arbitrary user-provided URLs.
- Browser CAD downloads use cached output and local processing to prevent accidental rebilling.
- Session history is React state only and is not persistent storage.
- The current slice does not claim real authentication, accounts, billing, credit balances, checkout, database persistence, independent inpainting, DWG generation, or independent model pipelines for every catalog card.
- All AI outputs require human architectural review before professional, regulatory, construction, or heritage use.

## License

See [LICENSE](LICENSE) for the repository's license terms.
