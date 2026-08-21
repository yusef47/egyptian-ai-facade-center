import { useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import EngineSection from "@/components/EngineSection";
import CadVectorizerSection from "@/components/CadVectorizerSection";
import type { StudioMode } from "@/lib/studio";
import SyndicateReport from "@/components/SyndicateReport";
import { downloadSyndicateReport } from "@/lib/report";

type Session = {
  prompt: string;
  status: string;
  inputImageDataUrl: string | null;
  outputImageDataUrl: string | null;
};

const initialSession: Session = {
  prompt: "",
  status: "Ready for a facade image and architectural brief.",
  inputImageDataUrl: null,
  outputImageDataUrl: null,
};

export default function Home() {
  const [session, setSession] = useState<Session>(initialSession);
  const [activeStudio, setActiveStudio] = useState<StudioMode>("facade");
  const [createdAt] = useState(() => new Date().toISOString());

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <Navbar activeStudio={activeStudio} onStudioChange={setActiveStudio} />
      <main>
        {activeStudio === "facade" ? (
          <div id="facade-studio-panel" role="tabpanel" aria-labelledby="facade-studio-tab">
            <HeroSection />
            <EngineSection onSessionChange={setSession} />
            <SyndicateReport
              {...session}
              onDownload={() => {
                downloadSyndicateReport({ ...session, createdAt });
              }}
            />
          </div>
        ) : (
          <CadVectorizerSection />
        )}
      </main>
    </div>
  );
}
