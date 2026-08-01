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

export function extractImageData(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;

  const images = record.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const candidate = image as Record<string, unknown>;
      if (typeof candidate.b64_json === "string") {
        return decodeBase64(candidate.b64_json);
      }
      if (typeof candidate.url === "string") return candidate.url;
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
      const candidate = image as Record<string, unknown>;
      if (typeof candidate.b64_json === "string") return decodeBase64(candidate.b64_json);
      if (typeof candidate.url === "string") return candidate.url;
    }
  }

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
