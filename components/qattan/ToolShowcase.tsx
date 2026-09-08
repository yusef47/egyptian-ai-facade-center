import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import Link from "next/link";
import { useQattan } from "./QattanProviders";

export function ToolShowcase() {
  const { copy } = useQattan();
  return (
    <section id="tools" className="qattan-section qattan-tools-section">
      <div className="qattan-container">
        <div className="qattan-section-heading qattan-section-heading-centered">
          <p className="qattan-eyebrow">{copy.tools.eyebrow}</p>
          <h2>{copy.tools.title}</h2>
          <p>{copy.tools.description}</p>
        </div>
        <div className="qattan-tool-grid">
          {copy.tools.items.map((tool) => {
            const live = tool.status === "live";
            return (
              <article className={`qattan-tool-card ${live ? "qattan-tool-card-live" : ""}`} key={tool.id}>
                <div className="qattan-tool-card-top">
                  <span className={`qattan-status ${live ? "qattan-status-live" : "qattan-status-planned"}`}>
                    {live ? <Check size={12} /> : <Clock3 size={12} />}
                    {live ? copy.tools.live : copy.tools.planned}
                  </span>
                  <span className="qattan-tool-index">{String(copy.tools.items.indexOf(tool) + 1).padStart(2, "0")}</span>
                </div>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <Link className="qattan-tool-link" href={tool.href}>{copy.tools.open}<ArrowUpRight size={14} /></Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
