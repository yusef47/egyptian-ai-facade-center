# Qattan AI Architectural Visualization Platform — Slices 1–2 Design Specification

**Date:** 2026-09-07
**Status:** Approved design; awaiting written-spec review before implementation
**Repository:** `yusef47/egyptian-ai-facade-center`
**Deployment:** Vercel, canonical branch `main`

## Goal

Rebuild the current architectural prototype into an original, production-quality Qattan AI (`قطان AI`) architectural and interior visualization experience with an MNML-inspired public information architecture and a unified studio, while preserving the existing, verified facade-triptych and floor-plan-to-DXF workflows.

## Scope boundary

This specification covers two deployable slices:

1. **Public product site and framework foundation**
2. **Unified architectural AI studio migration**

The following are explicitly deferred and must not be represented as complete production capabilities in this slice:

- Real user authentication or account creation.
- Persistent projects, cloud history, or database storage.
- Real credit debit, subscription management, Stripe/Lemon Squeezy checkout, or invoices.
- Separate production model pipelines for every marketing tool card.
- DWG generation in the browser.
- Copying mnml.ai source code, proprietary assets, trademarks, or protected visual files.

Marketing cards for capabilities without a backend implementation must be marked as planned, use the shared live engine only when appropriate, or remain non-submitting showcase cards. No button may imply a backend operation that does not exist.

## Repository and deployment constraints

- Work only in the clean isolated checkout at `.worktrees/v115`; do not touch the dirty root `master` checkout or its environment/cache files.
- Preserve Git repository linkage and the canonical remote URL: `https://github.com/yusef47/egyptian-ai-facade-center.git`.
- Preserve Vercel deployment configuration and the server-side environment variable name `OPENROUTER_API_KEY`.
- Keep the existing `/api/restore` request contract compatible where practical:
  `{ imageDataUrl, prompt, mode? } -> { imageDataUrl }`.
- Never expose `OPENROUTER_API_KEY` to browser bundles or commit real credentials.
- Do not delete `.git`, deployment configuration, environment templates, or the existing tested export logic.

## Product identity

- **Brand:** Qattan AI
- **Arabic brand:** قطان AI
- **Tagline:** Next-Gen AI Architectural & Interior Visualization Studio
- **Positioning:** A browser-based visualization workspace for architectural concept development, facade restoration, and CAD-oriented floor-plan conversion.
- **Language model:** Arabic is the RTL experience at `/` and `/ar`; English is the LTR experience at `/en`. The studio language switch persists locally and updates `document.documentElement.lang` and `dir`.

## Visual direction

The public experience uses an original implementation informed by the observed public structure of `mnml.ai/ar`, `mnml.ai/explore`, and `mnml.ai/pricing`, not a source-level clone.

- White editorial canvas with near-black typography.
- Cobalt-blue primary actions and restrained blue-gray accents.
- Soft gray borders and surfaces, 8–12px rounded controls, and spacious centered content.
- Arabic typography: Cairo with IBM Plex Sans Arabic/Tahoma fallbacks.
- English typography: Mona Sans/system fallbacks.
- Strong responsive behavior: centered max-width desktop layouts and single-column mobile layouts.
- Original architectural visual treatments and CSS geometry may be used when no approved brand imagery exists; do not hotlink or copy reference-site assets.
- Accessibility: semantic headings, keyboard-accessible controls, visible focus states, alt text, reduced-motion compatibility, and adequate contrast.

## Public routes and sections

### `/`, `/ar`, `/en`

The public route renders the Qattan marketing page with locale-aware copy and direction. The exact route strategy may use a shared locale layout, but direct navigation to all three paths must work.

Required sections:

1. **Header**
   - Qattan AI wordmark/brand lockup.
   - Product/tool navigation.
   - Use-cases or solutions navigation.
   - Pricing link.
   - Language toggle.
   - Theme control only if implemented consistently; it is not required for acceptance.
   - Primary `Start creating` CTA linking to `/studio`.
   - Mobile navigation drawer or collapsible menu.

2. **Hero**
   - Qattan tagline and architectural visualization value proposition.
   - Primary CTA to `/studio`.
   - Secondary CTA to explore tools or the workflow section.
   - Original architectural visual treatment that communicates input-to-render transformation.
   - Arabic layout must read naturally RTL; English must be LTR.

3. **Before/after proof**
   - Interactive pointer/touch-compatible split comparison using local/original placeholder visuals or safe generated CSS visuals.
   - Accessible slider semantics and keyboard fallback.
   - No API request is made by moving the slider.

4. **Three-step workflow**
   - Upload an image.
   - Choose a direction or describe a brief.
   - Review and export the result.

5. **Tool showcase**
   - Cards for Exterior AI, Interior AI, Sketch-to-Image, Masterplan AI, Landscape AI, Virtual Staging, Render Enhancer, Facade Restoration, and Floor Plan to CAD.
   - Cards clearly distinguish live features from planned/showcase capabilities.
   - Live Facade Restoration and Floor Plan to CAD cards link to corresponding studio modes.

6. **Software integrations**
   - Present common architecture workflow inputs such as SketchUp, Revit, Blender, Rhino, AutoCAD, and common renderer exports as compatibility messaging only; do not claim direct file parsing where not implemented.

7. **Pricing preview**
   - Present a visual pricing concept without collecting payment or claiming an active billing account.
   - Include a clear “coming soon” or “contact for access” state where necessary.

