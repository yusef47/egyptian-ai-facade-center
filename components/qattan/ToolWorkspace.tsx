"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Download, ImagePlus, RefreshCw, Sparkles, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { compressImageFile, MAX_DATA_URL_BYTES } from "@/lib/image";
import { restoreFacade } from "@/lib/restore";
import { getSupabaseSessionGate, QATTAN_AUTH_REQUIRED_EVENT } from "../../lib/supabase";
import {
  GALLERY_VARIATION_DIRECTIVE,
  OUTPUT_PRESENTATIONS,
  OUTPUT_PRESENTATION_LABELS,
  TRIPTYCH_DIRECTIVE,
  buildToolPrompt,
  type OutputPresentation,
  type QattanTool,
  type ToolControlId,
  type ToolControlValues,
} from "@tools/registry";
import { useQattan } from "./QattanProviders";
import RequireAuthModal from "./RequireAuthModal";
import ToolGuidePanel from "./ToolGuidePanel";

type ToolWorkspaceProps = {
  tool: QattanTool;
  onSessionChange?: (session: {
    prompt: string;
    status: string;
    inputImageDataUrl: string | null;
    outputImageDataUrl: string | null;
  }) => void;
};

const resultReveal = {
  initial: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
  },
};

/**
 * Generic registry-driven workspace for the seven brief-driven tools
 * (exterior, interior, sketch, masterplan, landscape, staging, enhancer).
 * Renders the tool's upload zone and control schema, assembles the final
 * prompt with buildToolPrompt, and submits to /api/restore with toolId.
 */
