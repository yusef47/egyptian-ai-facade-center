import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { ImagePlus, Loader2, RefreshCw, Sparkles, Timer, Trophy } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { compressImageFile, MAX_DATA_URL_BYTES } from "@/lib/image";
import { restoreFacade } from "@/lib/restore";

const STYLES: { id: string; en: string; ar: string }[] = [
  { id: "khedivial", en: "Khedivial Cairo", ar: "القاهرة الخديوية" },
  { id: "mashrabiya", en: "Wooden Mashrabiya", ar: "المشربيات الخشبية" },
  { id: "hashami", en: "Hashami Stone", ar: "الحجر الهشمي" },
  { id: "pharaonic", en: "Pharaonic Revival", ar: "الإحياء الفرعوني" },
];

export default function EngineSection() {
  const { t, lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      if (compressed.length > MAX_DATA_URL_BYTES) {
        setError(t("studio.errorPayload"));
        return;
      }
      setImageDataUrl(compressed);
      setImageName(file.name);
      setResult(null);
    } catch {
      setError(t("studio.errorGeneric"));
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!imageDataUrl) {
      setError(t("studio.errorNoImage"));
      return;
    }
    const basePrompt = prompt.trim();
    if (basePrompt.length < 3) {
      setError(t("studio.errorNoPrompt"));
      return;
    }
    const style = STYLES.find((s) => s.id === selectedStyle);
    const finalPrompt = style
      ? `${lang === "ar" ? style.ar : style.en} — ${basePrompt}`
      : basePrompt;

    setError(null);
    setLoading(true);
    try {
      const output = await restoreFacade({ imageDataUrl, prompt: finalPrompt });
      setResult(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/credit|balance|quota|402|429/i.test(message)) {
        setError(t("studio.creditsHint"));
      } else if (message) {
        setError(message);
      } else {
        setError(t("studio.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  const styleLabel = (style: (typeof STYLES)[number], lang: Lang) =>
    lang === "ar" ? style.ar : style.en;

  return (
    <section id="studio" className="py-20 bg-navy-light/30 scroll-mt-20">
      <div className="container">
        {/* Section Header */}
        <div className="mb-12">
          <p className="text-gold text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            — {t("studio.label")}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-foreground mb-4">
            {t("studio.title")}
          </h2>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            {t("studio.desc")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-2 space-y-5">
            {/* Upload */}
            <div>
              <p className="text-foreground text-sm font-medium mb-3">{t("studio.inputTitle")}</p>
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
                className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
                  dragging
                    ? "border-gold bg-gold/10"
                    : "border-border bg-navy-light/50 hover:border-gold/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label={t("studio.inputTitle")}
                  className="sr-only"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
                {imageDataUrl ? (
                  <>
                    <img
                      src={imageDataUrl}
                      alt={t("studio.inputTitle")}
                      className="max-h-44 rounded object-contain"
                    />
                    <span className="inline-flex items-center gap-1.5 text-gold text-sm font-medium">
                      <RefreshCw size={14} /> {t("studio.replace")}
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={32} className="text-gold" />
                    <span className="text-foreground text-sm font-medium">
                      {t("studio.dropHint")}
                    </span>
                    <span className="text-muted-foreground text-xs">{t("studio.dropSub")}</span>
                  </>
                )}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label htmlFor="restore-prompt" className="block text-foreground text-sm font-medium mb-3">
                {t("studio.promptLabel")}
              </label>
              <textarea
                id="restore-prompt"
                aria-label={t("studio.promptLabel")}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("studio.promptPlaceholder")}
                rows={4}
                className="w-full rounded-lg border border-border bg-navy-light/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30 transition-colors resize-none"
              />
            </div>

            {/* Styles */}
            <div>
              <p className="text-foreground text-sm font-medium mb-1">{t("studio.styleLabel")}</p>
              <p className="text-muted-foreground text-xs mb-3">{t("studio.styleHint")}</p>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() =>
                      setSelectedStyle((prev) => (prev === style.id ? null : style.id))
                    }
                    aria-pressed={selectedStyle === style.id}
                    className={`px-4 py-2 rounded-full text-xs font-medium border transition-all duration-200 ${
                      selectedStyle === style.id
                        ? "bg-gold text-navy border-gold"
                        : "bg-navy-light/50 border-border text-foreground hover:border-gold/40"
                    }`}
                  >
                    {styleLabel(style, lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="animate-gold-glow w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t("studio.buttonLoading")}
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  {t("studio.button")}
                </>
              )}
            </button>

            {error && (
              <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded px-4 py-3">
                {error}
              </p>
            )}
          </div>

          {/* Output */}
          <div className="lg:col-span-3">
            <div className="h-full rounded-lg border border-gold/25 bg-navy-light/40 p-5 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="font-serif text-lg text-foreground">{t("studio.outputTitle")}</h3>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
                    <Timer size={11} /> {t("studio.fastBadge")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
                    <Trophy size={11} /> {t("studio.eightKBadge")}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-[320px] rounded-lg border border-border/60 bg-background/40 overflow-hidden relative flex items-center justify-center p-4">
                {loading ? (
                  <div className="animate-restore-pulse w-full h-full min-h-[320px] flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="text-gold animate-spin" />
                    <span className="text-muted-foreground text-sm">{t("studio.buttonLoading")}</span>
                  </div>
                ) : result && imageDataUrl ? (
                  <div className="w-full space-y-4">
                    <div className="relative rounded-lg overflow-hidden border border-border/60">
                      <img
                        src={result}
                        alt={t("studio.outputRestored")}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[420px] object-contain bg-black/30"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <span>{t("studio.outputOriginal")}</span>
                      <span className="text-gold">✦</span>
                      <span className="text-gold">{t("studio.outputRestored")}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center max-w-xs">
                    <Sparkles size={28} className="text-gold/50 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">{t("studio.outputEmpty")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
