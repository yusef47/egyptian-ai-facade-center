import Link from "next/link";
import { useQattan } from "./QattanProviders";

export function QattanFooter() {
  const { locale, copy } = useQattan();
  return (
    <footer className="qattan-footer">
      <div className="qattan-container qattan-footer-grid">
        <div className="qattan-footer-brand"><Link className="qattan-brand" href={locale === "ar" ? "/ar" : "/en"}><span className="qattan-brand-mark" aria-hidden="true">Q</span><span>{copy.brand}</span></Link><p>{copy.footer.description}</p></div>
        <div><h3>{copy.footer.product}</h3><Link href="/studio">{copy.nav.studio}</Link><a href="#tools">{copy.tools.title}</a><a href="#pricing">{copy.nav.pricing}</a></div>
        <div><h3>{copy.footer.resources}</h3><a href="#workflow">{copy.workflow.title}</a><a href="#faq">{copy.faq.title}</a><Link href="/studio?mode=cad">{copy.studio.cad}</Link></div>
        <div><h3>{copy.footer.legal}</h3><Link href={locale === "ar" ? "/ar/privacy" : "/privacy"}>{locale === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link><Link href={locale === "ar" ? "/ar/terms" : "/terms"}>{locale === "ar" ? "شروط الاستخدام" : "Terms of Service"}</Link><span>{copy.footer.disclaimer}</span></div>
      </div>
      <div className="qattan-container qattan-footer-bottom"><span>{copy.footer.rights}</span><span>Qattan AI / قطان AI</span></div>
    </footer>
  );
}
