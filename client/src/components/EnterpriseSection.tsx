import { ArrowRight } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";

type Item = { title: string; description: string };

const AUDIENCES: Record<Lang, Item[]> = {
  en: [
    { title: "Ministries", description: "Policy, strategy, heritage program evaluation and national initiatives." },
    { title: "Municipalities", description: "Local plans, urban design briefs and public realm strategies." },
    { title: "Development Authorities", description: "District frameworks, phasing, governance and board-ready deliverables." },
    { title: "Developers", description: "Feasibility narratives, scenario options and investor presentations." },
    { title: "Consultancies", description: "Reusable workflows, QA systems and rapid concept-stage outputs." },
    { title: "Universities", description: "Studio teaching, faculty licenses, workshops and certification." },
  ],
  ar: [
    { title: "الوزارات", description: "السياسات والاستراتيجيات وتقييم برامج التراث والمبادرات القومية." },
    { title: "البلديات", description: "المخططات المحلية وكراسات التصميم العمراني واستراتيجيات الفراغ العام." },
    { title: "هيئات التنمية", description: "أطر الأحياء والتطوير والحوكمة ومخرجات جاهزة للعرض." },
    { title: "المطورون", description: "سرديات الجدوى والسيناريوهات وعروض المستثمرين." },
    { title: "مكاتب الاستشارات", description: "سير عمل قابل لإعادة الاستخدام وأنظمة ضبط الجودة." },
    { title: "الجامعات", description: "تدريس الاستوديو وتراخيص الكليات وورش العمل والشهادات." },
  ],
};

const OFFERINGS: Record<Lang, Item[]> = {
  en: [
    { title: "Custom workflow packs", description: "Organization-specific prompt libraries for restoration and urban projects." },
    { title: "Team onboarding", description: "Training sessions for engineers, planners, reviewers and academic staff." },
    { title: "Quality control system", description: "Methodology matrices, output checklists and board-production guidance." },
    { title: "National registry roadmap", description: "A prepared pathway for a national facade registry and dashboards." },
  ],
  ar: [
    { title: "حزم سير عمل مخصصة", description: "مكتبات أوامر مصممة خصيصاً لمشاريع الترميم والعمران." },
    { title: "تدريب الفرق", description: "جلسات تدريب للمهندسين والمخططين والمراجعين والأكاديميين." },
    { title: "نظام ضبط الجودة", description: "مصفوفات المنهجيات وقوائم مراجعة المخرجات وإرشادات إنتاج اللوحات." },
    { title: "خارطة السجل القومي", description: "مسار جاهز لسجل قومي للواجهات ولوحات المعلومات." },
  ],
};

export default function EnterpriseSection() {
  const { t, lang } = useI18n();

  return (
    <section id="enterprise" className="py-20 scroll-mt-20">
      <div className="container">
        {/* Section Header */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            — {t("enterprise.label")}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-foreground mb-4">
            {t("enterprise.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            {t("enterprise.desc")}
          </p>
        </div>

        {/* Who it's for */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.2em] uppercase mb-6 font-medium">
            — {t("enterprise.whoLabel")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AUDIENCES[lang].map((audience) => (
              <div
                key={audience.title}
                className="p-5 rounded-lg border border-border bg-navy-light/30 hover:border-gold/20 transition-all duration-300"
              >
                <h3 className="font-serif text-base text-foreground mb-2">{audience.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Offerings */}
        <div>
          <p className="text-gold text-xs tracking-[0.2em] uppercase mb-6 font-medium">
            — {t("enterprise.offerLabel")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {OFFERINGS[lang].map((offer) => (
              <div key={offer.title} className="p-6 rounded-lg border border-border bg-navy-light/50">
                <h3 className="font-serif text-lg text-foreground mb-2">{offer.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{offer.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <a
            href="#studio"
            className="inline-flex items-center gap-2 text-gold hover:text-gold-light transition-colors duration-200"
          >
            {t("enterprise.cta")} <ArrowRight size={14} className="rtl:rotate-180" />
          </a>
        </div>
      </div>
    </section>
  );
}
