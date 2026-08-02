type HeaderProps = {
  onSearch: (value: string) => void;
};

export function Header({ onSearch }: HeaderProps) {
  return (
    <header className="site-header" dir="rtl">
      <a className="official-brand" href="#home" aria-label="المركز المصري للذكاء الاصطناعي في العمارة والعمران">
        <span className="syndicate-mark" aria-hidden="true"><span>م</span></span>
        <span className="flag-badge" aria-label="مصر">🇪🇬</span>
        <span className="brand-copy">
          <strong>نقابة المهندسين المصرية</strong>
          <span>المركز المصري للذكاء الاصطناعي في العمارة والعمران</span>
        </span>
      </a>
      <nav className="primary-nav" aria-label="التنقل الرئيسي">
        <a className="active" href="#home">الرئيسية</a>
        <a href="#metrics">الإحصائيات القومية</a>
        <a href="#studio">استوديو الترميم</a>
        <a href="#report">تصدير تقرير النقابة</a>
      </nav>
      <div className="header-tools" dir="ltr">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input aria-label="البحث" placeholder="البحث" onChange={(event) => onSearch(event.target.value)} />
        </label>
        <button className="header-icon" type="button" aria-label="الإشعارات">◌<span className="notification-dot" /></button>
        <button className="avatar-button" type="button" aria-label="حسابي">م</button>
      </div>
    </header>
  );
}
