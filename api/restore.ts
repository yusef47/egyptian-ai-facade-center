import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  CAD_SYSTEM_PROMPT,
  MASTER_ARCHITECTURAL_SYSTEM_PROMPT,
  OPENROUTER_ENDPOINT,
  OPENROUTER_MODEL,
  buildOpenRouterRequest,
  executeRestore,
  extractImageData,
  extractImageUrlFromText,
  trimOutputDataUrl,
} from "../lib/openrouter-engine";

export {
  CAD_SYSTEM_PROMPT,
  MASTER_ARCHITECTURAL_SYSTEM_PROMPT,
  OPENROUTER_ENDPOINT,
  OPENROUTER_MODEL,
  buildOpenRouterRequest,
  executeRestore,
  extractImageData,
  extractImageUrlFromText,
  trimOutputDataUrl,
};

function sendError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

function getClientKey(req: VercelRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") return forwardedFor.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "يسمح هذا المسار بطلبات POST فقط.");
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return sendError(res, 400, "صيغة الطلب غير صالحة.");
  }

  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(req),
  });

  if (!result.ok) return sendError(res, result.status, result.message);
  return res.status(200).json({ imageDataUrl: result.imageDataUrl });
}
