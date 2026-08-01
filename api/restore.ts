import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildOpenRouterRequest,
  extractImageData,
} from "../src/lib/openrouter.js";
import { createRateLimiter } from "../src/lib/rateLimit.js";

const MAX_DATA_URL_BYTES = 3_500_000;
// Best-effort per-warm-instance burst guard. Use distributed storage/auth for public production traffic.
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
      return sendError(res, upstream.status >= 500 ? 502 : upstream.status, "تعذر إكمال الترميم الآن.");
    }

    const output = extractImageData(data);
    if (!output) return sendError(res, 502, "لم تصل صورة من نموذج الترميم.");
    return res.status(200).json({ imageDataUrl: output });
  } catch {
    return sendError(res, 502, "حدث خطأ أثناء الاتصال بخدمة الترميم.");
  }
}
