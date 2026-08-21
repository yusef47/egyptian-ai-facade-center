# V117.0 AI Floor Plan to AutoCAD Design

## Goal
Add a bilingual Floor Plan to CAD studio that converts colored architectural floor-plan imagery into high-contrast B&W CAD-style line art and downloads the result as an editable ASCII DXF.

## Architecture
The existing facade workflow remains unchanged by default. `Home` owns the active studio tab and renders either the existing facade restoration engine or the new `CadVectorizerSection`. Both image-generation flows use `/api/restore`, with an explicit `mode: "cad"` selecting a dedicated CAD system prompt so the facade triptych rules do not leak into floor-plan generation.

The CAD studio reuses the existing client image compression helper and restore response contract. After the model returns B&W line art, a browser canvas converts the raster into grayscale boundary contours. Ramer–Douglas–Peucker simplification reduces pixel noise, and a dependency-free ASCII DXF writer emits `LWPOLYLINE` entities in image coordinates. The download is a real `.dxf` text file that AutoCAD 2024 can open and edit, while the UI explains that geometry is raster-derived and should be checked by an architect.

## User flow
1. Select **Facade Restoration** or **Floor Plan to CAD** from the bilingual Navbar tab switcher.
2. In CAD mode, drag/drop or browse for a JPG/PNG floor plan.
3. Click the primary B&W CAD conversion action.
4. Review the generated B&W line-art image.
5. Download an editable `.dxf` file once line art is available.

## API contract
`POST /api/restore` accepts the existing `{ imageDataUrl, prompt }` body plus optional `mode: "cad"`. The response remains `{ imageDataUrl }`. CAD mode uses the exact requested instruction as part of a dedicated system prompt and preserves the existing facade master prompt for omitted/default mode.

## DXF behavior
The client utility accepts an image source and returns ASCII DXF text. It loads the image into a canvas, samples grayscale pixels, classifies dark pixels using a threshold, extracts boundary pixels, traces connected components, simplifies contours, and writes valid `LWPOLYLINE` entities. Coordinates are mapped to a 1-unit-per-pixel drawing space with the image origin converted to a conventional bottom-left DXF origin. Empty/invalid images produce a clear error rather than a corrupt download.

## Accessibility and presentation
- Both tab buttons are real buttons with `aria-selected`, `role="tab"`, and a keyboard-navigable tablist.
- Upload zones retain keyboard activation and visible focus states.
- Conversion/download buttons expose loading and disabled states.
- All CAD copy has EN and AR values; Arabic uses the existing document RTL behavior.
- Styling follows the existing obsidian, Cairo-Gold, bordered-panel language.

## Testing
- i18n completeness test covers all new keys.
- Navbar test verifies both tabs and switching callback/state.
- CAD component tests verify upload, exact CAD request mode/prompt, result rendering, error handling, and DXF download.
- DXF unit tests verify required ASCII sections, `LWPOLYLINE` entities, coordinate output, and invalid input handling.
- API tests verify CAD mode selects the CAD prompt while default mode retains the facade prompt.
- Full suite, typecheck, production build, and diff checks are required before pushing.
