import type { VercelRequest, VercelResponse } from "@vercel/node";
import sharp from "sharp";

export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-lite-image";

const MAX_DATA_URL_BYTES = 3_500_000; // incoming image payload guard
const MAX_OUTPUT_DATA_URL_BYTES = 2_000_000; // keep the JSON response well under Vercel's 4.5 MB limit

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)\s*\)/i;
const URL_RE = /https?:\/\/[^\s"'<>()]+/gi;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|heic|bmp)(\?|$)/i;

export type OpenRouterRequest = {
  url: string;
  init: RequestInit;
};

export function buildOpenRouterRequest(
  imageDataUrl: string,
  prompt: string,
  apiKey: string,
): OpenRouterRequest {
  const body = {
    model: OPENROUTER_MODEL,
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt.trim() },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  };

  return {
    url: OPENROUTER_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

function decodeBase64(value: string): string {
  return `data:image/png;base64,${value}`;
}

function isUsableImageUrl(value: string): boolean {
  return value.length > 0 && (/^https?:\/\//i.test(value) || value.startsWith("data:image/"));
}

/**
 * Extracts an image URL from a text part: markdown ![image](url) first, then
 * the first bare https:// URL that looks like an image reference. Unrelated
 * plain links (e.g. documentation) are ignored to avoid returning a wrong URL.
 */
export function extractImageUrlFromText(text: unknown): string | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const markdown = text.match(MARKDOWN_IMAGE_RE);
  if (markdown?.[1]) return markdown[1];
  const urls = text.match(URL_RE) ?? [];
  const imageLike = urls.find((url) => IMAGE_EXT_RE.test(url));
  return imageLike ?? null;
}

function extractFromImages(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  // Prefer hosted urls across all entries before falling back to base64.
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const candidate = image as Record<string, unknown>;
    const directUrl = typeof candidate.url === "string" ? candidate.url : "";
    const imageUrl = candidate.image_url;
    const imageUrlStr = typeof imageUrl === "string" ? imageUrl : "";
    const imageUrlObj =
      imageUrl && typeof imageUrl === "object"
        ? (imageUrl as Record<string, unknown>).url
        : "";
    const url = directUrl || imageUrlStr || (typeof imageUrlObj === "string" ? imageUrlObj : "");
    if (isUsableImageUrl(url)) return url;
  }
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const b64 = (image as Record<string, unknown>).b64_json;
    if (typeof b64 === "string" && b64.length > 0) return decodeBase64(b64);
  }
  return null;
}

function extractFromContent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fromImages = extractFromImages(record.images);
  if (fromImages) return fromImages;

  const content = record.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const item = part as Record<string, unknown>;
      const imageUrl = item.image_url;
      if (typeof imageUrl === "string" && isUsableImageUrl(imageUrl)) return imageUrl;
      if (imageUrl && typeof imageUrl === "object") {
        const url = (imageUrl as Record<string, unknown>).url;
        if (typeof url === "string" && isUsableImageUrl(url)) return url;
      }
      if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
        return decodeBase64(item.b64_json);
      }
      if (typeof item.url === "string" && isUsableImageUrl(item.url)) return item.url;
      if (typeof item.text === "string") {
        const fromText = extractImageUrlFromText(item.text);
        if (fromText) return fromText;
      }
    }
  }

  // Some providers return content as a plain string (e.g. markdown with an embedded image).
  if (typeof content === "string") {
    const fromText = extractImageUrlFromText(content);
    if (fromText) return fromText;
  }
  const fromText = extractImageUrlFromText(record.text);
  if (fromText) return fromText;

  return null;
}

export function extractImageData(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  const fromImages = extractFromImages(record.images);
  if (fromImages) return fromImages;

  const choices = record.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as Record<string, unknown>).message;
      const found = extractFromContent(message);
      if (found) return found;
    }
  }

  return extractFromContent(record);
}

/**
 * Keeps the returned payload strictly under 2 MB. Hosted https:// urls are
 * returned untouched; oversized base64 data urls are re-encoded as a smaller
 * JPEG with sharp. Any failure falls back to the original payload.
 */
export async function trimOutputDataUrl(output: string): Promise<string> {
  if (/^https?:\/\//i.test(output) || output.length <= MAX_OUTPUT_DATA_URL_BYTES) {
    return output;
  }
  if (!output.startsWith("data:image/")) return output;
  const comma = output.indexOf(",");
  if (comma < 0) return output;

  const base64 = output.slice(comma + 1);
  try {
    const buffer = Buffer.from(base64, "base64");
    const resized = await sharp(buffer, { failOn: "none" })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return output;
  }
}

function createRateLimiter({ windowMs, maxRequests }: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxRequests) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 6 });

function sendError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "يسمح هذا المسار بطلبات POST فقط.");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return sendError(res, 500, "لم يتم إعداد مفتاح OpenRouter على الخادم.");

  const forwardedFor = req.headers["x-forwarded-for"];
  const clientKey = typeof forwardedFor === "string"
    ? forwardedFor.split(",")[0].trim()
    : req.socket.remoteAddress || "unknown";
  if (!limiter.allow(clientKey)) {
    return sendError(res, 429, "طلبات كثيرة خلال دقيقة واحدة. حاول مرة أخرى بعد قليل.");
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return sendError(res, 400, "صيغة الطلب غير صالحة.");
  }

  const payload = body && typeof body === "object"
    ? body as { imageDataUrl?: unknown; prompt?: unknown }
    : {};
  const imageDataUrl = payload.imageDataUrl;
  const prompt = payload.prompt;

  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return sendError(res, 400, "يرجى رفع صورة واجهة صالحة.");
  }
  if (imageDataUrl.length > MAX_DATA_URL_BYTES) {
    return sendError(res, 413, "حجم الصورة أكبر من الحد المسموح. حاول رفع صورة أصغر.");
  }
  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return sendError(res, 400, "اكتب وصفاً معمارياً قبل بدء الترميم.");
  }
  if (prompt.length > 3000) return sendError(res, 400, "الوصف طويل جداً.");

  try {
    const request = buildOpenRouterRequest(imageDataUrl, prompt, apiKey);
    const upstream = await fetch(request.url, request.init);

    let data: unknown = null;
    try {
      data = await upstream.json();
    } catch {
      // non-JSON upstream response — handled below via !upstream.ok
    }

    if (!upstream.ok) {
      const upstreamData = data as { error?: { message?: unknown } } | null;
      const upstreamMessage =
        typeof upstreamData?.error?.message === "string" ? upstreamData.error.message : "";
      if (
        upstream.status === 402 ||
        /insufficient.?credits|out of credits|insufficient balance/i.test(upstreamMessage)
      ) {
        return sendError(
          res,
          502,
          "Insufficient OpenRouter credits. Please top up your account to enable generation.",
        );
      }
      return sendError(res, upstream.status >= 500 ? 502 : upstream.status, "تعذر إكمال الترميم الآن.");
    }

    const output = extractImageData(data);
    if (!output) return sendError(res, 502, "لم تصل صورة من نموذج الترميم.");

    const trimmed = await trimOutputDataUrl(output);
    return res.status(200).json({ imageDataUrl: trimmed });
  } catch {
    return sendError(res, 502, "حدث خطأ أثناء الاتصال بخدمة الترميم.");
  }
}
