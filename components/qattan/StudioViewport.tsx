"use client";

import EngineSection from "@/components/EngineSection";
import CadVectorizerSection from "@/components/CadVectorizerSection";
import PlannedModeNotice from "./PlannedModeNotice";
import type { StudioMode } from "./qattan-content";

export type StudioSession = {
  prompt: string;
  status: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
};

type StudioViewportProps = {
  mode: StudioMode;
  onFacadeSessionChange: (session: StudioSession) => void;
  onBackToLive: () => void;
};

export default function StudioViewport({ mode, onFacadeSessionChange, onBackToLive }: StudioViewportProps) {
  if (mode === "facade") {
    return (
      <div className="qattan-studio-viewport qattan-studio-viewport-live">
        <EngineSection onSessionChange={onFacadeSessionChange} />
      </div>
    );
  }

  if (mode === "cad") {
    return (
      <div className="qattan-studio-viewport qattan-studio-viewport-live">
        <CadVectorizerSection />
      </div>
    );
  }

  return (
    <div className="qattan-studio-viewport">
      <PlannedModeNotice mode={mode} onBack={onBackToLive} />
    </div>
  );
}
