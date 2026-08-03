import { FileDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type SyndicateReportProps = {
  prompt: string;
  status: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
  onDownload: () => void;
};

export default function SyndicateReport({
  prompt,
  status,
  inputImageDataUrl,
  outputImageDataUrl,
  onDownload,
}: SyndicateReportProps) {
  const { lang } = useI18n();
  const hasSession = Boolean(prompt.trim() || inputImageDataUrl || outputImageDataUrl);

  return (
    <section id="report" className="container scroll-mt-24 py-16" aria-labelledby="report-title">
      <div className="rounded-xl border border-gold/30 bg-navy-light/60 p-6 md:p-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-gold">
              {lang === "ar" ? "التوثيق الرسمي" : "Official documentation"}
            </p>
            <h2 id="report-title" className="font-serif text-2xl text-foreground md:text-3xl">
              {lang === "ar" ? "تقرير النقابة" : "Syndicate report"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {lang === "ar"
                ? "نزّل ملف HTML يتضمن الصورة المرفوعة، الوصف المعماري، ونتيجة التريبتيك المولدة في جلسة واحدة."
                : "Download an HTML record containing the uploaded facade, architectural prompt, and single-call generated triptych."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {status}
            </p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            disabled={!hasSession}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown size={17} aria-hidden="true" />
            {lang === "ar" ? "تنزيل تقرير النقابة" : "Download syndicate report"}
          </button>
        </div>
      </div>
    </section>
  );
}
