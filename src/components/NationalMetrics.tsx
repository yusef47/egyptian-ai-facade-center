const metrics = [
  { value: "15,400+", label: "واجهة مبنى مستهدفة بالتأهيل العمراني", icon: "🏢", accent: "amber" },
  { value: "88.8%", label: "نسبة القضاء على التلوث البصري", icon: "👁️", accent: "blue" },
  { value: "0.82M م²", label: "مساحات تراثية مرممة", icon: "📐", accent: "green" },
  { value: "3.12s", label: "زمن التوليد والترميم بالذكاء الاصطناعي", icon: "⚡", accent: "violet" },
] as const;

export function NationalMetrics() {
  return (
    <section className="metrics-section" id="metrics" dir="rtl" aria-labelledby="metrics-title">
      <div className="section-heading">
        <div>
          <span className="section-overline">01 · المؤشر القومي</span>
          <h2 id="metrics-title">أثرٌ يُقاس، <em>وهويةٌ تُصان</em></h2>
        </div>
        <p>بيانات حية من منظومة التأهيل العمراني المصري.</p>
      </div>
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <article className={`metric-card metric-${metric.accent}`} key={metric.value}>
            <div className="metric-icon" aria-hidden="true">{metric.icon}</div>
            <div className="metric-value">{metric.value}</div>
            <p>{metric.label}</p>
            <span className="metric-line" aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}