export default function ToolWorkspace({ tool, onSessionChange }: ToolWorkspaceProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const t = (value: { en: string; ar: string }) => (L ? value.ar : value.en);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous in-flight guard: set BEFORE the first await so two rapid
  // clicks (or an inline click plus a FAB tap) can never both pass the async
  // `loading` check and fire two generations — two engine calls, two credits.
  const inFlightRef = useRef(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [values, setValues] = useState<ToolControlValues>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [presentation, setPresentation] = useState<OutputPresentation>("single");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [zoomDragOffset, setZoomDragOffset] = useState(0);
  const zoomTouchStartY = useRef<number | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // One-thumb access: on phones the sticky FAB triggers the same submission
  // as the inline generate button.
  const submitGeneration = () => void handleSubmit();

  // Lock background scroll while the fullscreen result zoom is open.
  useEffect(() => {
    if (zoomIndex === null) return;
    setZoomDragOffset(0);
    zoomTouchStartY.current = null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomIndex(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [zoomIndex]);

  // Legacy surfaces (facade/floorplan engines) dispatch a global event when an
  // unauthenticated generation is attempted there; open the same gate modal.
  useEffect(() => {
    const onAuthRequired = () => setAuthModalOpen(true);
    window.addEventListener(QATTAN_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(QATTAN_AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  // Touch-drag dismiss: dragging the lightbox content down ≥80px closes it.
  const onZoomTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    zoomTouchStartY.current = event.touches[0]?.clientY ?? null;
  };
  const onZoomTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (zoomTouchStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - zoomTouchStartY.current;
    if (delta > 0) setZoomDragOffset(delta);
  };
  const onZoomTouchEnd = () => {
    if (zoomDragOffset > 80) setZoomIndex(null);
    zoomTouchStartY.current = null;
    setZoomDragOffset(0);
  };

  // Download the generation. Every output mode returns ONE wide image, so
  // there is always a single file (the gallery board splits on the user's
  // device if they want the panels separately).
  const downloadResults = () => {
    results.forEach((src, index) => {
      const anchor = document.createElement("a");
      anchor.href = src;
      anchor.download = `qattan-${tool.id}${results.length > 1 ? `-v${index + 1}` : ""}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      if (compressed.length > MAX_DATA_URL_BYTES) {
        setError(L ? "الصورة كبيرة جداً. جرّب صورة أصغر." : "The image is too large. Try a smaller photo.");
        return;
      }
      setImageDataUrl(compressed);
      setResults([]);
      onSessionChange?.({
        prompt,
        status: L ? "تم رفع الصورة" : "Image uploaded",
        inputImageDataUrl: compressed,
        outputImageDataUrl: null,
      });
    } catch {
      setError(L ? "فشل الرفع. حاول مرة أخرى." : "Upload failed. Please try again.");
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const toggleMulti = (controlId: ToolControlId, option: string) => {
    setMultiSelections((current) => {
      const existing = current[controlId] ?? [];
      const next = existing.includes(option)
        ? existing.filter((value) => value !== option)
        : [...existing, option];
      return { ...current, [controlId]: next };
    });
  };

  const handleSubmit = async () => {
    // EXACTLY ONE HTTP request per Generate click: the synchronous ref guard
    // is claimed before any await, so a double-click / rapid re-fire cannot
    // start a second generation (and a second credit charge). Released the
    // instant the request settles — this is not a cooldown. The `loading`
    // state only reflects the disabled button/FAB, which is set in the same
    // tick as the click.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    try {
      // Mandatory auth gate: block the generation request and surface the
      // luxury sign-in modal when Supabase is configured but no session exists.
      const gate = await getSupabaseSessionGate();
      if (gate === "signed-out") {
        setAuthModalOpen(true);
        return;
      }

      if (!imageDataUrl) {
        setError(L ? "ارفع صورة أولاً." : "Please upload an image first.");
        return;
      }
      const basePrompt = prompt.trim();
      if (basePrompt.length < 3) {
        setError(L ? "اكتب وصفاً للتصميم المطلوب." : "Please describe the design direction you want.");
        return;
      }

      const promptValues: ToolControlValues = { ...values };
      for (const control of tool.controls) {
        if (control.type === "multi") {
          promptValues[control.id] = multiSelections[control.id] ?? [control.options[0]?.value ?? ""];
        }
      }
      const fullPrompt = `${buildToolPrompt(tool.id, promptValues)} Additional direction: ${basePrompt}`;

      const runGeneration = (extraDirective?: string) =>
        restoreFacade({
          imageDataUrl,
          prompt: extraDirective ? `${fullPrompt} ${extraDirective}` : fullPrompt,
          toolId: tool.id,
        });

      setError(null);
      // EXACTLY ONE API call (and therefore exactly one credit) for every
      // output presentation: the mode only shapes the PROMPT, never the
      // number of requests. Gallery/triptych variations are composed inside
      // a single wide 16:9 board by the engine.
      const directive =
        presentation === "gallery"
          ? GALLERY_VARIATION_DIRECTIVE
          : presentation === "triptych"
            ? TRIPTYCH_DIRECTIVE
            : undefined;
      const output = await runGeneration(directive);
      setResults([output]);
      onSessionChange?.({
        prompt: fullPrompt,
        status: L ? "اكتمل التوليد" : "Generation complete",
        inputImageDataUrl: imageDataUrl,
        outputImageDataUrl: output,
      });
    } catch (err) {
      // The server sends polished bilingual, brand-safe messages for every
      // failure class: rate limit, daily-credit exhaustion, sign-in required,
      // busy engine. Surface them VERBATIM — client-side rewriting masked
      // real causes (e.g. credits exhausted) behind a misleading "busy".
      const message = err instanceof Error ? err.message : "";
      setError(message || (L ? "فشل التوليد. حاول مرة أخرى." : "Generation failed. Please try again."));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <section aria-label={tool.title.en}>
      <div className="qattan-tool-grid-layout">
        <div className="qattan-tool-panel qattan-tool-panel-controls">
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
            className={`qattan-tool-upload qattan-touch-target ${dragging ? "qattan-tool-upload-dragging" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label={t(tool.uploadLabel)}
              className="sr-only"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            {imageDataUrl ? (
              <>
                <img src={imageDataUrl} alt={t(tool.uploadLabel)} className="qattan-tool-upload-preview" />
                <span className="qattan-tool-upload-replace">
                  <RefreshCw size={14} aria-hidden="true" /> {L ? "تغيير الصورة" : "Replace image"}
                </span>
              </>
            ) : (
              <>
                <ImagePlus size={30} aria-hidden="true" />
                <span className="qattan-tool-upload-hint">{t(tool.uploadLabel)}</span>
                <span className="qattan-tool-upload-sub">{L ? "اسحب وأفلت أو انقر للتصفح · JPG/PNG" : "Drag & drop or click to browse · JPG/PNG"}</span>
              </>
            )}
          </div>

          {tool.controls.map((control) => (
            <div key={control.id} className="qattan-tool-control">
              <label className="qattan-tool-control-label" htmlFor={`control-${control.id}`}>
                {t(control.label)}
              </label>
              {control.type === "select" ? (
                <select
                  id={`control-${control.id}`}
                  aria-label={t(control.label)}
                  value={(values[control.id] as string) ?? control.options[0]?.value ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [control.id]: event.target.value }))
                  }
                  className="qattan-tool-select"
                >
                  {control.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="qattan-tool-multigrid" role="group" aria-label={t(control.label)}>
                  {control.options.map((option) => {
                    const active = (multiSelections[control.id] ?? []).includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleMulti(control.id, option.value)}
                        className={`qattan-tool-chip ${active ? "qattan-tool-chip-active" : ""}`}
                      >
                        {t(option.label)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="qattan-tool-control">
            <span className="qattan-tool-control-label" id={`presentation-label-${tool.id}`}>
              {L ? "عرض المخرجات" : "Output presentation"}
            </span>
            <div
              className="qattan-output-toggle"
              role="radiogroup"
              aria-labelledby={`presentation-label-${tool.id}`}
            >
              {OUTPUT_PRESENTATIONS.map((option) => {
                const label = OUTPUT_PRESENTATION_LABELS[option];
                const active = presentation === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPresentation(option)}
                    className={`qattan-output-toggle-option ${active ? "qattan-output-toggle-option-active" : ""}`}
                  >
                    {L ? label.ar : label.en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="qattan-tool-control">
            <label className="qattan-tool-control-label" htmlFor={`brief-${tool.id}`}>
              {L ? "وصف التصميم" : "Design brief"}
            </label>
            <textarea
              id={`brief-${tool.id}`}
              aria-label={L ? "وصف التصميم" : "Design brief"}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={L ? `مثال: ${tool.description.ar}` : `e.g. ${tool.description.en}`}
              rows={3}
              className="qattan-tool-textarea"
            />
          </div>

          <button
            type="button"
            onClick={submitGeneration}
            disabled={loading}
            className="qattan-tool-generate"
          >
            {loading ? (
              <>
                <Compass size={18} className="qattan-compass-spin" aria-hidden="true" /> {L ? "جارٍ التوليد…" : "Generating…"}
              </>
            ) : (
              <>
                <Sparkles size={18} aria-hidden="true" /> {L ? "توليد" : "Generate"}
              </>
            )}
          </button>

          {error && (
            <p role="alert" className="qattan-tool-error">
              {error}
            </p>
          )}

          <ToolGuidePanel guide={tool.guide} />
        </div>

        <div className="qattan-tool-panel qattan-tool-panel-canvas">
          <div className="qattan-tool-canvas">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  className="qattan-tool-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  aria-label="Generating"
                >
                  <Compass size={34} className="qattan-compass-spin" aria-hidden="true" />
                  <p>{L ? "نصوغ دراستك المعمارية…" : "Drafting your architectural study…"}</p>
                </motion.div>
              ) : results.length > 0 ? (
                <motion.div
                  key="result"
                  className={`qattan-tool-result ${results.length > 1 ? "qattan-result-gallery" : ""}`}
                  {...resultReveal}
                >
                  {results.map((output, index) => (
                    <figure key={output.slice(0, 48) + index} className="qattan-result-card">
                      <button
                        type="button"
                        className="qattan-result-frame"
                        aria-label={L ? "عرض النتيجة بحجم كامل" : "Zoom result fullscreen"}
                        onClick={() => setZoomIndex(index)}
                      >
                        <img
                          src={output}
                          alt={
                            results.length > 1
                              ? L
                                ? `النتيجة المولدة ${index + 1} من 3 — ${tool.title.ar}`
                                : `Generated variation ${index + 1} of 3 — ${tool.title.en}`
                              : L
                                ? `النتيجة المولدة — ${tool.title.ar}`
                                : `Generated ${tool.title.en} result`
                          }
                          referrerPolicy="no-referrer"
                        />
                        <span className="qattan-result-zoom-hint" aria-hidden="true">
                          <ZoomIn size={14} /> {L ? "عرض كامل" : "View full"}
                        </span>
                      </button>
                      <a
                        className="qattan-tool-download"
                        href={output}
                        download={`qattan-${tool.id}${results.length > 1 ? `-v${index + 1}` : ""}.png`}
                      >
                        <Download size={15} aria-hidden="true" /> {L ? "تنزيل النتيجة" : "Download result"}
                      </a>
                    </figure>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="qattan-tool-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Sparkles size={26} aria-hidden="true" />
                  <p>{L ? "ستظهر النتيجة المولّدة هنا." : "Generated output will appear here."}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      {/* Mobile sticky FAB mirrors the inline generate button. */}
      <button
        type="button"
        onClick={submitGeneration}
        disabled={loading}
        className="qattan-tool-fab fixed bottom-4 left-4 right-4 z-40 lg:hidden"
        aria-label={L ? "توليد" : "Generate"}
      >
        {loading ? (
          <Compass size={20} className="qattan-compass-spin" aria-hidden="true" />
        ) : (
          <Sparkles size={20} aria-hidden="true" />
        )}
        <span>{loading ? (L ? "جارٍ التوليد…" : "Generating…") : L ? "توليد" : "Generate"}</span>
      </button>

      {/* Fullscreen lightbox, portaled to document.body so transformed/filtered
          ancestors (Framer Motion reveals) can never trap position:fixed or
          dilute the z-[9999] stacking — overlays header, rails, FAB, tab bar. */}
      {zoomIndex !== null && results[zoomIndex]
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={L ? "عرض النتيجة بحجم كامل" : "Result fullscreen view"}
              className="qattan-result-zoom fixed inset-0 z-[9999] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-4 md:p-8"
              onClick={() => setZoomIndex(null)}
            >
              <div
                className="qattan-result-zoom-panel"
                style={
                  zoomDragOffset > 0
                    ? { transform: `translateY(${zoomDragOffset}px)`, transition: "none" }
                    : undefined
                }
                onClick={(event) => event.stopPropagation()}
                onTouchStart={onZoomTouchStart}
                onTouchMove={onZoomTouchMove}
                onTouchEnd={onZoomTouchEnd}
              >
                <div className="qattan-result-zoom-bar">
                  <span className="qattan-result-zoom-title">
                    {L
                      ? `${tool.title.ar}${results.length > 1 ? ` — لوحة (${results.length})` : ""}`
                      : `${tool.title.en}${results.length > 1 ? ` — Board (${results.length})` : ""}`}
                  </span>
                  <div className="qattan-result-zoom-actions">
                    <button
                      type="button"
                      className="qattan-result-zoom-download"
                      onClick={downloadResults}
                      aria-label={L ? "تنزيل الصورة" : "Download image"}
                    >
                      <Download size={16} aria-hidden="true" />
                      <span>{L ? "تنزيل" : "Download"}</span>
                    </button>
                    <button
                      type="button"
                      className="qattan-result-zoom-close"
                      aria-label={L ? "إغلاق العرض" : "Close fullscreen view"}
                      onClick={() => setZoomIndex(null)}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {/* Single render → one image; gallery/triptych → the whole
                    board scales together inside the same viewport bounds. */}
                <div
                  className={`qattan-result-zoom-board ${results.length > 1 ? "qattan-result-zoom-board-multi" : ""}`}
                >
                  {results.map((output, index) => (
                    <img
                      key={output.slice(0, 48) + index}
                      src={output}
                      alt={
                        results.length > 1
                          ? L
                            ? `النتيجة المولدة ${index + 1} من ${results.length} — ${tool.title.ar}`
                            : `Generated variation ${index + 1} of ${results.length} — ${tool.title.en}`
                          : L
                            ? `النتيجة المولدة — ${tool.title.ar}`
                            : `Generated ${tool.title.en} result`
                      }
                      referrerPolicy="no-referrer"
                      className="qattan-result-zoom-image"
                    />
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Mandatory auth gate before any AI generation. */}
      <RequireAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        returnTo={`/studio?mode=${tool.id}`}
      />
    </section>
  );
}
