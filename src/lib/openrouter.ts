export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-lite-image";

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

// V109.4: hosted URLs are preferred over base64 so the Vercel response stays small.
// Data URLs are also accepted (returned as-is) so no valid image is dropped.
function hostedUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("data:image/")) return trimmed;
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
    // Parse markdown image syntax: ![alt](https://...)
    const markdown = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)\s*\)/.exec(trimmed);
    if (markdown) return markdown[1];
  }
  return null;
}

function pickImage(candidate: Record<string, unknown>): string | null {
  const url = hostedUrl(candidate.url);
  if (url) return url;
  const imageUrl = candidate.image_url;
  if (imageUrl && typeof imageUrl === "object") {
    const nested = hostedUrl((imageUrl as Record<string, unknown>).url);
    if (nested) return nested;
  }
  const contentUrl = hostedUrl(imageUrl as string);
  if (contentUrl) return contentUrl;
  if (typeof candidate.b64_json === "string") return decodeBase64(candidate.b64_json);
  const textUrl = hostedUrl(candidate.text);
  if (textUrl) return textUrl;
  return null;
}

export function extractImageData(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;

  const images = record.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const found = pickImage(image as Record<string, unknown>);
      if (found) return found;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as Record<string, unknown>).message;
      const found = extractImageDataFromContent(message);
      if (found) return found;
    }
  }

  return extractImageDataFromContent(record);
}

function extractImageDataFromContent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const images = record.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const found = pickImage(image as Record<string, unknown>);
      if (found) return found;
    }
  }

  const content = record.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const item = part as Record<string, unknown>;
      const found = pickImage(item);
      if (found) return found;
    }
  }

  const rawText = record.text;
  if (typeof rawText === "string") {
    const url = hostedUrl(rawText);
    if (url) return url;
  }
  return null;
}
