import { createHash } from "node:crypto";
import { INSTAPAY_ADDRESS } from "./topups.js";

/**
 * AI anti-fraud receipt audit for InstaPay top-ups (server-side only).
 *
 * The receipt screenshot is sent to the vision engine with a strict
 * verification prompt that answers ONE question: is this a genuine,
 * successful transfer receipt to the Qattan InstaPay address? The verdict
 * arrives as structured JSON and is parsed defensively — a malformed or
 * non-JSON answer is treated as a failed audit, never as a pass.
 */

export type ReceiptAuditVerdict = {
  isValidReceipt: boolean;
  detectedAmount: number;
  confidence: "high" | "low";
  reason: string;
};

export type ReceiptAuditResult =
  | { ok: true; verdict: ReceiptAuditVerdict }
  | { ok: false; reason: "not_configured" | "upstream" | "invalid_verdict" };

export const RECEIPT_INVALID_BILINGUAL =
  "الصورة المرفوعة ليست إيصال تحويل InstaPay صالح. يرجى رفع سكرين شوت الإيصال الحقيقي. | The uploaded image is not a valid InstaPay transfer receipt. Please upload a screenshot of the genuine receipt.";
export const RECEIPT_REPLAY_BILINGUAL = "تم استخدام هذا الإيصال من قبل. | This receipt has already been used.";

/** The exact vision prompt shared by the audit call. */
export const RECEIPT_AUDIT_PROMPT = `You are a strict payment-fraud auditor for InstaPay transfers in Egypt.

Analyze the attached image and decide whether it is a GENUINE InstaPay transfer receipt screenshot.

Verification checklist:
1. The image must look like a real InstaPay app/payment screenshot (UI layout, Arabic/English payment confirmation text, transaction details), NOT a photo of nature, a person, a document page, a random screenshot, or a blank/fabricated image.
2. It must contain explicit SUCCESS confirmation, such as "تم التحويل بنجاح", "Successful", "Success", or "Done". Pending/failed transfers are NOT valid.
3. The recipient shown must match "${INSTAPAY_ADDRESS}" or a recipient name equivalent to "Ahmed El Qattan".

Answer ONLY with minified JSON in exactly this shape, with no markdown fences and no commentary:
{"isValidReceipt": boolean, "detectedAmount": number, "confidence": "high" | "low", "reason": string}

Rules:
- "isValidReceipt" is true ONLY when ALL three checks pass with high certainty.
- "detectedAmount" is the transferred amount in EGP as a number (0 when unreadable).
- "confidence" is "high" only when the receipt is unambiguous; any doubt means "low".
- "reason" is a short English explanation (max 200 chars) for the decision.`.trim();

/** Parse the model's answer defensively — anything non-conforming fails. */
export function parseReceiptAuditJson(text: unknown): ReceiptAuditVerdict | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const isValidReceipt = raw.isValidReceipt === true;
    const detectedAmount =
      typeof raw.detectedAmount === "number" && Number.isFinite(raw.detectedAmount)
        ? raw.detectedAmount
        : Number(raw.detectedAmount) || 0;
    // Only the exact expected enum values are accepted — anything else
    // (missing, uppercase, invented) voids the whole verdict so the route
    // fails closed instead of guessing.
    const confidence = raw.confidence === "high" ? "high" : raw.confidence === "low" ? "low" : null;
    const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 300) : "";
    if (confidence === null) return null;
    return { isValidReceipt, detectedAmount, confidence, reason };
  } catch {
    return null;
  }
}

/**
 * Run the vision audit against the receipt image. Uses the same engine
 * request builder conventions as the generation engine (bearer key, chat
 * completions payload) but in TEXT-only mode: no image is generated.
 */
export async function auditReceipt(
  imageDataUrl: string,
  apiKey: string,
): Promise<ReceiptAuditResult> {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: RECEIPT_AUDIT_PROMPT },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];

  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "google/gemini-3.1-flash-lite-image",
        messages,
      }),
    });
  } catch {
    return { ok: false, reason: "upstream" };
  }

  if (!upstream.ok) {
    console.log(
      `[RECEIPT_AUDIT_UPSTREAM] status=${upstream.status}`,
    );
    return { ok: false, reason: "upstream" };
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return { ok: false, reason: "upstream" };
  }

  const content = extractAuditText(data);
  if (content === null) return { ok: false, reason: "upstream" };

  const verdict = parseReceiptAuditJson(content);
  if (!verdict) return { ok: false, reason: "invalid_verdict" };
  return { ok: true, verdict };
}

/** Pull the first text block out of a chat-completions response. */
function extractAuditText(data: unknown): string | null {
  const choices = (data as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object") {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return null;
}

/** SHA-256 hex digest of the receipt's raw bytes — the anti-replay key. */
export function hashReceiptImage(dataUrl: string): string {
  const base64 = dataUrl.replace(/^data:[^;,]+;base64,/, "");
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}
