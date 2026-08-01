// V109.4: server-only base64 image compressor.
// Keeps the /api/restore response under Vercel's serverless payload limits.
// This module is never imported by browser code (dynamically imported in api/restore.ts).
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_DIMENSION = 1400;

export async function compressImageDataUrl(dataUrl: string): Promise<string> {
  try {
    const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return dataUrl;
    const base64 = match[2];
    if (base64.length <= MAX_RESPONSE_BYTES) return dataUrl;

    // jimp v1 ESM exposes its API directly; keep a minimal structural type so
    // the dynamic import typechecks under the project's module resolution.
    type JimpImage = {
      getWidth: () => number;
      getHeight: () => number;
      scaleToFit: (w: number, h: number) => JimpImage;
      getBufferAsync: (mime: string) => Promise<Buffer>;
    };
    type JimpApi = {
      default?: unknown;
      read: (data: Buffer) => Promise<JimpImage>;
      MIME_JPEG: string;
    };
    const jimpModule = (await import("jimp")) as unknown as JimpApi;
    const Jimp: JimpApi = (
      jimpModule.default && typeof jimpModule.default === "object"
        ? jimpModule.default
        : jimpModule
    ) as JimpApi;
    const image = await Jimp.read(Buffer.from(base64, "base64"));
    if (image.getWidth() > MAX_DIMENSION || image.getHeight() > MAX_DIMENSION) {
      image.scaleToFit(MAX_DIMENSION, MAX_DIMENSION);
    }
    const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    if (buffer.length <= MAX_RESPONSE_BYTES) {
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    }
    return dataUrl;
  } catch {
    return dataUrl;
  }
}
