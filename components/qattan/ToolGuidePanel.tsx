"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Info, Lightbulb, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useQattan } from "./QattanProviders";
import type { ToolGuide } from "@tools/registry";

const GUIDE_COPY = {
  en: {
    title: "How This Tool Works",
    input: "Input",
    output: "What you get",
    tip: "Architectural pro-tip",
    hide: "Hide guide",
  },
  ar: {
    title: "كيف تعمل هذه الأداة",
    input: "المدخل المطلوب",
    output: "النتيجة المتوقعة",
    tip: "نصيحة معمارية",
    hide: "إخفاء الشرح",
  },
} as const;

type ToolGuidePanelProps = {
  guide?: ToolGuide;
  defaultOpen?: boolean;
  variant?: "workspace" | "engine";
};

/**
 * Expandable bilingual guide: what to upload, what the engine generates,
 * and a practical architectural tip for best results.
 */
export default function ToolGuidePanel({ guide, defaultOpen = false, variant = "workspace" }: ToolGuidePanelProps) {
  const { locale } = useQattan();
  const [open, setOpen] = useState(defaultOpen);
  const text = GUIDE_COPY[locale];
  if (!guide) return null;
  const body = {
    input: locale === "ar" ? guide.input.ar : guide.input.en,
    output: locale === "ar" ? guide.output.ar : guide.output.en,
    tip: locale === "ar" ? guide.tip.ar : guide.tip.en,
  };

  return (
    <section
      className={`qattan-guide ${variant === "engine" ? "qattan-guide-engine" : ""}`}
      aria-label={text.title}
    >
      <button
        type="button"
        className="qattan-guide-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={15} aria-hidden="true" />
        <span>{open ? text.hide : text.title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          aria-hidden="true"
          style={{ display: "inline-flex" }}
        >
          <ChevronDown size={15} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="guide-body"
            className="qattan-guide-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
          >
            <div className="qattan-guide-item">
              <span className="qattan-guide-icon" aria-hidden="true"><Upload size={14} /></span>
              <div>
                <strong>{text.input}</strong>
                <p>{body.input}</p>
              </div>
            </div>
            <div className="qattan-guide-item">
              <span className="qattan-guide-icon" aria-hidden="true"><Sparkles size={14} /></span>
              <div>
                <strong>{text.output}</strong>
                <p>{body.output}</p>
              </div>
            </div>
            <div className="qattan-guide-item qattan-guide-item-tip">
              <span className="qattan-guide-icon" aria-hidden="true"><Lightbulb size={14} /></span>
              <div>
                <strong>{text.tip}</strong>
                <p>{body.tip}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
