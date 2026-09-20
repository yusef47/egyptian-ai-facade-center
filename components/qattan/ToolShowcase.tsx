import { ArrowUpRight, Check, Compass, Play } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TiltCard } from "./TiltCard";
import { useQattan } from "./QattanProviders";
import { qattanLocaleHref } from "./QattanProviders";
import { TOOL_ICONS } from "./toolIcons";
import ToolPreviewModal from "./ToolPreviewModal";
import type { ToolId } from "@tools/registry";

/**
 * Per-tool preview showcase. Every tool highlights its signature cinematic
 * clip full-frame — no split-view states. Tools without a clip (Floorplan)
 * present a single full-frame output image instead.
 */
export const TOOL_PREVIEWS: Record<
  ToolId,
  { video: string; poster: string; after?: string }
> = {
  // 1 Exterior: cinematic dusk transformation of the luxury villa facade.
  exterior: { video: "/videos/tool-exterior.mp4", poster: "/poster-exterior.jpg" },
  // 2 Interior: ultra-modern penthouse walkthrough pan.
  interior: { video: "/videos/tool-interior.mp4", poster: "/poster-interior.jpg" },
  // 3 Sketch: hand drawing morphing into the photorealistic building.
  sketch: { video: "/videos/tool-sketch.mp4", poster: "/poster-sketch.jpg" },
  // 4 Masterplan: photorealistic aerial 3D drone flyover.
  masterplan: { video: "/videos/tool-masterplan.mp4", poster: "/poster-masterplan.jpg" },
  // 5 Landscape: golden-hour infinity pool & resort garden sweep.
  landscape: { video: "/videos/tool-landscape.mp4", poster: "/poster-landscape.jpg" },
  // 6 Staging: empty room morphing into virtual luxury furniture placement.
  staging: { video: "/videos/tool-staging.mp4", poster: "/poster-staging.jpg" },
  // 7 Enhancer: draft texture resolving into 8K photorealism.
  enhancer: { video: "/videos/tool-enhancer.mp4", poster: "/poster-enhancer.jpg" },
  // 8 Floorplan: colour plan → technical CAD vector sheet (full-frame image).
  floorplan: { video: "", poster: "/preview-floorplan-after.jpg", after: "/preview-floorplan-after.jpg" },
};

export function ToolShowcase() {
  const { copy, locale } = useQattan();
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
            const toolHref = qattanLocaleHref(locale, tool.href);
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
                </div>
                <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                  <ul className="qattan-tool-features">
                    {(tool as { features?: string[] }).features?.map((feature) => (
                      <li key={feature}>
                        <Check size={12} aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <ToolPreviewModal
                    title={tool.title}
                    description={tool.description}
                    poster={TOOL_PREVIEWS[tool.id as ToolId]?.poster ?? "/poster-exterior.jpg"}
                    videoSrc={TOOL_PREVIEWS[tool.id as ToolId]?.video || undefined}
                    afterSrc={TOOL_PREVIEWS[tool.id as ToolId]?.after}
                  >
                    <span className="qattan-preview-chip">
                      <Play size={13} aria-hidden="true" /> {copy.tools.preview}
                    </span>
                  </ToolPreviewModal>
                  <Link className="qattan-tool-link" href={toolHref}>{copy.tools.open}<ArrowUpRight size={14} /></Link>
                </motion.article>
              </TiltCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
