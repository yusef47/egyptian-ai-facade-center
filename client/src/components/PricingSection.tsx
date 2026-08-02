import { useI18n, type Lang } from "@/lib/i18n";

type Tier = { title: string; price: string; tag: string; description: string; cta: string; featured: boolean };

const TIERS: Record<Lang, Tier[]> = {
  en: [
    {
      title: "Government & Institutions",
      price: "Custom",
      tag: "INSTITUTIONAL LICENSE",
      description: "National agencies, ministries, universities and heritage authorities.",
      cta: "Contact us",
      featured: true,
    },
    {
      title: "Professional Studio",
      price: "E£ 1,500/mo",
      tag: "SELF-SERVE",
      description: "Unlimited restorations for registered engineers and architects.",
      cta: "Get started",
      featured: false,
    },
    {
      title: "Students & Academia",
      price: "Free",
      tag: "",
      description: "Learning and non-commercial use for architecture and planning students.",
      cta: "Apply now",
      featured: false,
    },
    {
      title: "Individual",
      price: "Pay as you go",
      tag: "",
      description: "Single facade restorations, no subscription required.",
      cta: "Start restoring",
      featured: false,
    },
  ],
  ar: [
    {
      title: "الحكومة والمؤسسات",
      price: "حسب الطلب",
      tag: "ترخيص مؤسسي",
      description: "الجهات القومية والوزارات والجامعات وهيئات التراث.",
      cta: "تواصل معنا",
      featured: true,
    },
    {
      title: "الاستوديو المهني",
      price: "1500 ج.م/شهر",
      tag: "اشتراك ذاتي",
      description: "ترميمات غير محدودة للمهندسين والمعماريين المرخصين.",
      cta: "ابدأ الآن",
      featured: false,
    },
    {
      title: "الطلاب والأكاديميون",
      price: "مجاني",
      tag: "",
      description: "لأغراض تعليمية وغير تجارية لطلاب العمارة والتخطيط.",
      cta: "قدّم طلباً",
      featured: false,
    },
    {
      title: "الأفراد",
      price: "الدفع حسب الاستخدام",
      tag: "",
      description: "ترميم واجهات فردية دون اشتراك.",
      cta: "ابدأ الترميم",
      featured: false,
    },
  ],
};

export default function PricingSection() {
  const { t, lang } = useI18n();
  const tiers = TIERS[lang];

  return (
    <section id="pricing" className="py-20 scroll-mt-20">
      <div className="container">
        {/* Section Header */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            — {t("pricing.label")}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-foreground mb-4">
            {t("pricing.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            {t("pricing.desc")}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.title}
              className={`p-6 rounded-lg border transition-all duration-300 hover:border-gold/30 ${
                tier.featured
                  ? "border-gold/40 bg-navy-light"
                  : "border-border bg-navy-light/30"
              }`}
            >
              {tier.tag && (
                <span className="text-gold text-[10px] tracking-[0.2em] uppercase font-medium">
                  {tier.tag}
                </span>
              )}
              <h3 className="font-serif text-lg text-foreground mt-3 mb-2">{tier.title}</h3>
              <p className="text-gold text-2xl font-semibold mb-4">{tier.price}</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                {tier.description}
              </p>
              <a
                href="#studio"
                className={`inline-flex items-center text-sm font-medium transition-colors duration-200 ${
                  tier.featured
                    ? "text-gold hover:text-gold-light"
                    : "text-foreground hover:text-gold"
                }`}
              >
                {tier.cta} →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
