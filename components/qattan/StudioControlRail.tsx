"use client";

import { motion } from "framer-motion";
import { Check, SlidersHorizontal } from "lucide-react";
import { useQattan } from "./QattanProviders";
import { QATTAN_TOOLS } from "@tools/registry";
import type { ToolId } from "@tools/registry";

type StudioControlRailProps = {
  mode: ToolId;
  onModeChange: (mode: ToolId) => void;
};

export default function StudioControlRail({ mode, onModeChange }: StudioControlRailProps) {
  const { copy, locale } = useQattan();

  return (
    <aside className="qattan-studio-rail qattan-studio-control-rail" aria-label={copy.nav.tools}>
      <div className="qattan-studio-rail-heading">
        <span className="qattan-studio-rail-icon" aria-hidden="true"><SlidersHorizontal size={17} /></span>
        <div>
          <p className="qattan-eyebrow">{copy.studio.eyebrow}</p>
          <h2>{copy.nav.tools}</h2>
        </div>
      </div>
      <div className="qattan-studio-mode-list" role="list">
        {QATTAN_TOOLS.map((tool, index) => {
          const selected = tool.id === mode;
          const title = locale === "ar" ? tool.title.ar : tool.title.en;
          return (
            <button
              type="button"
              key={tool.id}
              className={`qattan-studio-mode ${selected ? "qattan-studio-mode-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onModeChange(tool.id)}
            >
              {selected && (
                <motion.span
                  layoutId="qattan-studio-mode-highlight"
                  className="qattan-studio-mode-highlight"
                  aria-hidden="true"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="qattan-studio-mode-copy">
                <span className="qattan-studio-mode-title">{title}</span>
                <span className="qattan-status qattan-status-live">
                  <Check size={11} aria-hidden="true" />
                  {copy.studio.live}
                </span>
              </span>
              <span className="qattan-studio-mode-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
