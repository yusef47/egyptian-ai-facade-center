import type { VercelRequest, VercelResponse } from "@vercel/node";

export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-lite-image";

const MAX_DATA_URL_BYTES = 3_500_000;

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

function extractFromImages(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const candidate = image as Record<string, unknown>;
    if (typeof candidate.b64_json === "string") {
      return decodeBase64(candidate.b64_json);
    }
    if (typeof candidate.url === "string") return candidate.url;
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
      if (typeof imageUrl === "string") return imageUrl;
      if (imageUrl && typeof imageUrl === "object") {
        const url = (imageUrl as Record<string, unknown>).url;
        if (typeof url === "string") return url;
      }
      if (typeof item.b64_json === "string") return decodeBase64(item.b64_json);
      if (typeof item.url === "string") return item.url;
    }
  }
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
    const data: unknown = await upstream.json();
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
    return res.status(200).json({ imageDataUrl: output });
  } catch {
    return sendError(res, 502, "حدث خطأ أثناء الاتصال بخدمة الترميم.");
  }
}
