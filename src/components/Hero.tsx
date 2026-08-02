export function Hero() {
  return (
    <section className="hero-section" id="home" dir="rtl" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="section-overline">منصة سيادية · الإصدار 113.0</span>
        <h1 id="hero-title">الذكاء الاصطناعي في خدمة العمارة والعمران المصري</h1>
        <p className="hero-subtitle">منصة سيادية لتوليد وترميم واجهات المباني المصرية بدقة 8K</p>
        <p className="hero-description">نحوّل الواجهة الحالية إلى رؤية عمرانية تحفظ الذاكرة المصرية، وتمنح كل مبنى حضوراً جديداً يليق بمكانه وتاريخه.</p>
        <a className="hero-cta" href="#studio">ابدأ الترميم الآن <span aria-hidden="true">🚀</span></a>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="hero-orbit orbit-large" />
        <div className="hero-orbit orbit-small" />
        <div className="hero-emblem">م</div>
        <span className="hero-coordinate coordinate-one">30°02′N</span>
        <span className="hero-coordinate coordinate-two">31°14′E</span>
        <div className="hero-arch arch-back" />
        <div className="hero-arch arch-front" />
      </div>
    </section>
  );
}
