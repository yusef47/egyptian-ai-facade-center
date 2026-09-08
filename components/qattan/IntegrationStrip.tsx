import { useQattan } from "./QattanProviders";

export function IntegrationStrip() {
  const { copy } = useQattan();
  return (
    <section className="qattan-integration-section">
      <div className="qattan-container">
        <p className="qattan-eyebrow">{copy.integrations.eyebrow}</p>
        <div className="qattan-integration-heading"><h2>{copy.integrations.title}</h2><p>{copy.integrations.description}</p></div>
        <div className="qattan-integration-list" aria-label={copy.integrations.title}>
          {copy.integrations.items.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>
  );
}
