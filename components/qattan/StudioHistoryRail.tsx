"use client";

import { Download, History, ShieldCheck } from "lucide-react";
import { useQattan } from "./QattanProviders";
import type { StudioMode } from "./qattan-content";
import type { StudioSession } from "./StudioViewport";

export type StudioHistoryItem = {
  id: string;
  mode: StudioMode;
  prompt: string;
  imageDataUrl: string;
};

type StudioHistoryRailProps = {
  mode: StudioMode;
  session: StudioSession;
  history: StudioHistoryItem[];
};

export default function StudioHistoryRail({ mode, session, history }: StudioHistoryRailProps) {
  const { copy } = useQattan();
  const activeTool = copy.tools.items.find((item) => item.id === mode);

  return (
    <aside className="qattan-studio-rail qattan-studio-history-rail" aria-label={copy.studio.session}>
      <div className="qattan-studio-rail-heading">
        <span className="qattan-studio-rail-icon" aria-hidden="true"><History size={17} /></span>
        <div>
          <p className="qattan-eyebrow">{copy.studio.session}</p>
          <h2>{copy.studio.history}</h2>
        </div>
      </div>

      <div className="qattan-studio-engine-meta">
        <span className="qattan-studio-meta-label">{copy.studio.active}</span>
        <strong>{activeTool?.title ?? mode}</strong>
        <span>{copy.studio.model}</span>
      </div>

      <div className="qattan-history-list">
        {history.length > 0 ? history.map((item) => (
          <article key={item.id} className="qattan-history-item">
            <img src={item.imageDataUrl} alt="" />
            <div>
              <strong>{copy.studio.facade}</strong>
              <span>{item.prompt || copy.studio.result}</span>
            </div>
          </article>
        )) : (
          <p className="qattan-history-empty">{copy.studio.empty}</p>
        )}
      </div>

      <div className="qattan-studio-disclaimer">
        <ShieldCheck size={16} aria-hidden="true" />
        <p>{copy.studio.disclaimer}</p>
      </div>

      {session.outputImageDataUrl && (
        <a className="qattan-button qattan-button-secondary qattan-history-download" href={session.outputImageDataUrl} download="qattan-session-output.png">
          <Download size={15} aria-hidden="true" />
          {copy.studio.downloadPreview}
        </a>
      )}
    </aside>
  );
}
