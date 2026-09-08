"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Download, ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { compressImageFile, MAX_DATA_URL_BYTES } from "@/lib/image";
import { restoreFacade } from "@/lib/restore";
import { buildToolPrompt, type QattanTool, type ToolControlId, type ToolControlValues } from "@tools/registry";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [values, setValues] = useState<ToolControlValues>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
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
        setError("The image is too large. Try a smaller photo.");
        return;
      }
      setImageDataUrl(compressed);
      setResult(null);
      onSessionChange?.({
        prompt,
        status: "Image uploaded",
        inputImageDataUrl: compressed,
        outputImageDataUrl: null,
      });
    } catch {
      setError("Upload failed. Please try again.");
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
      setError("Please upload an image first.");
      return;
    }
    const basePrompt = prompt.trim();
    if (basePrompt.length < 3) {
      setError("Please describe the design direction you want.");
      return;
    }

    const promptValues: ToolControlValues = { ...values };
    for (const control of tool.controls) {
      if (control.type === "multi") {
        promptValues[control.id] = multiSelections[control.id] ?? [control.options[0]?.value ?? ""];
      }
    }
    const finalPrompt = `${buildToolPrompt(tool.id, promptValues)} Additional direction: ${basePrompt}`;

    setError(null);
    setLoading(true);
    try {
      const output = await restoreFacade({ imageDataUrl, prompt: finalPrompt, toolId: tool.id });
      setResult(output);
      onSessionChange?.({
        prompt: finalPrompt,
        status: "Generation complete",
        inputImageDataUrl: imageDataUrl,
        outputImageDataUrl: output,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (CREDITS_RE.test(message)) {
        setError("The generation service needs credits. Top up the OpenRouter account to continue.");
      } else {
        setError(message || "Generation failed. Please try again.");
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
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`qattan-tool-upload ${dragging ? "qattan-tool-upload-dragging" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label={tool.uploadLabel.en}
              className="sr-only"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            {imageDataUrl ? (
              <>
                <img src={imageDataUrl} alt={tool.uploadLabel.en} className="qattan-tool-upload-preview" />
                <span className="qattan-tool-upload-replace">
                  <RefreshCw size={14} aria-hidden="true" /> Replace image
                </span>
              </>
            ) : (
              <>
                <ImagePlus size={30} aria-hidden="true" />
                <span className="qattan-tool-upload-hint">{tool.uploadLabel.en}</span>
                <span className="qattan-tool-upload-sub">Drag &amp; drop or click to browse · JPG/PNG</span>
              </>
            )}
          </div>

          {tool.controls.map((control) => (
            <div key={control.id} className="qattan-tool-control">
              <label className="qattan-tool-control-label" htmlFor={`control-${control.id}`}>
                {control.label.en}
              </label>
              {control.type === "select" ? (
                <select
                  id={`control-${control.id}`}
                  aria-label={control.label.en}
                  value={(values[control.id] as string) ?? control.options[0]?.value ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [control.id]: event.target.value }))
                  }
                  className="qattan-tool-select"
                >
                  {control.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label.en}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="qattan-tool-multigrid" role="group" aria-label={control.label.en}>
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
                        {option.label.en}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="qattan-tool-control">
            <label className="qattan-tool-control-label" htmlFor={`brief-${tool.id}`}>
              Design brief
            </label>
            <textarea
              id={`brief-${tool.id}`}
              aria-label="Design brief"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`e.g. ${tool.description.en}`}
              rows={3}
              className="qattan-tool-textarea"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="qattan-tool-generate"
          >
            {loading ? (
              <>
                <Compass size={18} className="qattan-compass-spin" aria-hidden="true" /> Generating…
              </>
            ) : (
              <>
                <Sparkles size={18} aria-hidden="true" /> Generate
              </>
            )}
          </button>

          {error && (
            <p role="alert" className="qattan-tool-error">
              {error}
            </p>
          )}
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
                  <p>Drafting your architectural study…</p>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="result"
                  className="qattan-tool-result"
                  {...resultReveal}
                >
                  <img src={result} alt={`Generated ${tool.title.en} result`} referrerPolicy="no-referrer" />
                  <a
                    className="qattan-tool-download"
                    href={result}
                    download={`qattan-${tool.id}.png`}
                  >
                    <Download size={15} aria-hidden="true" /> Download result
                  </a>
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
                  <p>Generated output will appear here.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
