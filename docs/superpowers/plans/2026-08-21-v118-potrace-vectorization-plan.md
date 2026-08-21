# V118.0 Potrace-WASM Vectorization Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with test-first checkpoints. Keep the existing cached CAD download flow and proven AC1009 writer contract intact.

**Goal:** Replace the broken angle-sorted raster boundary pipeline with browser-side Potrace-WASM tracing that emits ordered, simplified architectural LINE geometry.

**Architecture:** `rasterizeImageToDxf` will threshold the cached generated image to a binary canvas, call `potrace-wasm.loadFromCanvas`, parse and flatten its SVG paths, simplify ordered paths with RDP, and serialize them through the existing minimal AC1009 LINE writer. The CAD component remains unchanged at the API boundary and will continue to invoke this pipeline locally from `result` without another `/api/restore` request.

**Tech Stack:** React/Vite, TypeScript, browser Canvas APIs, `potrace-wasm` 1.0.4 (GPL-2.0, explicitly approved), Vitest, React Testing Library.

## Global Constraints

- Use `potrace-wasm` in the browser; do not add a server vectorization endpoint.
- Threshold binary pixels at luminance `128` into pure black/white before tracing.
- Flatten Potrace SVG paths to ordered polygon points, then RDP simplify with epsilon `2.0`.
- Emit only AC1009 LINE entities on layer `0`; no VPORT, no CAD_OUTLINE, no POLYLINE/VERTEX/SEQEND.
- Use three-character right-aligned group codes, LF line endings, inverted Y, and one-decimal coordinates.
- Filter segments shorter than 5 pixels and cap output at 5,000 LINE entities.
- Preserve local cached-image DXF generation and the no-second-fetch regression.
- Update package metadata/README to V118.0 and document the GPL-2.0 dependency.

---

### Task 1: Add the approved Potrace-WASM dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces the browser import `loadFromCanvas` from `potrace-wasm` for Task 3.

- [ ] Add `potrace-wasm` at version `^1.0.4` to `dependencies`, then regenerate the lockfile with the project package manager.
- [ ] Confirm the lockfile records the package license/source metadata and the version is synchronized in both package files.
- [ ] Do not add `potrace` because its package is Node-oriented and the approved design is browser-local.

Run:

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: `package.json` and `package-lock.json` contain `potrace-wasm`, with no unrelated dependency changes.

---

### Task 2: Add failing Potrace/path-processing tests

**Files:**
- Modify: `tests/dxf.test.ts`
- Create or modify: `tests/potrace.test.ts`
- Modify: `tests/cad-vectorizer.test.tsx` only if the module mock must include the new tracer dependency.

**Interfaces:**
- Test the exported `buildDxfFromSvg(svg, options)` or equivalent path-to-DXF helper before implementation; define its exact signature as `buildDxfFromSvg(svg: string, options?: { width: number; height: number; scale?: number }): string`.
- Test the exported `rasterizeImageToDxf(imageUrl: string): Promise<string>` with mocked `potrace-wasm` and browser image/canvas APIs.

- [ ] Add a failing SVG-path test using an ordered rectangular path such as `<svg viewBox="0 0 10 10"><path d="M 2 2 L 8 2 L 8 8 L 2 8 Z"/></svg>`; assert the output has four or more direct LINE entities, layer `0`, one-decimal coordinates, inverted Y, and no `POLYLINE`, `VERTEX`, `SEQEND`, `VPORT`, `CAD_OUTLINE`, or CRLF.
- [ ] Add a failing curve test using a cubic `C` command; assert flattening creates ordered segments and RDP reduces redundant points without emitting malformed group pairs.
- [ ] Add a failing binary-threshold test around luminance values 127 and 128, asserting 127 becomes black and 128 becomes white before `loadFromCanvas` receives the canvas.
- [ ] Add a failing 5,000-line cap test using a mocked SVG with more than 5,000 separated paths; assert the generated DXF contains at most 5,000 `  0\nLINE\n` records.
- [ ] Preserve/update the existing CAD component test so clicking download calls the cached result path and `fetch` remains exactly one call.

Run:

```bash
npm test -- --run tests/potrace.test.ts tests/dxf.test.ts tests/cad-vectorizer.test.tsx
```

Expected: the new tests fail because the SVG helper and Potrace-backed pipeline are not implemented yet.

---

### Task 3: Implement ordered Potrace SVG tracing and DXF conversion

**Files:**
- Modify: `client/src/lib/dxf.ts`

**Interfaces:**
- `export function buildDxfFromSvg(svg: string, options: { width: number; height: number; scale?: number }): string` parses Potrace SVG paths and emits the proven DXF format.
- `export function rasterizeImageToDxf(imageUrl: string): Promise<string>` thresholds a canvas, calls `loadFromCanvas`, and delegates to `buildDxfFromSvg`.

- [ ] Replace the current `componentContours`/angle-sort export path; do not keep it as an active fallback.
- [ ] Add a tokenizer/parser for Potrace path commands `M`, `L`, `C`, `Q`, and `Z`, including relative lowercase forms. Ignore unsupported SVG metadata and reject SVG with no usable paths.
- [ ] Flatten cubic/quadratic curves into deterministic point samples, preserving path order; use 8–16 subdivisions based on curve length, then run RDP with epsilon `2.0`.
- [ ] Convert each ordered path to candidate segments, include the closing segment for closed paths, remove segments shorter than 5 pixels, rank/limit to 5,000 segments, and reject if none remain.
- [ ] Keep `fmtCode`/`formatPairs` and the V117.5 minimal serializer semantics: AC1009, HEADER with EXTMIN/EXTMAX, TABLES with only LTYPE/LAYER layer `0`, ENTITIES, padded group codes, LF endings, and one-decimal coordinates.
- [ ] In `rasterizeImageToDxf`, load the image, draw it to an offscreen source canvas, allocate a binary canvas, read RGBA pixels, set each output pixel to `[0,0,0,255]` when luminance `< 128` and `[255,255,255,255]` otherwise, then call `loadFromCanvas(binaryCanvas)`.
- [ ] Normalize Potrace SVG dimensions/viewBox to source image dimensions so inversion uses `y = imageHeight - y` and coordinates remain near the origin.
- [ ] Preserve clear rejection errors for unavailable browser APIs, image load failures, missing contexts, tracer failures, malformed SVG, and empty geometry.

Run:

```bash
npm test -- --run tests/potrace.test.ts tests/dxf.test.ts tests/cad-vectorizer.test.tsx
```

Expected: all focused tests pass, including ordered paths and no-refetch behavior.

---

### Task 4: Release documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `package.json` version to `118.0.0`
- Modify: `package-lock.json` root versions to `118.0.0`
- Keep: `docs/superpowers/specs/2026-08-21-v118-potrace-vectorization-design.md`
- Keep: this implementation plan.

- [ ] Document V118.0, the Potrace-WASM browser pipeline, the GPL-2.0 dependency, threshold 128, RDP epsilon 2.0, and 5,000-line cap.
- [ ] Run focused tests again after documentation/version edits.
- [ ] Run the full release gate:

```bash
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

Expected: typecheck exits 0, all tests pass, build exits 0, and diff check is clean.

- [ ] Review the final diff for stale V117 algorithm claims, forbidden VPORT/CAD_OUTLINE output, CRLF strings, accidental API calls, secrets, or unrelated files.
- [ ] Commit only the scoped V118 files with a descriptive message and push `HEAD:main` without force.
- [ ] Verify clean status, local commit SHA, and `git ls-remote origin refs/heads/main` match.
