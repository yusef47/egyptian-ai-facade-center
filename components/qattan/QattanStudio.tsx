"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { I18nProvider } from "@/lib/i18n";
import {
  getToolById,
  resolveStudioMode,
  type QattanTool,
  type ToolId,
} from "@tools/registry";
import { QattanHeader } from "./QattanHeader";
import { QattanProviders, useQattan } from "./QattanProviders";
import StudioControlRail from "./StudioControlRail";
import StudioHistoryRail, { type StudioHistoryItem } from "./StudioHistoryRail";
import StudioViewport, { type StudioSession } from "./StudioViewport";
import type { QattanLocale, StudioMode } from "./qattan-content";

/** Any legacy studio mode plus the unified registry tool ids. */
export type StudioModeInput = StudioMode | ToolId;

/**
 * Re-exported from the pure registry module so existing imports keep
 * working; the implementation must stay server-safe (no React or
 * browser-only dependencies).
 */
export { resolveStudioMode } from "@tools/registry";

const viewportReveal = {
  initial: { opacity: 0, scale: 0.98, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
  },
};

function QattanStudioContent({ initialMode }: { initialMode: StudioModeInput }) {
  const { copy, locale, direction } = useQattan();
  const [mode, setMode] = useState<ToolId | "facade">(resolveStudioMode(initialMode));
  const [session, setSession] = useState<StudioSession>({
    prompt: "",
    status: "",
    inputImageDataUrl: null,
    outputImageDataUrl: null,
  });
  const [history, setHistory] = useState<StudioHistoryItem[]>([]);

  const activeTool: QattanTool | undefined = mode === "facade" ? undefined : getToolById(mode);
  const activeToolTitle =
    mode === "facade"
      ? copy.studio.facade
      : locale === "ar"
        ? activeTool?.title.ar ?? mode
        : activeTool?.title.en ?? mode;

  const handleSessionChange = useCallback(
    (nextSession: StudioSession) => {
      setSession(nextSession);
      const outputImageDataUrl = nextSession.outputImageDataUrl;
      if (!outputImageDataUrl) return;
      setHistory((current: StudioHistoryItem[]) => {
        if (current[0]?.imageDataUrl === outputImageDataUrl) return current;
        return [
          {
            id: `${Date.now()}-${current.length}`,
            mode: mode === "facade" ? ("facade" as const) : mode,
            toolTitle: activeToolTitle,
            prompt: nextSession.prompt,
            imageDataUrl: outputImageDataUrl,
          },
          ...current,
        ].slice(0, 8);
      });
    },
    [mode, activeToolTitle],
  );

  const handleModeChange = useCallback((nextMode: ToolId) => {
    setMode(nextMode);
    setSession((current) => ({ ...current, status: "" }));
  }, []);

  // The legacy facade triptych keeps a pill in the mobile tool rail.
  const handleFacadeSelect = useCallback(() => {
    setMode("facade");
    setSession((current) => ({ ...current, status: "" }));
  }, []);

  return (
    <div className="qattan-page qattan-studio-page" dir={direction} lang={locale}>
      <QattanHeader />
      <main>
        <section className="qattan-studio-intro">
          <div className="qattan-container qattan-studio-intro-inner">
            <div>
              <p className="qattan-eyebrow">{copy.studio.eyebrow}</p>
              <h1>{copy.studio.title}</h1>
              <p>{copy.studio.description}</p>
            </div>
            <div className="qattan-studio-intro-badge">
              <span className="qattan-studio-live-dot" aria-hidden="true" />
              <span>{copy.studio.model}</span>
            </div>
          </div>
        </section>

        <motion.section
          className="qattan-studio-shell qattan-studio-container"
          aria-label={copy.nav.studio}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className={`qattan-studio-layout ${mode === "facade" ? "qattan-studio-layout-facade" : ""}`}>
            <StudioControlRail
              mode={mode === "facade" ? "exterior" : mode}
              onModeChange={handleModeChange}
              onFacadeSelect={handleFacadeSelect}
              facadeSelected={mode === "facade"}
              facadeTitle={copy.studio.facade}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} className="qattan-studio-viewport-slot" {...viewportReveal}>
                <StudioViewport
                  mode={mode}
                  tool={activeTool}
                  onSessionChange={handleSessionChange}
                />
              </motion.div>
            </AnimatePresence>
            <StudioHistoryRail activeToolTitle={activeToolTitle} session={session} history={history} />
          </div>
        </motion.section>
      </main>
    </div>
  );
}

export default function QattanStudio({
  locale,
  initialMode = "exterior",
}: {
  locale: QattanLocale;
  initialMode?: StudioModeInput;
}) {
  return (
    <QattanProviders locale={locale}>
      <I18nProvider initialLang={locale}>
        <QattanStudioContent initialMode={initialMode} />
      </I18nProvider>
    </QattanProviders>
  );
}
