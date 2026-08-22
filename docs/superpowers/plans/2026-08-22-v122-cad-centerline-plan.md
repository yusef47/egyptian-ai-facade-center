# CAD Centerline and Orientation Fixes V122.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct DXF orientation, collapse thick walls to centerlines, and preserve interior partitions, doors, and room boundaries.

**Architecture:** Keep the AC1009 DXF serializer and V121 4× crop flow. Apply Zhang-Suen thinning to the binary raster before Potrace, lower CAD thresholding to luminance 180, and make V120 artifact filtering gentler at native-unit thresholds of 30 square pixels and 20 pixels. Keep X coordinates unchanged and apply only `height - y` during DXF serialization.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Potrace-WASM, Vitest, Vite.

## Global Constraints

- X coordinates remain unchanged; no horizontal mirroring or X negation.
- DXF Y coordinates use `canvasHeight - y` exactly once.
- Binary threshold is luminance `<180` for black and otherwise white.
- Native contour filtering uses minimum bounding-box area `30px²` and contour length `20px`.
- Zhang-Suen thinning operates on the thresholded raster before Potrace.
- Preserve AC1009, no VPORT, LTYPE/LAYER tables only, layer `0`, padded group codes, LF endings, one-decimal coordinates, Y inversion, and 5,000 LINE cap.
- Preserve cached local quadrant exports without additional API requests.

---

### Task 1: Regression tests

**Files:**
- Modify: `tests/dxf.test.ts`
- Modify: `tests/potrace.test.ts`

- [ ] Add asymmetric SVG orientation coverage proving X coordinates are unchanged and only Y is inverted.
- [ ] Add a raster threshold case proving luminance 179 is black and 180 is white.
- [ ] Add a thinning fixture with a two-pixel-wide horizontal stroke and assert it becomes a one-pixel centerline before Potrace.
- [ ] Add a smaller interior contour fixture and assert it remains exportable under the gentler native thresholds.
- [ ] Run focused tests and confirm the new tests fail against V121.

### Task 2: Raster thinning and threshold implementation

**Files:**
- Modify: `client/src/lib/dxf.ts`

- [ ] Lower the binary threshold from 130 to 180.
- [ ] Add a dependency-free Zhang-Suen thinning helper over a binary grayscale raster.
- [ ] Run thinning after thresholding and before `loadFromCanvas`.
- [ ] Keep dimensions and scale unchanged so V121 quarter-scale export remains correct.
- [ ] Ensure thinning terminates when no pixels are deleted and does not mutate unrelated alpha semantics.

### Task 3: Gentle geometry filtering and explicit orientation

**Files:**
- Modify: `client/src/lib/dxf.ts`
- Modify: `tests/dxf.test.ts`

- [ ] Change minimum native path bounding-box area to `30` and minimum native path length to `20`.
- [ ] Keep X serialization as `start.x * scale` and `end.x * scale`.
- [ ] Keep Y serialization as `(height - start.y) * scale` and `(height - end.y) * scale`.
- [ ] Preserve V121 parallel merge and AC1009 formatting unless tests expose a regression.

### Task 4: Version and documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] Bump version from `121.0.0` to `122.0.0`.
- [ ] Document centerline thinning, threshold/filter changes, and no-X-mirroring orientation.
- [ ] Document that V121's Potrace wrapper API remains unchanged.

### Task 5: Verification and release

- [ ] Run focused tests for DXF and Potrace.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review scoped diff and recent commit style.
- [ ] Commit V122, push `HEAD:main`, verify remote SHA, and confirm clean worktree.
