"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, History, ShieldCheck } from "lucide-react";
import type { ToolId } from "@tools/registry";
import { useQattan } from "./QattanProviders";
import type { StudioSession } from "./StudioViewport";

export type StudioHistoryItem = {
  id: string;
  mode: ToolId | "facade";
  toolTitle: string;
  prompt: string;
  imageDataUrl: string;
};

type StudioHistoryRailProps = {
  activeToolTitle: string;
  session: StudioSession;
  history: StudioHistoryItem[];
};

export default function StudioHistoryRail({ activeToolTitle, session, history }: StudioHistoryRailProps) {
  const { copy } = useQattan();

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
        <strong>{activeToolTitle}</strong>
        {session.outputImageDataUrl ? <span>{copy.studio.session}</span> : null}
      </div>

      <div className="qattan-history-list">
        {history.length > 0 ? (
          <AnimatePresence initial={false}>
            {history.map((item) => (
              <motion.article
                key={item.id}
                className="qattan-history-item"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              >
                <img src={item.imageDataUrl} alt="" />
                <div>
                  <strong>{item.toolTitle}</strong>
                  <span>{item.prompt || copy.studio.result}</span>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        ) : (
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
