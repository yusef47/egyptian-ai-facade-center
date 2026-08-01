export function Header() {
  return (
    <header className="site-header glass-panel" dir="rtl" role="banner" aria-label="الهوية الرسمية">
      <a className="brand-lockup" href="#top" aria-label="المركز المصري للذكاء الاصطناعي في العمارة والعمران">
        <span className="brand-emblem" aria-hidden="true"><span>م</span></span>
        <span>
          <strong className="brand-arabic">المركز المصري للذكاء الاصطناعي في العمارة والعمران</strong>
          <small className="brand-english">EGYPTIAN CENTER FOR ARTIFICIAL INTELLIGENCE IN ARCHITECTURE &amp; URBANISM</small>
        </span>
      </a>
      <nav className="primary-nav" aria-label="التنقل الرئيسي">
        <a className="active" href="#top">الرئيسية</a>
        <a href="#studio">الاستوديو</a>
        <a href="#gallery">روائع التراث</a>
        <a href="#studio">منصتنا</a>
      </nav>
      <div className="header-tools">
        <span className="header-status"><i /> النظام نشط</span>
        <button className="avatar-button" aria-label="حسابي">م</button>
      </div>
    </header>
  );
}
