"use client";

import { useState } from "react";
import { I18nProvider } from "@/lib/i18n";
import { QattanHeader } from "./QattanHeader";
import { QattanProviders, useQattan } from "./QattanProviders";
import StudioControlRail from "./StudioControlRail";
import StudioHistoryRail, { type StudioHistoryItem } from "./StudioHistoryRail";
import StudioViewport, { type StudioSession } from "./StudioViewport";
import type { QattanLocale, StudioMode } from "./qattan-content";

const LIVE_MODES: StudioMode[] = ["facade", "cad"];

function isLiveMode(mode: StudioMode): boolean {
  return LIVE_MODES.includes(mode);
}

function QattanStudioContent({ initialMode }: { initialMode: StudioMode }) {
  const { copy } = useQattan();
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [session, setSession] = useState<StudioSession>({
    prompt: "",
    status: "",
    inputImageDataUrl: null,
    outputImageDataUrl: null,
  });
  const [history, setHistory] = useState<StudioHistoryItem[]>([]);

  const handleSessionChange = (nextSession: StudioSession) => {
    setSession(nextSession);
    const outputImageDataUrl = nextSession.outputImageDataUrl;
    if (!outputImageDataUrl) return;
    setHistory((current) => {
      if (current[0]?.imageDataUrl === outputImageDataUrl) return current;
      return [
        {
          id: `${Date.now()}-${current.length}`,
          mode: "facade" as const,
          prompt: nextSession.prompt,
          imageDataUrl: outputImageDataUrl,
        },
        ...current,
      ].slice(0, 8);
    });
  };

  const handleModeChange = (nextMode: StudioMode) => {
    setMode(nextMode);
    if (!isLiveMode(nextMode)) return;
    setSession((current) => ({ ...current, status: "" }));
  };

  return (
    <div className="qattan-page qattan-studio-page">
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

        <section className="qattan-studio-shell qattan-container" aria-label={copy.nav.studio}>
          <div className="qattan-studio-layout">
            <StudioControlRail mode={mode} onModeChange={handleModeChange} />
            <StudioViewport
              mode={mode}
              onFacadeSessionChange={handleSessionChange}
              onBackToLive={() => setMode("facade")}
            />
            <StudioHistoryRail mode={mode} session={session} history={history} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default function QattanStudio({
  locale,
  initialMode = "facade",
}: {
  locale: QattanLocale;
  initialMode?: StudioMode;
}) {
  return (
    <QattanProviders locale={locale}>
      <I18nProvider initialLang={locale}>
        <QattanStudioContent initialMode={initialMode} />
      </I18nProvider>
    </QattanProviders>
  );
}
