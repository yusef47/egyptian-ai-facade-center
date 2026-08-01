export function FooterStatus() {
  return (
    <footer className="status-bar" dir="rtl">
      <div className="footer-brand">المركز المصري للذكاء الاصطناعي · V112.1</div>
      <div className="system-status"><span className="status-light" /> الوضع الداكن 🌙 <b>النظام نشط</b></div>
      <div className="system-metrics" dir="ltr">
        <span>API <b>●</b></span>
        <span>LATENCY 3.0s</span>
        <span>SECURE TLS</span>
      </div>
    </footer>
  );
}
