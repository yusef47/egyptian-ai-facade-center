"use client";

import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { useQattan } from "./QattanProviders";
import type { StudioMode } from "./qattan-content";

type PlannedModeNoticeProps = {
  mode: StudioMode;
  onBack: () => void;
};

export default function PlannedModeNotice({ mode, onBack }: PlannedModeNoticeProps) {
  const { copy, locale } = useQattan();
  const tool = copy.tools.items.find((item) => item.id === mode);
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="qattan-planned-notice" role="status">
      <span className="qattan-planned-icon" aria-hidden="true"><Clock3 size={22} /></span>
      <p className="qattan-eyebrow">{copy.studio.planned}</p>
      <h2>{tool?.title ?? mode}</h2>
      <p className="qattan-planned-description">
        {tool?.description}
      </p>
      <button type="button" className="qattan-button qattan-button-secondary" onClick={onBack}>
        <BackIcon size={16} aria-hidden="true" />
        {copy.studio.back}
      </button>
    </div>
  );
}
