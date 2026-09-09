# Asset Attribution

Photorealistic imagery and video source photography used on this site.

## Photography (Pexels License — free for commercial use, no attribution required)

| File | Source |
| --- | --- |
| `public/hero-after-villa.jpg`, `public/poster-exterior.jpg` | Pexels photo 1396122 (warm 2700K grade) |
| `public/proof-after-villa.jpg` | Pexels photo 186077 (warm 2700K grade) |
| `public/hero-night-pool.jpg` | Pexels photo 373912 |
| `public/poster-interior.jpg` | Pexels photo 1571460 |
| `public/poster-landscape.jpg` | Pexels photo 261101 |
| `public/poster-staging.jpg` | Pexels photo 1080721 |
| `public/poster-enhancer.jpg` | Pexels photo 221540 |

## Video

All `public/videos/*.mp4` clips are generated in-house with ffmpeg (cinematic
camera moves over the photography above). No third-party footage is used.

## Technical drawings (Wikimedia Commons)

| File | Source | License |
| --- | --- | --- |
| `public/poster-floorplan.jpg` | "Multi-Payload Processing Facility floor plan diagram" — NASA | Public domain |
| `public/poster-masterplan.jpg` | "An aerial photo of a residential neighborhood on Padre Island" by Matthew T Rader | CC BY-SA 4.0 |

## Derived sketch imagery (in-house)

`public/hero-before-sketch.jpg`, `public/proof-before-sketch.jpg`, and
`public/poster-sketch.jpg` are **derived programmatically from the matching
render photo** (sobel edge detection + blueprint paper treatment) so each
sketch-to-render pair is an exact 1-to-1 architectural match. No third-party
drawing is used.

## Matched-pair videos

`public/videos/reel-sketch.mp4` and `public/videos/tool-sketch.mp4` are
generated in-house with ffmpeg as a sketch→render transformation morph of the
matched hero pair above.

## Engineering preview board (in-house)

`public/poster-engineering.jpg` and `public/videos/tool-engineering.mp4` are
fully generated in-house: a programmatic SVG technical drawing board (front
elevation, top plan, side elevation, and isometric view of one consistent
building model, drawn with real projection math) rendered with sharp and
animated with ffmpeg. No third-party asset is used.
