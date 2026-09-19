/**
 * Derives the Qattan AI showcase imagery in-house from the existing
 * photorealistic assets (no third-party files):
 *
 *  - Comparison sliders (ProofSection):  sketch ↔ render luxury pairs
 *  - Tool preview showcases:             8 distinct before/after treatments
 *
 * Every "before" is derived programmatically from its exact matching "after"
 * so slider geometry stays a 1-to-1 architectural match. Run: node scripts/derive-showcases.cjs
 */
const sharp = require("sharp");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");
const W = 1500;
const H = 1000;

const cover = (position = "centre") => ({ width: W, height: H, fit: "cover", position });

/** Pencil-sketch elevation: edge extraction + warm blueprint paper. */
async function sketchify(input, output, tint = { r: 232, g: 226, b: 205 }) {
  const edges = await sharp(path.join(PUB, input))
    .resize(cover("attention"))
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0] })
    .normalise()
    .negate()
    .toBuffer();
  await sharp(edges)
    .linear(1.25, 10)
    .blur(0.35)
    .tint(tint)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(PUB, output));
  console.log("sketchify ->", output);
}

/** Unstyled clay/massing model: desaturated, flat lighting, softened. */
async function clayify(input, output, { brightness = 1.05, contrast = 0.8, lift = 30 } = {}) {
  await sharp(path.join(PUB, input))
    .resize(cover())
    .greyscale()
    .modulate({ brightness, saturation: 0 })
    .linear(contrast, lift)
    .blur(0.7)
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(PUB, output));
  console.log("clayify   ->", output);
}

/** Low-resolution draft render: pixelated upscale + soft artifacts. */
async function lowresify(input, output) {
  const small = await sharp(path.join(PUB, input))
    .resize(210, 132, { fit: "cover" })
    .blur(1.1)
    .jpeg({ quality: 55 })
    .toBuffer();
  await sharp(small)
    .resize(W, H, { fit: "fill" })
    .sharpen({ sigma: 0.7 })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(PUB, output));
  console.log("lowresify ->", output);
}

/** Soft colour site plan (the "before" CAD receives). */
async function colorplanify(input, output) {
  await sharp(path.join(PUB, input))
    .resize({ width: W, height: H, fit: "contain", background: "#f6f1e4" })
    .modulate({ saturation: 1.15, brightness: 1.04 })
    .blur(0.5)
    .tint({ r: 244, g: 233, b: 203 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(PUB, output));
  console.log("colorplan ->", output);
}

/** Crisp technical CAD vector sheet: 1-bit ink on white. */
async function cadify(input, output) {
  await sharp(path.join(PUB, input))
    .resize({ width: W, height: H, fit: "contain", background: "#ffffff" })
    .greyscale()
    .normalise()
    .threshold(140)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(PUB, output));
  console.log("cadify    ->", output);
}

(async () => {
  // ── ProofSection comparison sliders (luxury pairs) ──────────────────────
  // Pair 1 — Exterior Redesign: villa night render (warm 2700K lighting).
  await sketchify("hero-night-pool.jpg", "proof-exterior-before.jpg", { r: 226, g: 224, b: 214 });
  // Pair 2 — Sketch to Render: luxury interior living space.
  await sketchify("poster-interior.jpg", "proof-interior-before.jpg");

  // ── Tool preview showcases (8 distinct transformations) ─────────────────
  await sketchify("hero-after-villa.jpg", "preview-exterior-before.jpg");          // 1 exterior
  await clayify("poster-interior.jpg", "preview-interior-before.jpg");             // 2 interior
  // 3 sketch: reuses the existing matched /poster-sketch.jpg as its before.
  await sketchify("poster-masterplan.jpg", "preview-masterplan-before.jpg", { r: 214, g: 224, b: 238 }); // 4 masterplan
  await clayify("poster-landscape.jpg", "preview-landscape-before.jpg");           // 5 landscape
  await clayify("poster-staging.jpg", "preview-staging-before.jpg", { brightness: 1.02, contrast: 0.72, lift: 38 }); // 6 staging
  await lowresify("poster-enhancer.jpg", "preview-enhancer-before.jpg");           // 7 enhancer
  await colorplanify("poster-floorplan.jpg", "preview-floorplan-before.jpg");      // 8 floorplan (before)
  await cadify("poster-floorplan.jpg", "preview-floorplan-after.jpg");             // 8 floorplan (after)

  for (const file of [
    "proof-exterior-before.jpg",
    "proof-interior-before.jpg",
    "preview-exterior-before.jpg",
    "preview-interior-before.jpg",
    "preview-masterplan-before.jpg",
    "preview-landscape-before.jpg",
    "preview-staging-before.jpg",
    "preview-enhancer-before.jpg",
    "preview-floorplan-before.jpg",
    "preview-floorplan-after.jpg",
  ]) {
    const meta = await sharp(path.join(PUB, file)).metadata();
    if (!meta.width || !meta.height) throw new Error(`bad output: ${file}`);
  }
  console.log("all showcase assets verified");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