8. **FAQ**
   - Accessible accordion covering generation workflow, supported inputs, conceptual-output disclaimer, and the deferred billing/account state.

9. **Footer**
   - Qattan AI identity, product links, studio link, contact placeholder, legal/disclaimer copy, and language links.

## Studio route

### `/studio`

Create a unified workspace shell with a responsive three-region desktop layout:

- **Left control rail:** upload, mode selection, prompt/brief, style controls, and generation action.
- **Center viewport:** input/output preview, before/after or generated-board view, loading state, lightbox/fullscreen action, and empty states.
- **Right history/export rail:** current generation history in session state, download/report/export actions, and cost/engine notice that does not pretend to debit credits.

On mobile, the regions stack in this order: mode and upload, prompt/action, viewport, history/export.

### Live studio modes

1. **Facade Restoration**
   - Preserve the current one-request triptych generation.
   - Reuse the existing image compression, prompt validation, OpenRouter request, 3-panel output, native-resolution lightbox, and syndicate-style report export where appropriate for Qattan branding.
   - Keep the generated image cached in client state.

2. **Floor Plan to CAD**
   - Preserve the current one-request 2×2 CAD image generation.
   - Preserve cached-image local quadrant cropping, 4× upscaling, luminance thresholding, Zhang-Suen thinning, Potrace-WASM tracing, V124 transform decoding, AC1009 DXF output, individual downloads, sequential ZIP generation, timeout behavior, and partial-success handling.
   - Update user-facing labels and brand copy to Qattan AI while keeping technical disclaimers.

### Showcase/planned modes

Exterior AI, Interior AI, Sketch-to-Image, Masterplan, Landscape, Virtual Staging, and Render Enhancer appear in the mode/tool system as clearly labeled planned modes unless they use an explicitly supported shared request path. They must not trigger a request with unsupported semantics or claim independent model quality.

## Backend architecture

- Migrate the secure restoration entrypoint to a Next.js route handler while keeping the request behavior compatible.
- Route handler responsibilities:
  - Accept POST only.
  - Validate data URL format, payload size, prompt length, and supported mode.
  - Apply the existing best-effort per-instance limiter.
  - Select facade or CAD system prompt.
  - Call OpenRouter server-side using `google/gemini-3.1-flash-lite-image`.
  - Normalize hosted URL/base64 responses and enforce response-size safety.
  - Return structured JSON errors without leaking upstream credentials or sensitive provider details.
- Do not add a client-side OpenRouter call.
- Add `/api/generate` or `/api/inpaint` only if the implementation has a real, tested behavior. Otherwise keep the API surface focused on `/api/restore` and document the deferred endpoint scope.

## State and data flow

```text
Upload file
  -> browser compression/data URL
  -> studio mode + prompt state
  -> POST /api/restore
  -> server validation + OpenRouter request
  -> normalized image URL/data URL
  -> session history + viewport
  -> local report/DXF/ZIP export
```

Session history is in-memory React state in this slice. Refreshing the page may clear it. The UI must not claim cloud persistence.

## Migration strategy

- Replace the Vite/Wouter page entry with Next App Router files and an appropriate Next build configuration.
- Port reusable, tested domain utilities first: image compression, restore request helper, report generation, CAD crop/export, DXF serializer, i18n copy, and rate-limit behavior.
- Port visual components into route/layout components with focused boundaries rather than creating one monolithic page.
- Remove obsolete Vite-only entrypoints only after the Next build and tests pass.
- Preserve or port tests before deleting their source dependencies.
- Keep a compatibility path for the existing deployed contract until the new app build is verified.

## Testing and acceptance criteria

### Automated

- Existing V124 DXF, CAD export, Potrace, OpenRouter, report, rate-limit, and component tests continue to pass or are ported with equivalent assertions.
- Add tests for:
  - Qattan branding and required tagline.
  - `/`, `/ar`, `/en`, and `/studio` route rendering.
  - Arabic `dir="rtl"` and English `dir="ltr"` behavior.
  - Language-toggle persistence and copy selection.
  - Before/after slider keyboard and pointer behavior.
  - Live mode selection and `/api/restore` payload mode.
  - Planned-mode non-submission behavior.
  - Preserved facade report/lightbox and CAD individual/ZIP exports.
- Run `npm test -- --run`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `git diff --check`.

### Browser smoke

Using the temporary headless Chromium/Playwright environment, verify at minimum:

- Desktop: 1440×1100 for `/`, `/ar`, `/en`, `/studio`.
- Mobile: 390×844 for `/ar` and `/studio`.
- No uncaught console errors on initial load.
- Header navigation and language toggle work.
- Hero CTA reaches `/studio`.
- Upload controls render and remain keyboard reachable.
- Studio mode switching does not reload the page.
- Existing export controls remain disabled until a result exists.
- No horizontal overflow on mobile except intentional image preview scrolling.

## Release and deployment

- Review the scoped diff and ensure no `.env`, cache, generated browser binaries, or unrelated root-checkout files are staged.
- Commit with a message describing the Qattan AI foundation/studio migration.
- Push the isolated branch to `origin/main` only after all verification passes and user-requested deployment behavior is confirmed.
- Vercel should use the preserved production build configuration and `OPENROUTER_API_KEY` environment variable.
- Report the resulting commit SHA, verification output, and any deferred scope honestly.
