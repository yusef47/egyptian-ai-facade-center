export interface ReportPanel {
  id: string;
  en: string;
  ar: string;
}

/** The three mandatory panels of the V115 triptych presentation board. */
export const TRIPTYCH_PANELS: ReportPanel[] = [
  { id: "khedivial", en: "Khedivial Classic", ar: "الكلاسيكي الخديوي" },
  { id: "hashami", en: "Hashami / Biophilic", ar: "الهشمي / البيوفيلي" },
  { id: "mashrabiya", en: "Islamic Mashrabiya", ar: "المشربيات الإسلامية" },
];

export interface SyndicateReport {
  generator: string;
  model: string;
  panels: ReportPanel[];
  prompt: string;
  imageDataUrl: string;
  generatedAt: string;
}

export function buildSyndicateReport(params: {
  prompt: string;
  imageDataUrl: string;
  generatedAt?: string;
}): SyndicateReport {
  return {
    generator: "Egyptian Center for AI in Architecture & Urbanism",
    model: "google/gemini-3.1-flash-lite-image",
    panels: TRIPTYCH_PANELS,
    prompt: params.prompt,
    imageDataUrl: params.imageDataUrl,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Downloads the official syndicate report: the 8K triptych board image plus a
 * machine-readable JSON metadata report identifying the three panels.
 * Handles both data: URLs and hosted https:// image references.
 */
export async function downloadSyndicateReport(
  imageDataUrl: string,
  prompt: string,
): Promise<void> {
  const report = buildSyndicateReport({ prompt, imageDataUrl });
  const stamp = timestamp();

  // 1) The machine-readable syndicate report first — always triggered inside
  // the user-activation window so browsers never block it.
  const reportBlob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const reportUrl = URL.createObjectURL(reportBlob);
  try {
    triggerDownload(reportUrl, `syndicate-report-metadata-${stamp}.json`);
  } finally {
    URL.revokeObjectURL(reportUrl);
  }

  // 2) The 8K triptych board image (best-effort for hosted URLs).
  if (/^data:image\//i.test(imageDataUrl)) {
    triggerDownload(imageDataUrl, `official-syndicate-report-triptych-${stamp}.png`);
  } else if (/^https?:\/\//i.test(imageDataUrl)) {
    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        triggerDownload(objectUrl, `official-syndicate-report-triptych-${stamp}.png`);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      window.open(imageDataUrl, "_blank", "noopener,noreferrer");
    }
  }
}
