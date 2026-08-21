# V118.0 Potrace-WASM Floor-Plan Vectorization

## Goal
Replace the V117 raster boundary/chord exporter with an ordered Potrace tracing pipeline so generated DXF geometry follows architectural contours instead of radiating or row-like scan segments.

## Constraints
- Use `potrace-wasm` in the browser because the CAD download already runs locally from the cached generated image.
- `potrace-wasm` is GPL-2.0; this dependency choice was explicitly approved for V118.0 despite the repository's MIT application code.
- Preserve the verified AC1009 DXF template from V117.5: no VPORT, only LTYPE/LAYER tables, layer `0`, padded three-character group codes, LF endings.
- Keep one AI generation request. DXF download must not call `/api/restore`.
- Output at most 5,000 atomic `LINE` entities.

## Architecture
`rasterizeImageToDxf(imageUrl)` loads the cached result into an offscreen canvas, creates a same-size binary canvas by setting pixels to pure black or white using luminance threshold 128, and calls `loadFromCanvas(binaryCanvas)` from `potrace-wasm`.

Potrace returns SVG path data. A small parser supports the path commands emitted by Potrace (`M`, `L`, `C`, `Q`, `Z`, including relative forms), flattening curves into ordered polygon points. Ramer–Douglas–Peucker simplification with epsilon 2 reduces curve sampling noise. Each adjacent point pair becomes a candidate segment; closed paths include the final-to-first segment. Segments shorter than 5 pixels are discarded. If more than 5,000 remain, candidates are ranked by source length and reduced to the 5,000 longest segments.

The existing AC1009 serializer receives those ordered segments and emits layer-`0` LINE records with one-decimal coordinates and `y = imageHeight - y`. The writer remains dependency-free and continues to enforce strict group-code padding and LF termination.

## Error handling
- Invalid image APIs, empty image dimensions, failed image loading, missing canvas context, malformed/no SVG paths, and rasters with no usable segments produce clear rejected Promises.
- A Potrace failure is surfaced through the existing CAD component error state.
- No fallback to the old angle-sorted boundary algorithm remains.

## Testing
- Mock `potrace-wasm.loadFromCanvas` in component/utility tests so tests do not depend on WASM initialization.
- Test binary preprocessing at threshold 128.
- Test ordered SVG path parsing, curve flattening, RDP simplification, Y inversion, one-decimal output, and no old boundary/chord behavior.
- Test no VPORT/CAD_OUTLINE/CRLF/AC1032 output and a hard 5,000 LINE limit.
- Preserve the existing CAD component regression proving DXF download calls the cached-image vectorizer and does not issue another fetch.
- Run focused tests, full Vitest suite, typecheck, production build, and `git diff --check` before release.
