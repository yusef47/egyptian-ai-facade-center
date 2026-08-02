export const MAX_DATA_URL_BYTES = 3_400_000;
const MAX_DIMENSION = 1600;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string, timeoutMs = 3000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(
      () => reject(new Error("image load timeout")),
      timeoutMs,
    );
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("image load failed"));
    };
    image.src = src;
  });
}

/**
 * Downscales an uploaded facade photo to fit the serverless payload limit.
 * Falls back to the raw file data URL when canvas decoding is unavailable
 * (e.g. in jsdom test environments or very large files that cannot be drawn).
 */
export async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }
  const raw = await fileToDataUrl(file);

  // Without a 2D canvas context (e.g. jsdom, very old browsers) decoding is
  // impossible — pass the original file through untouched.
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return raw;

  try {
    const image = await loadImage(raw);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    if (scale >= 1 && raw.length <= MAX_DATA_URL_BYTES) return raw;

    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let output = canvas.toDataURL("image/jpeg", 0.85);
    for (const quality of [0.7, 0.55, 0.4] as const) {
      if (output.length <= MAX_DATA_URL_BYTES) break;
      output = canvas.toDataURL("image/jpeg", quality);
    }
    return output;
  } catch {
    return raw;
  }
}
