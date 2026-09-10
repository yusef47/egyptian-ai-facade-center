/**
 * Server-side validation for uploaded image payloads on /api/restore.
 * Rejects non-image uploads regardless of the declared Content-Type by
 * sniffing magic bytes, and caps the request body size at 10MB.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

export type ImagePayloadCheck = { ok: true } | { ok: false; status: number; message: string };

/** Magic-byte signatures of the image formats the studio accepts. */
const SIGNATURES: { bytes: number[]; offset: number; label: string }[] = [
  { bytes: [0xff, 0xd8, 0xff], offset: 0, label: "jpeg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, label: "png" },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, label: "gif" },
  { bytes: [0x42, 0x4d], offset: 0, label: "bmp" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, label: "webp" },
  { bytes: [0x49, 0x49, 0x2a, 0x00], offset: 0, label: "tiff" },
];

/**
 * Validate a data URL carrying the uploaded image. Checks size, optional
 * declared MIME, and magic bytes before any generation work happens.
 */
export function validateImageDataUrl(dataUrl: unknown): ImagePayloadCheck {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    return { ok: false, status: 400, message: "An uploaded image is required." };
  }

  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    // Remote https URLs are allowed through (existing behavior for hosted refs).
    if (/^https?:\/\//i.test(dataUrl)) return { ok: true };
    return { ok: false, status: 400, message: "Invalid image payload format." };
  }

  const [, mime, base64] = match;
  const allowedMime = /^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(mime);
  if (!allowedMime) {
    return { ok: false, status: 415, message: "Unsupported image type. Please upload PNG, JPEG, or WebP." };
  }

  const byteLength = Math.floor((base64.length * 3) / 4);
  if (byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Image too large. Maximum size is 10MB — please upload a smaller image.",
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, status: 400, message: "Invalid image encoding." };
  }

  const isSvg = /^image\/svg/i.test(mime);
  if (isSvg) {
    return { ok: false, status: 415, message: "SVG uploads are not supported. Please upload PNG, JPEG, or WebP." };
  }

  const matched = SIGNATURES.some(
    (sig) =>
      buffer.length >= sig.offset + sig.bytes.length &&
      sig.bytes.every((byte, index) => buffer[sig.offset + index] === byte),
  );
  if (!matched) {
    return {
      ok: false,
      status: 415,
      message: "This file is not a real image. Please upload a genuine PNG, JPEG, or WebP photo.",
    }
  }

  return { ok: true };
}
