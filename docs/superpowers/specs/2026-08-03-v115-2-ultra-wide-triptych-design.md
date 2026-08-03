# V115.2 Ultra-Wide Triptych Design

## Goal
Improve generated triptych readability by requesting an ultra-wide panoramic canvas and giving users a native-resolution, scrollable fullscreen inspection view without changing the one-call generation cost or API contract.

## Scope

- Update `MASTER_ARCHITECTURAL_SYSTEM_PROMPT` in `api/restore.ts` with an explicit 3:1-or-wider requirement, equal one-third panel allocation, and standalone-render detail requirements.
- Preserve the existing single OpenRouter request, Gemini image model, provider fallback, payload trimming, and `{ imageDataUrl, prompt } -> { imageDataUrl }` contract.
- Update `client/src/components/EngineSection.tsx` so the result is displayed in a full-width horizontal-scroll viewport and can be opened in an accessible fullscreen lightbox.
- Keep the generated source URL unchanged; CSS must not resize the image to a fixed maximum height or width in the inspection surface.
- Add regression tests for prompt language and lightbox behavior.

## Interaction Design

The inline output uses a full-width viewport with horizontal scrolling. The image retains its intrinsic dimensions through `width: auto`, `height: auto`, and `max-width: none`, with a responsive minimum width so all three panels remain inspectable on narrow screens.

The image is an accessible button. Activating it opens a fixed dialog overlay with a scrollable image at native dimensions, a close button, Escape-key handling, and backdrop-click handling. The dialog exposes an accessible label and returns focus to the image trigger when closed where the browser supports focus restoration naturally.

## Error and Compatibility Behavior

No new network calls, dependencies, or image transformations are introduced. Existing loading, error, report-download, and panel-label states remain unchanged. The lightbox only renders when a generated result exists and closes safely when no result is present.

## Testing

- API prompt tests assert ultra-wide panoramic wording, 3:1-or-wider dimensions, equal panel thirds, and no compression.
- Studio tests assert the output trigger opens the dialog, the dialog contains the generated image, and Escape closes it.
- Existing typecheck, full Vitest suite, production build, and whitespace checks remain required before release.
