"use client";

import { motion } from "framer-motion";
import { Check, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQattan } from "./QattanProviders";
import { TOOL_ICONS } from "./toolIcons";
import { QATTAN_TOOLS } from "@tools/registry";
import type { ToolId } from "@tools/registry";

type StudioControlRailProps = {
  mode: ToolId;
  onModeChange: (mode: ToolId) => void;
  onFacadeSelect: () => void;
  facadeSelected: boolean;
  facadeTitle: string;
};

export default function StudioControlRail({
  mode,
  onModeChange,
  onFacadeSelect,
  facadeSelected,
  facadeTitle,
}: StudioControlRailProps) {
  const { copy, locale } = useQattan();
  const railListRef = useRef<HTMLDivElement>(null);

  // On phones the rail is a horizontal pill bar: keep the active pill in
  // view whenever the selection changes (swipe or tap).
  useEffect(() => {
    const rail = railListRef.current;
    if (!rail) return;
    const selected = rail.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!selected || typeof selected.scrollIntoView !== "function") return;
    try {
      selected.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    } catch {
      /* Older browsers without options support — safe to skip. */
    }
  }, [mode, facadeSelected]);

  return (
    <aside className="qattan-studio-rail qattan-studio-control-rail" aria-label={copy.nav.tools}>
      <div className="qattan-studio-rail-heading">
        <span className="qattan-studio-rail-icon" aria-hidden="true"><SlidersHorizontal size={17} /></span>
        <div>
          <p className="qattan-eyebrow">{copy.studio.eyebrow}</p>
          <h2>{copy.nav.tools}</h2>
        </div>
      </div>
      <div
        ref={railListRef}
        className="qattan-studio-mode-list qattan-studio-mode-rail"
        role="list"
      >
        {QATTAN_TOOLS.map((tool, index) => {
          const selected = tool.id === mode;
          const title = locale === "ar" ? tool.title.ar : tool.title.en;
          const Icon = TOOL_ICONS[tool.id];
          return (
            <button
              type="button"
              key={tool.id}
              className={`qattan-studio-mode qattan-studio-mode-pill ${selected ? "qattan-studio-mode-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onModeChange(tool.id)}
            >
              {selected && (
                <motion.span
                  layoutId="activeToolIndicator"
                  className="qattan-studio-mode-highlight"
                  aria-hidden="true"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="qattan-studio-mode-icon" aria-hidden="true">
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <span className="qattan-studio-mode-copy">
                <span className="qattan-studio-mode-title">{title}</span>
                <span className="qattan-status qattan-status-live">
                  <Check size={11} aria-hidden="true" />
                  {copy.studio.live}
                </span>
              </span>
              <span className="qattan-studio-mode-index" aria-label={`Tool ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`qattan-studio-mode qattan-studio-mode-pill ${facadeSelected ? "qattan-studio-mode-selected" : ""}`}
          aria-pressed={facadeSelected}
          onClick={onFacadeSelect}
        >
          {facadeSelected && (
            <motion.span
              layoutId="activeToolIndicator"
              className="qattan-studio-mode-highlight"
              aria-hidden="true"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="qattan-studio-mode-icon" aria-hidden="true">
            <Sparkles size={17} strokeWidth={1.8} />
          </span>
          <span className="qattan-studio-mode-copy">
            <span className="qattan-studio-mode-title">{facadeTitle}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
