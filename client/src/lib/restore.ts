export interface RestoreRequest {
  imageDataUrl: string;
  prompt: string;
}

export interface RestoreResult {
  imageDataUrl: string;
}

/**
 * Calls the Vercel serverless route /api/restore with the compressed
 * image data URL and the architectural prompt, returning the restored
 * facade image data URL on success.
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
  if (typeof output !== "string" || output.length === 0) {
    throw new Error("No image returned");
  }
  return output;
}
