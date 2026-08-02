import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function CTASection() {
  const { t } = useI18n();

  return (
    <section className="py-20 bg-navy-light/30">
      <div className="container text-center">
        <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
          {t("cta.title")}
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
          {t("cta.desc")}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="#studio"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gold/40 text-gold font-medium rounded hover:bg-gold/10 transition-all duration-200"
          >
            {t("cta.secondary")}
          </a>
          <a
            href="#studio"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gold text-navy font-medium rounded hover:bg-gold-light transition-all duration-200 active:scale-[0.97]"
          >
            {t("cta.primary")} <ArrowRight size={16} className="rtl:rotate-180" />
          </a>
        </div>
      </div>
    </section>
  );
}
