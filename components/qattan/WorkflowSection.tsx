import { motion } from "framer-motion";
import { Reveal } from "./Reveal";
import { useQattan } from "./QattanProviders";

export function WorkflowSection() {
  const { copy } = useQattan();
  return (
    <section id="workflow" className="qattan-section qattan-workflow-section">
      <div className="qattan-container">
        <Reveal className="qattan-section-heading">
          <p className="qattan-eyebrow">{copy.workflow.eyebrow}</p>
          <h2>{copy.workflow.title}</h2>
          <p>{copy.workflow.description}</p>
        </Reveal>
        <div className="qattan-workflow-grid">
          {copy.workflow.steps.map((step, index) => (
            <motion.article
              className="qattan-workflow-card"
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: index * 0.12, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="qattan-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
