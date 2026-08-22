import { useRef, useState, type DragEvent } from "react";
import { Archive, Download, FileCode2, ImagePlus, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { compressImageFile, MAX_DATA_URL_BYTES } from "@/lib/image";
import { rasterizeImageToDxf } from "@/lib/dxf";
import { restoreFacade } from "@/lib/restore";
import {
  QUADRANTS,
  QUADRANT_FILE_NAMES,
  cropImageToQuadrant,
  zipTextFiles,
  type QuadrantId,
} from "@/lib/cadExport";

export const CAD_QUADRANT_PROMPT =
  "Based on this architectural floor plan, generate a single large image divided into a 2x2 grid containing 4 professional architectural drawings. All in black and white clean CAD line art style with sharp thin black lines on pure white background:\n\nTOP-LEFT QUADRANT: Clean 2D CAD floor plan (remove all text labels, keep only walls, doors, windows, stairs as thin black lines)\nTOP-RIGHT QUADRANT: Front elevation drawing showing the building exterior facade with windows, doors, roof, and floor levels\nBOTTOM-LEFT QUADRANT: Architectural cross-section drawing showing interior room heights, floor slabs, cut walls, stairs, and roof structure\nBOTTOM-RIGHT QUADRANT: 3D perspective wireframe line drawing of the building from a 3/4 bird's eye view\n\nDraw thin separator lines between the 4 quadrants. Label each quadrant: PLAN, ELEVATION, SECTION, PERSPECTIVE. All drawings must be consistent with each other and derived from the uploaded floor plan.";

const QUADRANT_DOWNLOAD_KEYS: Record<QuadrantId, "cad.downloadPlan" | "cad.downloadElevation" | "cad.downloadSection" | "cad.downloadPerspective"> = {
  plan: "cad.downloadPlan",
  elevation: "cad.downloadElevation",
  section: "cad.downloadSection",
  perspective: "cad.downloadPerspective",
};

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(blob)
    : `data:application/octet-stream;charset=utf-8,${encodeURIComponent(blob.toString())}`;
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  if (objectUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CadVectorizerSection() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadingQuadrant, setDownloadingQuadrant] = useState<QuadrantId | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const compressed = await compressImageFile(file);
      if (compressed.length > MAX_DATA_URL_BYTES) {
        setError(t("cad.errorPayload"));
        return;
      }
      setImageDataUrl(compressed);
      setStatus(t("cad.statusUploaded"));
    } catch {
      setError(t("cad.errorGeneric"));
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const handleConvert = async () => {
    if (!imageDataUrl) {
      setError(t("cad.errorNoImage"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const output = await restoreFacade({
        imageDataUrl,
        prompt: CAD_QUADRANT_PROMPT,
        mode: "cad",
      });
      setResult(output);
      setStatus(t("cad.statusComplete"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || t("cad.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadQuadrant = async (quadrant: QuadrantId) => {
    if (!result) return;
    setError(null);
    setDownloadingQuadrant(quadrant);
    try {
      const cropped = await cropImageToQuadrant(result, quadrant);
      const dxf = await rasterizeImageToDxf(cropped);
      downloadBlob(new Blob([dxf], { type: "application/dxf" }), QUADRANT_FILE_NAMES[quadrant]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || t("cad.errorEmptyDxf"));
    } finally {
      setDownloadingQuadrant(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!result) return;
    setError(null);
    setDownloadingAll(true);
    try {
      const files = await Promise.all(
        QUADRANTS.map(async (quadrant) => {
          const cropped = await cropImageToQuadrant(result, quadrant);
          const content = await rasterizeImageToDxf(cropped);
          return { name: QUADRANT_FILE_NAMES[quadrant], content };
        }),
      );
      const blob = await zipTextFiles(files);
      downloadBlob(blob, "egyptian-center-cad-4-views.zip");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || t("cad.errorEmptyDxf"));
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <section id="cad-studio-panel" role="tabpanel" aria-labelledby="cad-studio-tab" className="cad-studio-section scroll-mt-28 bg-navy-light/30 py-20">
      <div className="container">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-gold">— {t("cad.label")}</p>
          <h2 className="font-cairo text-3xl font-semibold text-foreground md:text-4xl">{t("cad.title")}</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{t("cad.desc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-2">
            <div>
              <p className="mb-3 text-sm font-medium text-foreground">{t("cad.inputTitle")}</p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`relative flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  dragging ? "border-gold bg-gold/10" : "border-border bg-navy-light/50 hover:border-gold/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label={t("cad.inputTitle")}
                  className="sr-only"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
                {imageDataUrl ? (
                  <>
                    <img src={imageDataUrl} alt={t("cad.inputTitle")} className="max-h-48 rounded object-contain" />
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gold"><RefreshCw size={14} /> {t("cad.replace")}</span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={34} className="text-gold" />
                    <span className="text-sm font-medium text-foreground">{t("cad.dropHint")}</span>
                    <span className="text-xs text-muted-foreground">{t("cad.dropSub")}</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={loading}
              className="animate-gold-glow inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-6 py-4 font-semibold text-navy transition-all duration-200 hover:bg-gold-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {loading ? t("cad.convertLoading") : t("cad.convertButton")}
            </button>

            {error && <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            {status && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{status}</p>}
          </div>

          <div className="lg:col-span-3">
            <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-gold/25 bg-navy-light/40 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-cairo text-lg font-semibold text-foreground">{t("cad.outputTitle")}</h3>
                <span className="inline-flex items-center gap-1.5 rounded border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] text-gold"><FileCode2 size={13} /> 4 × DXF</span>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg border border-border/60 bg-white p-4">
                {loading ? (
                  <div className="flex flex-col items-center gap-3 text-slate-600"><Loader2 size={30} className="animate-spin text-gold-dark" /><span className="text-sm">{t("cad.convertLoading")}</span></div>
                ) : result ? (
                  <img src={result} alt="Generated 4 architectural views" className="block h-auto max-h-[560px] w-auto max-w-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="max-w-xs text-center text-slate-600"><Sparkles size={28} className="mx-auto mb-3 text-gold-dark/60" /><p className="text-sm">{t("cad.outputEmpty")}</p></div>
                )}
              </div>
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUADRANTS.map((quadrant) => (
                    <button
                      key={quadrant}
                      type="button"
                      onClick={() => void handleDownloadQuadrant(quadrant)}
                      disabled={!result || downloadingAll || downloadingQuadrant !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {downloadingQuadrant === quadrant ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {downloadingQuadrant === quadrant ? t("cad.downloadQuadrantLoading") : t(QUADRANT_DOWNLOAD_KEYS[quadrant])}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadAll()}
                  disabled={!result || downloadingAll || downloadingQuadrant !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-5 py-3 font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloadingAll ? <Loader2 size={17} className="animate-spin" /> : <Archive size={17} />}
                  {downloadingAll ? t("cad.downloadAllLoading") : t("cad.downloadAll")}
                </button>
                <p className="text-center text-xs text-muted-foreground">{t("cad.downloadHint")}</p>
                <p className="border-t border-gold/15 pt-3 text-center text-xs leading-relaxed text-muted-foreground">{t("cad.reviewNote")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
