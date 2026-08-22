import JSZip from "jszip";

export type QuadrantId = "plan" | "elevation" | "section" | "perspective";

export const QUADRANTS: readonly QuadrantId[] = ["plan", "elevation", "section", "perspective"];

/**
 * 2x2 grid positions matching the generation prompt:
 * top-left PLAN, top-right ELEVATION, bottom-left SECTION, bottom-right PERSPECTIVE.
 */
export const QUADRANT_GRID: Record<QuadrantId, { col: 0 | 1; row: 0 | 1 }> = {
  plan: { col: 0, row: 0 },
  elevation: { col: 1, row: 0 },
  section: { col: 0, row: 1 },
  perspective: { col: 1, row: 1 },
};

export const QUADRANT_FILE_NAMES: Record<QuadrantId, string> = {
  plan: "plan.dxf",
  elevation: "elevation.dxf",
  section: "section.dxf",
  perspective: "perspective.dxf",
};

/**
 * Loads the cached 2x2 CAD image, crops a single quadrant, and returns it as a
 * PNG data URL for local Potrace vectorization. Purely client-side.
 */
export function cropImageToQuadrant(imageUrl: string, quadrant: QuadrantId): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      reject(new Error("Browser image APIs are unavailable"));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) throw new Error("Generated image has no dimensions");

        const { col, row } = QUADRANT_GRID[quadrant];
        const quadrantWidth = Math.floor(width / 2);
        const quadrantHeight = Math.floor(height / 2);
        const sourceX = col * quadrantWidth;
        const sourceY = row * quadrantHeight;

        const canvas = document.createElement("canvas");
        canvas.width = quadrantWidth;
        canvas.height = quadrantHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D context is unavailable");
        context.drawImage(image, sourceX, sourceY, quadrantWidth, quadrantHeight, 0, 0, quadrantWidth, quadrantHeight);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unable to crop CAD quadrant"));
      }
    };
    image.onerror = () => reject(new Error("Unable to load generated CAD image"));
    image.src = imageUrl;
  });
}

/** Races a promise against a timeout, rejecting if the deadline is exceeded. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Bundles text files into a single ZIP blob for a one-click multi-file download. */
export async function zipTextFiles(files: readonly { name: string; content: string }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  return zip.generateAsync({ type: "blob" });
}
