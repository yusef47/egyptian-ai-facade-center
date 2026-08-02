export interface RestoreRequest {
  imageDataUrl: string;
  prompt: string;
}

export interface RestoreResult {
  imageDataUrl: string;
}

const IMAGE_REFERENCE_RE = /^(data:image\/|https?:\/\/)/i;

/**
 * Calls the Vercel serverless route /api/restore with the compressed
 * image data URL and the architectural prompt, returning the restored
 * facade image (either a hosted https:// URL or a data:image/... string).
 */
export async function restoreFacade(request: RestoreRequest): Promise<string> {
  const response = await fetch("/api/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON upstream response
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const output = (data as RestoreResult | null)?.imageDataUrl;
  if (typeof output !== "string" || output.length === 0 || !IMAGE_REFERENCE_RE.test(output)) {
    throw new Error("No image returned");
  }
  return output;
}
