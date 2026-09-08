import { ArrowUpRight, Building2, Check, Compass, Landmark, Layers, Map, Quote, TreePalm, Wand2 } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TiltCard } from "./TiltCard";
import { useQattan } from "./QattanProviders";
import type { ToolId } from "@tools/registry";

const TOOL_ICONS: Record<ToolId, typeof Compass> = {
  exterior: Landmark,
  interior: Building2,
  sketch: Quote,
  masterplan: Map,
  landscape: TreePalm,
  staging: Layers,
  enhancer: Wand2,
  floorplan: Compass,
};

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
          {copy.tools.items.map((tool, index) => {
            const Icon = TOOL_ICONS[tool.id as ToolId] ?? Compass;
            return (
              <TiltCard key={tool.id} maxTilt={8}>
                <motion.article
                  className="qattan-tool-card"
                  initial={{ opacity: 0, y: 30, scale: 0.92 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ type: "spring", stiffness: 100, damping: 15, delay: (index % 3) * 0.08 }}
                  whileHover={{ y: -6 }}
                >
                <div className="qattan-tool-card-top">
                  <span className="qattan-status qattan-status-live">
                    <Check size={12} />
                    {copy.tools.live}
                  </span>
                  <span className="qattan-tool-index">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="qattan-tool-thumb" aria-hidden="true">
                  <Icon size={26} strokeWidth={1.6} />
                </div>                <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                  <Link className="qattan-tool-link" href={tool.href}>{copy.tools.open}<ArrowUpRight size={14} /></Link>
                </motion.article>
              </TiltCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
