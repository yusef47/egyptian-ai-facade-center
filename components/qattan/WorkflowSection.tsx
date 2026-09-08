import { useQattan } from "./QattanProviders";

export function WorkflowSection() {
  const { copy } = useQattan();
  return (
    <section id="workflow" className="qattan-section qattan-workflow-section">
      <div className="qattan-container">
        <div className="qattan-section-heading">
          <p className="qattan-eyebrow">{copy.workflow.eyebrow}</p>
          <h2>{copy.workflow.title}</h2>
          <p>{copy.workflow.description}</p>
        </div>
        <div className="qattan-workflow-grid">
          {copy.workflow.steps.map((step) => (
            <article className="qattan-workflow-card" key={step.number}>
              <span className="qattan-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
