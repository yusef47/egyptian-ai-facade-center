"use client";

import EngineSection from "@/components/EngineSection";
import CadVectorizerSection from "@/components/CadVectorizerSection";
import ToolWorkspace from "./ToolWorkspace";
import type { QattanTool, ToolId } from "@tools/registry";

export type StudioSession = {
  prompt: string;
  status: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
};

type StudioViewportProps = {
  mode: ToolId | "facade";
  tool: QattanTool | undefined;
  onSessionChange: (session: StudioSession) => void;
};

export default function StudioViewport({ mode, tool, onSessionChange }: StudioViewportProps) {
  if (mode === "facade") {
    return (
      <div className="qattan-studio-viewport qattan-studio-viewport-live">
        <EngineSection onSessionChange={onSessionChange} />
      </div>
    );
  }

  if (mode === "floorplan") {
    return (
      <div className="qattan-studio-viewport qattan-studio-viewport-live">
        <CadVectorizerSection />
      </div>
    );
  }

  if (!tool) return null;

  return (
    <div className="qattan-studio-viewport">
      <ToolWorkspace tool={tool} onSessionChange={onSessionChange} />
    </div>
  );
}
