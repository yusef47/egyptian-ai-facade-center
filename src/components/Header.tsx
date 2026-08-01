export function Header() {
  return (
    <header className="site-header glass-panel" dir="rtl">
      <div className="brand-lockup">
        <div className="brand-emblem" aria-hidden="true">
          <span>م</span>
        </div>
        <div>
          <p className="brand-arabic">
            المركز المصري للذكاء الاصطناعي في العمارة والعمران
          </p>
          <p className="brand-english">
            EGYPTIAN CENTER FOR ARTIFICIAL INTELLIGENCE IN ARCHITECTURE &amp; URBANISM
          </p>
        </div>
      </div>

      <nav className="primary-nav" aria-label="التنقل الرئيسي">
        <a className="active" href="#workspace">الرئيسية</a>
        <a href="#workspace">مشروعاتنا</a>
        <a href="#workspace">تحليلات الذكاء الاصطناعي</a>
        <a href="#workspace">منصتنا</a>
        <a href="#workspace">حسابي</a>
      </nav>

      <div className="header-tools" dir="ltr">
        <button className="icon-button notification-button" aria-label="الإشعارات">
          ♧
          <span className="notification-dot" />
        </button>
        <button className="avatar-button" aria-label="حسابي">م</button>
      </div>
    </header>
  );
}
