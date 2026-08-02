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

function imageMarkup(label: string, imageDataUrl: string | null): string {
  const source = imageDataUrl ? safeImageSource(imageDataUrl) : null;
  if (!source) {
    return `<div class="image-empty">${escapeHtml(label)} غير متاح</div>`;
  }
  return `<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(label)}" /><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

export function buildSyndicateReportHtml(input: SyndicateReportInput): string {
  const prompt = escapeHtml(input.prompt || "لم تتم إضافة وصف.");
  const status = escapeHtml(input.status || "جلسة جديدة");
  const createdAt = escapeHtml(input.createdAt);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تقرير نقابة المهندسين المصرية</title>
  <style>
    :root { color-scheme: dark; font-family: Cairo, Arial, sans-serif; }
    body { margin: 0; padding: 40px; color: #f3eee2; background: #0a0f1d; }
    main { max-width: 960px; margin: auto; padding: 36px; border: 1px solid #c5a059; border-radius: 24px; background: #121a2a; }
    h1 { margin: 0 0 8px; color: #e7c77e; font-size: 30px; }
    h2 { margin: 30px 0 10px; color: #e7c77e; font-size: 17px; }
    p, dd { line-height: 1.9; }
    dl { display: grid; grid-template-columns: 150px 1fr; gap: 8px 20px; }
    dt { color: #c5a059; font-weight: 700; }
    dd { margin: 0; }
    .images { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    figure { margin: 0; overflow: hidden; border: 1px solid rgba(197,160,89,.35); border-radius: 14px; background: #0a0f1d; }
    img { display: block; width: 100%; max-height: 520px; object-fit: contain; }
    figcaption, .image-empty { padding: 12px; color: #c5a059; }
    footer { margin-top: 32px; color: #8d98aa; font-size: 12px; }
    @media (max-width: 680px) { body { padding: 14px; } main { padding: 20px; } .images, dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <p>المركز المصري للذكاء الاصطناعي في العمارة والعمران</p>
    <h1>تقرير نقابة المهندسين المصرية</h1>
    <p>ملف توثيق جلسة ترميم واجهة بالذكاء الاصطناعي</p>
    <dl>
      <dt>حالة الجلسة</dt><dd>${status}</dd>
      <dt>تاريخ الإنشاء</dt><dd dir="ltr">${createdAt}</dd>
      <dt>التوجيه المعماري</dt><dd>${prompt}</dd>
    </dl>
    <h2>السجل البصري</h2>
    <div class="images">
      ${imageMarkup("الواجهة الأصلية", input.inputImageDataUrl)}
      ${imageMarkup("الواجهة بعد الترميم", input.outputImageDataUrl)}
    </div>
    <footer>تم إنشاء هذا التقرير من استوديو ترميم الواجهات التابع للمركز المصري للذكاء الاصطناعي.</footer>
  </main>
</body>
</html>`;
}

export function downloadSyndicateReport(input: SyndicateReportInput): void {
  const blob = new Blob([buildSyndicateReportHtml(input)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "egyptian-facade-syndicate-report.html";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
