# V113 Egyptian Facade Studio Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Vite + React frontend as an RTL Cairo Gold Studio experience with official branding, national metrics, a working image restoration studio, and a downloadable Syndicate report while preserving the existing restore API contract.

**Architecture:** Keep `App` as the state owner for upload, prompt, restore, status, output, and report data. Split presentation into focused `Header`, `Hero`, `NationalMetrics`, `FacadeStudio`, `SyndicateReport`, and `FooterStatus` components. Reuse the existing image compression and OpenRouter helpers; do not modify `api/restore.ts`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing Tailwind/PostCSS setup, CSS custom properties, browser Blob/download APIs.

## Global Constraints

- Keep `api/restore.ts` unchanged.
- Keep request shape `{ imageDataUrl, prompt }`.
- Consume success response `{ imageDataUrl }`.
- Do not hardcode API credentials.
- Use RTL Arabic UI and Cairo font fallback.
- Use deep obsidian `#0A0F1D` and Cairo gold `#C5A059`.
- Do not add dependencies unless required by the existing project.
- Stage only V113 frontend, tests, metadata, and spec/plan files; preserve unrelated working-tree changes.

---

### Task 1: Add report-generation utility with tests

**Files:**
- Create: `src/lib/report.ts`
- Modify: `tests/app.test.tsx`

**Interfaces:**
- Produces `buildSyndicateReportHtml(input: SyndicateReportInput): string` and `downloadSyndicateReport(input: SyndicateReportInput): void`.
- `SyndicateReportInput` contains `prompt: string`, `status: string`, `createdAt: string`, `inputImageDataUrl: string | null`, and `outputImageDataUrl: string | null`.

- [ ] Add tests that call `buildSyndicateReportHtml` and assert it contains the official report title, escaped prompt text, status, and optional image data URLs.
- [ ] Add a download test that mocks `URL.createObjectURL`, `URL.revokeObjectURL`, and a temporary anchor; assert the filename is `egyptian-facade-syndicate-report.html`.
- [ ] Implement HTML escaping for `&`, `<`, `>`, `"`, and `'` before interpolation.
- [ ] Implement the browser download helper using a Blob, object URL, hidden anchor, click, and cleanup.
- [ ] Run `npm test -- --run tests/app.test.tsx` and expect the new report tests to pass.

### Task 2: Create V113 presentation components

**Files:**
- Create: `src/components/Hero.tsx`
- Create: `src/components/NationalMetrics.tsx`
- Create: `src/components/FacadeStudio.tsx`
- Create: `src/components/SyndicateReport.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/FooterStatus.tsx`

**Interfaces:**
- `Header` accepts `onSearch: (value: string) => void` and uses anchors `#home`, `#metrics`, `#studio`, and `#report`.
- `FacadeStudio` accepts the existing `inputPreview`, `outputImage`, `prompt`, `isGenerating`, upload callback, prompt callback, and restore callback plus a `status` string.
- `SyndicateReport` accepts `prompt`, `status`, `inputImageDataUrl`, `outputImageDataUrl`, and `onDownload`.

- [ ] Implement `Header` with the Egyptian Engineers Syndicate badge, `🇪🇬`, official center title, and the four requested navigation labels.
- [ ] Implement `Hero` with the exact headline, subtitle, CTA, and a small sovereign-platform eyebrow; CTA links to `#studio`.
- [ ] Implement `NationalMetrics` with four semantic metric cards and exact values `15,400+`, `88.8%`, `0.82M م²`, and `3.12s`.
- [ ] Implement `FacadeStudio` with an accessible drag/drop surface, hidden file input trigger, input preview, prompt textarea, exactly one primary `إرسال 🚀` action, output state, and `role="status"` live feedback. Drop handlers must accept the first image file and use the existing parent upload callback.
- [ ] Implement `SyndicateReport` with official report copy, session metadata, output readiness state, and a `تصدير تقرير النقابة` button.
- [ ] Update `FooterStatus` version label to `V113.0` without changing API behavior.
- [ ] Keep all controls keyboard accessible and provide visible focus states through the stylesheet.

### Task 3: Recompose App around the V113 flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Preserve `handleFileChange`, compression limits, restore fetch URL, request body, and `data.imageDataUrl` response consumption.
- Pass report state to `SyndicateReport` and call `downloadSyndicateReport` with the current session data.

- [ ] Add drag/drop-compatible file handling by exposing a shared `handleFile(file: File)` callback from `App` and retaining the file input event adapter.
- [ ] Replace the old hero/workspace/chat composition with `Header`, `Hero`, `NationalMetrics`, `FacadeStudio`, `SyndicateReport`, and `FooterStatus`.
- [ ] Preserve restore validation and errors; set output from `data.imageDataUrl` only.
- [ ] Set the root document theme metadata to `#0A0F1D` and update the page title for V113.
- [ ] Replace the old CSS with the responsive obsidian/gold RTL design: atmospheric background, glass cards, gold glows, metric grid, studio split view, responsive stacking, hover transitions, and reduced-motion handling.
- [ ] Bump package and lockfile root version to `113.0.0`.
- [ ] Assert `api/restore.ts` has no diff after the implementation.

### Task 4: Extend UI and API-contract regression tests

**Files:**
- Modify: `tests/app.test.tsx`
- Create or modify: `tests/api-contract.test.ts` only if existing test layout requires it

- [ ] Assert the official branding, exact hero copy, four navigation labels, four metrics, studio labels, and report action render.
- [ ] Assert the frontend source contains the `/api/restore` call and `data.imageDataUrl` success path without expecting `imageUrl`.
- [ ] Test successful restore with a mocked `fetch` response `{ imageDataUrl: "data:image/png;base64,result" }` and assert the output image renders.
- [ ] Test failed restore shows an Arabic error status and clears the generating state.
- [ ] Test the dropzone accepts a dropped image file through the existing compression boundary using a mocked `compressImage` if necessary.
- [ ] Run the full suite and remove obsolete V112-specific assertions only when they conflict with the approved V113 design.

### Task 5: Validate, review, and publish

**Files:**
- No additional source files unless validation finds a concrete defect.

- [ ] Run `git diff --check`.
- [ ] Run `npm test -- --run` and record the exact passing count.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Spawn `code-reviewer-luna` against the final frontend diff and resolve all concrete blockers.
- [ ] Verify `git diff -- api/restore.ts` is empty.
- [ ] Stage only V113 files and the spec/plan, commit `V113.0: rebuild Egyptian facade studio frontend`, and push to `origin main`.
- [ ] Verify local HEAD equals `git ls-remote origin refs/heads/main`, confirm clean status for staged intended files, and report the commit hash.
