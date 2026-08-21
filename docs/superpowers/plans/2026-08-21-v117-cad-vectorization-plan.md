# V117.0 AI Floor Plan to AutoCAD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bilingual tabbed floor-plan-to-CAD studio with AI B&W conversion and client-side editable DXF export.

**Architecture:** Keep the existing facade path as the default `/api/restore` mode. Add an optional `mode: "cad"` request branch with a dedicated floor-plan prompt, a `CadVectorizerSection` that owns upload/generation/download state, and a focused `dxf.ts` utility that converts raster boundaries into simplified ASCII DXF polylines.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Vitest, React Testing Library, existing Lucide icons and i18n provider; no new dependency.

## Global Constraints

- Preserve the existing facade restoration behavior and response contract `{ imageDataUrl }`.
- Use OpenRouter model `google/gemini-3.1-flash-lite-image` through the server-side `/api/restore` route.
- Use the requested CAD instruction: `convert this architectural floor plan to a high-contrast 2D black and white clean CAD drafting style drawing, sharp thin black lines on pure white background, no 3D shading, clean vector line art style`.
- Export a real ASCII `.dxf`; do not generate a renamed PNG or JSON file.
- Provide complete English and Arabic translations for all new visible copy.
- Do not stage or modify unrelated pre-existing repository/cache changes outside the isolated worktree.

---

### Task 1: API CAD mode and client request contract

**Files:**
- Modify: `client/src/lib/restore.ts`
- Modify: `api/restore.ts`
- Test: `tests/v117-openrouter.test.ts`

**Interfaces:**
- `RestoreRequest` gains optional `mode?: "facade" | "cad"`.
- `restoreFacade` continues to accept the request and sends `mode` when present.
- `buildOpenRouterRequest` accepts an optional mode and chooses the CAD system prompt only for `mode: "cad"`.

- [ ] Write failing tests asserting CAD requests include the exact instruction and CAD mode, while facade requests still contain `MANDATORY 3-PANEL TRIPTYCH RULE`.
- [ ] Run `npm test -- --run tests/v117-openrouter.test.ts`; expect failure because CAD mode/prompt does not exist.
- [ ] Implement the optional mode in client/API request builders without changing default behavior.
- [ ] Run the focused API tests and existing OpenRouter tests; expect all to pass.

### Task 2: DXF raster vectorization utility

**Files:**
- Create: `client/src/lib/dxf.ts`
- Test: `tests/dxf.test.ts`

**Interfaces:**
- `export type RasterSource = { width: number; height: number; data: Uint8ClampedArray }`.
- `export function buildDxfFromRaster(source: RasterSource, options?: { threshold?: number; maxContours?: number }): string`.
- `export function rasterizeImageToDxf(imageUrl: string): Promise<string>`.

- [ ] Write failing tests for valid DXF header/tables/entities, closed contour polylines, coordinate inversion, and invalid/empty raster rejection.
- [ ] Run `npm test -- --run tests/dxf.test.ts`; expect failure because the utility is missing.
- [ ] Implement threshold sampling, boundary extraction, component tracing, RDP simplification, and ASCII DXF writing with `LWPOLYLINE` entities.
- [ ] Run the DXF focused tests and confirm they pass.

### Task 3: Bilingual navigation tabs and CAD component

**Files:**
- Modify: `client/src/lib/i18n.tsx`
- Modify: `client/src/components/Navbar.tsx`
- Create: `client/src/components/CadVectorizerSection.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/index.css`
- Test: `tests/navbar.test.tsx`
- Test: `tests/cad-vectorizer.test.tsx`
- Test: `tests/v117.test.tsx`

**Interfaces:**
- `StudioMode = "facade" | "cad"` is shared by `Home` and `Navbar`.
- `Navbar` receives `activeStudio?: StudioMode` and `onStudioChange?: (mode: StudioMode) => void`; omitted props preserve standalone test rendering.
- `CadVectorizerSection` accepts no required props and calls `/api/restore` with `mode: "cad"`.

- [ ] Add complete EN/AR keys for tabs, CAD labels, statuses, errors, and download text; extend the i18n completeness test.
- [ ] Add failing tests for tab semantics/switching, CAD uploader, request payload, generated preview, error state, and `.dxf` download.
- [ ] Run the focused component tests; expect failure because the tab and component do not exist.
- [ ] Implement the tablist and connect `Home` active mode to render only the selected studio.
- [ ] Implement CAD upload, conversion, B&W preview, and DXF download using existing compression and the new utility.
- [ ] Add responsive obsidian/Cairo-Gold styles and explicit engineering-review note.
- [ ] Run focused tests and confirm they pass.

### Task 4: Verification, review, and release

**Files:**
- Modify: `README.md` only if the final project structure/API documentation needs the V117 entry.
- Scoped changes: all files from Tasks 1–3 and their tests/docs.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect the scoped diff.
- [ ] Request code review; fix all Critical/Important issues and rerun verification.
- [ ] Commit with a concise V117.0 message and push `HEAD:main` without force.
- [ ] Verify clean status, commit SHA, and remote `main` SHA.
