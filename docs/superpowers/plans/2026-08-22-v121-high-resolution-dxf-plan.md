# High-Resolution DXF Smoothing V121.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce smoother CAD exports by tracing 4× upscaled quadrant rasters and merging nearby parallel wall edges into cleaner centerlines.

**Architecture:** Keep the cached quadrant crop and browser Potrace-WASM flow. `cropImageToQuadrant` will create a native crop, render it to a 4× smoothed canvas, threshold at luminance 130, and return that binary PNG. `rasterizeImageToDxf` will accept the 4× raster dimensions and serialize coordinates at quarter scale, preserving the original quadrant coordinate system. DXF segments will be deduplicated after snapping/filtering by merging collinear nearby parallel segments whose projections overlap or touch.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Potrace-WASM, Vitest, Vite.

## Global Constraints

- Preserve AC1009, no VPORT, LTYPE/LAYER tables only, layer `0`, padded three-character group codes, LF endings, Y inversion, one-decimal coordinates, and the 5,000 LINE cap.
- Upscale each crop by exactly `4×` before thresholding/tracing.
- Use `imageSmoothingEnabled = true` for the scaled draw.
- Threshold with luminance `<130` as black and otherwise white.
- Apply quarter-scale coordinates when exporting 4× raster geometry.
- Merge only parallel/collinear segments within `3.0` output coordinate units; do not merge unrelated or disjoint geometry.
- Continue using the cached generated image with no additional `/api/restore` calls.
- The installed `potrace-wasm` package exposes only `loadFromCanvas`; requested Potrace runtime parameters are not exposed and must not be represented as unsupported API calls.

---

### Task 1: Add failing high-resolution and merge tests

**Files:**
- Modify: `tests/cad-export.test.ts`
- Modify: `tests/potrace.test.ts`
- Modify: `tests/dxf.test.ts`

- [ ] Assert crop output canvas dimensions are native quadrant dimensions multiplied by 4.
- [ ] Assert crop rendering enables smoothing and applies the native crop coordinates.
- [ ] Assert the raster pipeline passes the upscaled binary canvas to Potrace and thresholds luminance 129 to black and 130 to white.
- [ ] Assert raster dimensions are converted back to original quadrant coordinates in generated DXF.
- [ ] Assert two same-axis nearby segments merge into one centerline and distinct non-overlapping segments remain separate.
- [ ] Run `npm test -- --run tests/cad-export.test.ts tests/potrace.test.ts tests/dxf.test.ts` and confirm new assertions fail before implementation.

### Task 2: Implement 4× crop and binary raster preprocessing

**Files:**
- Modify: `client/src/lib/cadExport.ts`
- Modify: `client/src/lib/dxf.ts`

- [ ] Add `QUADRANT_UPSCALE = 4` to `cadExport.ts`.
- [ ] Crop at native quadrant coordinates, render to a canvas with width/height multiplied by 4, set `imageSmoothingEnabled = true`, and use high-quality smoothing when available.
- [ ] Apply luminance threshold 130 to the upscaled raster before returning the PNG data URL.
- [ ] Pass the traced raster dimensions into `buildDxfFromSvg` and set `scale: 1 / 4` so exported coordinates remain in native quadrant units.
- [ ] Preserve existing Potrace path filtering, orthogonal snapping, AC1009 serialization, and error behavior.

### Task 3: Implement parallel-line deduplication

**Files:**
- Modify: `client/src/lib/dxf.ts`

- [ ] Add a post-normalization merge function for horizontal and vertical segments.
- [ ] Normalize each segment’s axis, order endpoints, and compare constant-axis distance against `3.0` units.
- [ ] Merge segments only when their projected intervals overlap or touch, using the average constant-axis coordinate and the union of their intervals.
- [ ] Keep diagonal/non-orthogonal segments unchanged and preserve the existing entity cap.
- [ ] Serialize merged segments with the existing AC1009 writer.

### Task 4: Version and document V121

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] Bump version from `120.0.0` to `121.0.0`.
- [ ] Document 4× crop upscaling, thresholding, coordinate rescaling, and parallel-edge merging.
- [ ] State that the installed Potrace-WASM wrapper does not expose runtime parameter tuning.

### Task 5: Verify and release

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review the scoped diff and recent commit style.
- [ ] Commit with a concise V121 message, push `HEAD:main`, and verify remote SHA and clean worktree.
