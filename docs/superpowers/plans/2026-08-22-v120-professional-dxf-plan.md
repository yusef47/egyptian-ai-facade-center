# Professional Architectural DXF Pipeline V120.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Potrace-to-DXF pipeline so generated CAD files remove small artifacts, use orthogonal wall geometry, preserve preview orientation, and retain reliable sequential quadrant downloads.

**Architecture:** Keep Potrace-WASM and the proven AC1009 DXF serializer. Add path filtering and endpoint snapping between SVG parsing and segment serialization, while keeping Y inversion centralized at DXF serialization. Preserve the existing cached-image and sequential ZIP flow, adding explicit regression coverage for partial failures and independent downloads.

**Tech Stack:** React 19, TypeScript, Vitest, Potrace-WASM, JSZip, Vite.

## Global Constraints

- Use the existing isolated worktree `.worktrees/v115`.
- Preserve AC1009, no VPORT, LTYPE/LAYER tables only, layer `0`, padded three-character group codes, LF endings, and one-decimal coordinates.
- Filter a path only when both bounding-box area is `<150 px²` and contour length is `<40 px`.
- Snap segments within 12° of horizontal or 90° within 12° to exact horizontal/vertical endpoints.
- Keep the hard maximum of 5,000 LINE entities.
- DXF downloads must use the cached generated quadrant image and must not call `/api/restore`.

---

### Task 1: Add vector geometry regression tests

**Files:**
- Modify: `tests/dxf.test.ts`
- Modify: `tests/cad-vectorizer.test.tsx`

- [ ] Add SVG fixtures containing a small text-like path, a long thin wall path, and slightly skewed horizontal/vertical paths.
- [ ] Assert small paths are absent while long thin paths remain.
- [ ] Assert near-horizontal endpoints share one Y coordinate and near-vertical endpoints share one X coordinate after export.
- [ ] Assert the existing orientation contract: source SVG Y values are exported as `height - y`, without mirroring X.
- [ ] Add ZIP partial-failure coverage proving one failed quadrant does not prevent the remaining files from being zipped.
- [ ] Add individual-download coverage proving a failed ZIP run does not disable independent quadrant export and no second API request is made.
- [ ] Run `npm test -- --run tests/dxf.test.ts tests/cad-vectorizer.test.tsx` and confirm the new tests fail against the current implementation.

### Task 2: Implement filtered and orthogonalized segment extraction

**Files:**
- Modify: `client/src/lib/dxf.ts`

- [ ] Add constants for `MIN_PATH_BBOX_AREA = 150`, `MIN_PATH_LENGTH = 40`, and `ORTHO_SNAP_ANGLE_DEGREES = 12`.
- [ ] Compute each path's bounding-box area and total contour length before segment collection.
- [ ] Exclude only paths where both measurements are below their thresholds.
- [ ] Add a segment normalization helper that snaps endpoints to horizontal or vertical when the absolute angle meets the requested thresholds.
- [ ] Apply normalization before the existing minimum segment length test and preserve the existing AC1009 serializer unchanged otherwise.
- [ ] Export only the existing public functions unless tests require a narrowly scoped geometry helper.
- [ ] Run the focused DXF tests and confirm they pass.

### Task 3: Harden quadrant download error flow

**Files:**
- Modify: `client/src/components/CadVectorizerSection.tsx`
- Modify: `client/src/lib/cadExport.ts`
- Modify: `tests/cad-vectorizer.test.tsx`

- [ ] Keep quadrant processing strictly sequential with a browser yield between items.
- [ ] Ensure each individual download catches crop, Potrace, timeout, and Blob/download errors independently and always clears its loading state.
- [ ] Ensure ZIP processing catches each quadrant independently, skips failures, creates a ZIP from successful files, and clears progress/loading state on every exit path.
- [ ] Avoid reading stale React `error` state when deciding whether all ZIP work failed; use local failure state.
- [ ] Preserve translated progress messages in Plan → Elevation → Section → Perspective order.
- [ ] Run focused component/export tests and confirm the partial-failure and independent-download cases pass.

### Task 4: Update release metadata and documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] Bump the project version from `119.1.0` to `120.0.0` in package metadata.
- [ ] Document V120.0 filtering, orthogonal snapping, orientation preservation, and sequential resilient exports.
- [ ] Confirm no unrelated metadata or generated files are changed.

### Task 5: Verify, review, commit, and push

**Files:**
- Review only the scoped V120.0 files.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review `git diff` and recent commit style; verify no secrets or unrelated files are staged.
- [ ] Commit with a concise V120.0 message and push `HEAD:main`.
- [ ] Verify remote `main` points to the new commit and the worktree is clean.
