"use client";

import { Check, Clock3, SlidersHorizontal } from "lucide-react";
import { useQattan } from "./QattanProviders";
import type { StudioMode } from "./qattan-content";

type StudioControlRailProps = {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
};

export default function StudioControlRail({ mode, onModeChange }: StudioControlRailProps) {
  const { copy } = useQattan();

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
        {copy.tools.items.map((tool) => {
          const live = tool.status === "live";
          const selected = tool.id === mode;
          return (
            <button
              type="button"
              key={tool.id}
              className={`qattan-studio-mode ${selected ? "qattan-studio-mode-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onModeChange(tool.id)}
            >
              <span className="qattan-studio-mode-copy">
                <span className="qattan-studio-mode-title">{tool.title}</span>
                <span className={`qattan-status ${live ? "qattan-status-live" : "qattan-status-planned"}`}>
                  {live ? <Check size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}
                  {live ? copy.studio.live : copy.studio.planned}
                </span>
              </span>
              <span className="qattan-studio-mode-index" aria-hidden="true">{String(copy.tools.items.indexOf(tool) + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
