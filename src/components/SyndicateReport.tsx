type SyndicateReportProps = {
  prompt: string;
  status: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
  onDownload: () => void;
};

export function SyndicateReport({
  prompt,
  status,
  inputImageDataUrl,
  outputImageDataUrl,
  onDownload,
}: SyndicateReportProps) {
  const hasSession = Boolean(prompt.trim() || inputImageDataUrl || outputImageDataUrl);

  return (
    <section className="report-section glass-panel" id="report" dir="rtl" aria-labelledby="report-title">
      <div className="report-seal" aria-hidden="true">نقابة<br /><span>م</span></div>
      <div className="report-copy">
        <span className="section-overline">03 · التوثيق الرسمي</span>
        <h2 id="report-title">تصدير تقرير <em>النقابة</em></h2>
        <p>أنشئ ملفاً رسمياً يوثق مدخلات الجلسة، التوجيه المعماري، وحالة الترميم للمراجعة الهندسية.</p>
        <div className="report-meta"><span>● {hasSession ? "جلسة موثقة" : "بانتظار جلسة"}</span><span>{status}</span></div>
      </div>
      <button className="report-button" type="button" onClick={onDownload} disabled={!hasSession}>
        <span aria-hidden="true">↓</span>
        <strong>تصدير تقرير النقابة</strong>
        <small>HTML · ملف توثيق رسمي</small>
      </button>
    </section>
  );
}
