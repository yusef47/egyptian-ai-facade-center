"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Download, ImagePlus, RefreshCw, Sparkles, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { compressImageFile, MAX_DATA_URL_BYTES } from "@/lib/image";
import { restoreFacade } from "@/lib/restore";
import {
  GALLERY_VARIATION_DIRECTIVES,
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

const CREDITS_RE = /credit|balance|quota|402|429/i;

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

  // Download every result (one for single mode, all three for gallery/board).
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
    setLoading(true);
    try {
      let outputs: string[];
      if (presentation === "gallery") {
        // Three independent style variations, generated as three separate cards.
        const settled = await Promise.allSettled(
          GALLERY_VARIATION_DIRECTIVES.map((directive) => runGeneration(directive)),
        );
        outputs = settled
          .filter((entry): entry is PromiseFulfilledResult<string> => entry.status === "fulfilled")
          .map((entry) => entry.value);
        if (outputs.length === 0) {
          const failure = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
          throw failure?.reason ?? new Error(L ? "فشل التوليد. حاول مرة أخرى." : "Generation failed. Please try again.");
        }
      } else {
        const output = await runGeneration(presentation === "triptych" ? TRIPTYCH_DIRECTIVE : undefined);
        outputs = [output];
      }
      setResults(outputs);
      onSessionChange?.({
        prompt: fullPrompt,
        status: L ? "اكتمل التوليد" : "Generation complete",
        inputImageDataUrl: imageDataUrl,
        outputImageDataUrl: outputs[0],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (CREDITS_RE.test(message)) {
        setError(L ? "تحتاج خدمة التوليد إلى رصيد. اشحن حساب OpenRouter للمتابعة." : "The generation service needs credits. Top up the OpenRouter account to continue.");
      } else {
        setError(message || (L ? "فشل التوليد. حاول مرة أخرى." : "Generation failed. Please try again."));
      }
    } finally {
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
    </section>
  );
}
