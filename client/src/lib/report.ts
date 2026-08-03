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

export type SyndicateReportInput = {
  prompt: string;
  status: string;
  createdAt: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
};

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

function safeImageSource(value: string): string | null {
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("https://")) return value;
  return null;
}

function imageMarkup(label: string, imageSource: string | null): string {
  const source = imageSource ? safeImageSource(imageSource) : null;
  if (!source) {
    return `<div class="image-empty">${escapeHtml(label)} unavailable</div>`;
  }
  return `<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(label)}" /><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

export function buildSyndicateReportHtml(input: SyndicateReportInput): string {
  const prompt = escapeHtml(input.prompt || "No architectural prompt was supplied.");
  const status = escapeHtml(input.status || "Session created");
  const createdAt = escapeHtml(input.createdAt);

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Egyptian Engineers Syndicate — Restoration Report</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Arial, sans-serif; }
    body { margin: 0; padding: 40px; color: #f3ead8; background: #0a0f1d; }
    main { max-width: 980px; margin: auto; padding: 36px; border: 1px solid #c5a059; border-radius: 24px; background: #121824; }
    h1 { margin: 0 0 8px; color: #ddbb7f; font-size: 30px; }
    h2 { margin: 30px 0 10px; color: #ddbb7f; font-size: 18px; }
    p, dd { line-height: 1.8; }
    .kicker { color: #c5a059; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; }
    dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 20px; }
    dt { color: #c5a059; font-weight: 700; }
    dd { margin: 0; }
    .triptych-note { padding: 14px 16px; border-left: 3px solid #c5a059; color: #d9d2c2; background: rgba(197,160,89,.09); }
    .images { display: grid; grid-template-columns: 1fr 1.5fr; gap: 18px; align-items: start; }
    figure { margin: 0; overflow: hidden; border: 1px solid rgba(197,160,89,.35); border-radius: 14px; background: #0a0f1d; }
    img { display: block; width: 100%; max-height: 560px; object-fit: contain; }
    figcaption, .image-empty { padding: 12px; color: #c5a059; }
    footer { margin-top: 32px; color: #8d98aa; font-size: 12px; }
    @media (max-width: 700px) { body { padding: 14px; } main { padding: 20px; } .images, dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Egyptian Center for AI in Architecture &amp; Urbanism</p>
    <h1>Egyptian Engineers Syndicate — Restoration Report</h1>
    <p>Official session record for an AI-assisted Egyptian facade restoration study.</p>
    <p class="triptych-note"><strong>Single-call output:</strong> the generated result is one 8K-style architectural triptych with Khedivial Classic, Hashami / Biophilic, and Islamic Mashrabiya panels separated by thin gold borders.</p>
    <dl>
      <dt>Session status</dt><dd>${status}</dd>
      <dt>Created</dt><dd dir="ltr">${createdAt}</dd>
      <dt>Architectural prompt</dt><dd>${prompt}</dd>
    </dl>
    <h2>Visual record</h2>
    <div class="images">
      ${imageMarkup("Uploaded facade", input.inputImageDataUrl)}
      ${imageMarkup("Generated three-panel triptych", input.outputImageDataUrl)}
    </div>
    <footer>Conceptual output only. Verify dimensions, materials, heritage constraints, accessibility, and structural decisions with licensed architects and engineers.</footer>
  </main>
</body>
</html>`;
}

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function downloadSyndicateReport(input: SyndicateReportInput): void;
export function downloadSyndicateReport(imageDataUrl: string, prompt: string): Promise<void>;
export function downloadSyndicateReport(
  inputOrImage: SyndicateReportInput | string,
  legacyPrompt?: string,
): void | Promise<void> {
  if (typeof inputOrImage !== "string") {
    const blob = new Blob([buildSyndicateReportHtml(inputOrImage)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      triggerDownload(url, "egyptian-facade-syndicate-report.html");
    } finally {
      URL.revokeObjectURL(url);
    }
    return;
  }

  const imageDataUrl = inputOrImage;
  const report = buildSyndicateReport({ prompt: legacyPrompt ?? "", imageDataUrl });
  const stamp = timestamp();
  const reportUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  try {
    triggerDownload(reportUrl, `syndicate-report-metadata-${stamp}.json`);
  } finally {
    URL.revokeObjectURL(reportUrl);
  }

  if (/^data:image\//i.test(imageDataUrl)) {
    triggerDownload(imageDataUrl, `official-syndicate-report-triptych-${stamp}.png`);
    return Promise.resolve();
  }
  if (/^https?:\/\//i.test(imageDataUrl)) {
    return fetch(imageDataUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        try {
          triggerDownload(objectUrl, `official-syndicate-report-triptych-${stamp}.png`);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch(() => {
        window.open(imageDataUrl, "_blank", "noopener,noreferrer");
      });
  }
  return Promise.resolve();
}
