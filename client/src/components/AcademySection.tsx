import { ArrowRight } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";

type Item = { title: string; description: string };

const CATEGORIES: Record<Lang, Item[]> = {
  en: [
    { title: "Heritage Documentation", description: "Photogrammetry, laser scanning, archival research and building surveys." },
    { title: "AI in Architecture", description: "Generative design, vision models, prompt engineering and professional workflows." },
    { title: "Restoration Techniques", description: "Materials, stone consolidation, conservation ethics and 8K documentation." },
    { title: "Islamic & Coptic Heritage", description: "Mamluk, Ottoman, Coptic and vernacular building traditions." },
    { title: "Urban Heritage", description: "Historic districts, street hierarchies and urban regeneration." },
    { title: "Parametric & Computational Design", description: "Computational geometry, pattern generation and fabrication." },
    { title: "AI Workflow Tutorials", description: "Prompt quality control, visual consistency and board production." },
    { title: "Heritage Economics", description: "Feasibility, adaptive reuse and sustainable tourism models." },
  ],
  ar: [
    { title: "توثيق التراث", description: "التصوير المساحي، المسح الضوئي، البحث الأرشيفي ومسح المباني." },
    { title: "الذكاء الاصطناعي في العمارة", description: "التصميم التوليدي، نماذج الرؤية، هندسة الأوامر وسير العمل المهني." },
    { title: "تقنيات الترميم", description: "المواد، تقوية الأحجار، أخلاقيات الحفاظ والتوثيق بدقة 8K." },
    { title: "التراث الإسلامي والقبطي", description: "التقاليد المملوكية والعثمانية والقبطية والبناء الشعبي." },
    { title: "التراث العمراني", description: "الأحياء التاريخية والتسلسل العمراني وإحياء المدن." },
    { title: "التصميم البارامتري والحاسوبي", description: "الهندسة الحاسوبية وتوليد الزخارف والتصنيع." },
    { title: "دروس سير عمل الذكاء الاصطناعي", description: "ضبط جودة الأوامر، الاتساق البصري وإنتاج اللوحات." },
    { title: "اقتصاديات التراث", description: "الجدوى الاقتصادية وإعادة الاستخدام ونماذج السياحة المستدامة." },
  ],
};

const AUDIENCES: Record<Lang, Item[]> = {
  en: [
    { title: "Architecture Schools", description: "Concept generation, site analysis, architectural language and visual communication." },
    { title: "Planning Schools", description: "Urban analysis, neighborhood planning, mobility and land use." },
    { title: "Restoration Institutes", description: "Conservation science, materials testing and field practice." },
    { title: "Urban Design Studios", description: "Scenario development, urban form and competition boards." },
  ],
  ar: [
    { title: "كليات العمارة", description: "توليد المفاهيم، تحليل الموقع، اللغة المعمارية والتواصل البصري." },
    { title: "كليات التخطيط", description: "التحليل العمراني، تخطيط الأحياء، التنقل واستخدامات الأرض." },
    { title: "معاهد الترميم", description: "علوم الحفاظ، اختبار المواد والممارسة الميدانية." },
    { title: "استوديوهات التصميم العمراني", description: "تطوير السيناريوهات والتشكيل العمراني ولوحات المسابقات." },
  ],
};

export default function AcademySection() {
  const { t, lang } = useI18n();

  return (
    <section id="academy" className="py-20 bg-navy-light/30 scroll-mt-20">
      <div className="container">
        {/* Section Header */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            — {t("academy.label")}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-foreground mb-4">
            {t("academy.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            {t("academy.desc")}
          </p>
        </div>

        {/* Academy Categories */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.2em] uppercase mb-6 font-medium">
            — {t("academy.structureLabel")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CATEGORIES[lang].map((category, index) => (
              <div
                key={category.title}
                className="p-5 rounded-lg border border-border bg-navy-light/50 hover:border-gold/20 transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <span className="text-gold font-mono text-xs mt-1">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-serif text-base text-foreground mb-1">{category.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {category.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Who it's for */}
        <div>
          <p className="text-gold text-xs tracking-[0.2em] uppercase mb-6 font-medium">
            — {t("academy.whoLabel")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {AUDIENCES[lang].map((audience) => (
              <div key={audience.title} className="p-5 rounded-lg border border-border bg-navy-light/30">
                <h3 className="font-serif text-base text-foreground mb-2">{audience.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{audience.description}</p>
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
            {t("academy.cta")} <ArrowRight size={14} className="rtl:rotate-180" />
          </a>
        </div>
      </div>
    </section>
  );
}
