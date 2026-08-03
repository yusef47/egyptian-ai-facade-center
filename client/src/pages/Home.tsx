import { useState } from "react";
import Navbar from "@/components/Navbar";
import EngineSection from "@/components/EngineSection";
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
  const [createdAt] = useState(() => new Date().toISOString());

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <EngineSection onSessionChange={setSession} />
        <SyndicateReport
          {...session}
          onDownload={() => {
            downloadSyndicateReport({ ...session, createdAt });
          }}
        />
      </main>
    </div>
  );
}
