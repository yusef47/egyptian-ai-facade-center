import { ArrowRight } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";

const IMG = "?auto=format&fit=crop&w=1200&q=80";
const U = (id: string) => `https://images.unsplash.com/${id}${IMG}`;

type Edition = { tags: string; title: string; description: string; image: string };

const EDITIONS: Record<Lang, Edition[]> = {
  en: [
    {
      tags: "COLONIAL ELEGANCE · IRONWORK · CLASSIC DETAIL",
      title: "Khedivial Cairo",
      description: "Restoration of 19th-century downtown Cairo facades — classic cornices, balconies and sash windows.",
      image: U("photo-1513694203232-719a280e022f"),
    },
    {
      tags: "ABLAQ · MUQARNAS · ARABESQUE",
      title: "Islamic Mamluk",
      description: "Mamluk facades with stone banding, muqarnas cornices and carved arabesque panels.",
      image: U("photo-1541888946425-d0fbb186a5b7"),
    },
    {
      tags: "SEASIDE · PASTEL · SHUTTERS",
      title: "Coastal Alexandria",
      description: "Mediterranean waterfront villas and balconies with sea-facing shutters.",
      image: U("photo-1503387762-592deb58ef4e"),
    },
    {
      tags: "WOODWORK · LATTICE · PRIVACY",
      title: "Wooden Mashrabiya",
      description: "Historic mashrabiya screens, projecting balconies and carved wooden panels.",
      image: U("photo-1449824913935-59a10b8d2000"),
    },
    {
      tags: "LIMESTONE · CARVING · PATINA",
      title: "Hashami Stone",
      description: "Hashami limestone restoration with carved string courses and portals.",
      image: U("photo-1580587771525-78b9dba3b914"),
    },
    {
      tags: "MONUMENTAL · COLUMNS · LOTUS",
      title: "Pharaonic Revival",
      description: "Modern facades inspired by Pharaonic temples, lotus capitals and battered walls.",
      image: U("photo-1460578283813-4a9addd71c34"),
    },
    {
      tags: "OTTOMAN · TIMBER · CAIRO",
      title: "Ottoman Facades",
      description: "Ottoman Cairo houses with timber corbels, projecting windows and stone sills.",
      image: U("photo-1494145904049-0dca59b4bbad"),
    },
    {
      tags: "STREET · PAVING · LIGHTING",
      title: "Streetscape & Public Realm",
      description: "Heritage street upgrading — paving, lanterns, signage and street furniture.",
      image: U("photo-1486406146926-c627a92ad1ab"),
    },
    {
      tags: "CONTEMPORARY · GOLD · MINIMAL",
      title: "Modern Reinterpretation",
      description: "Contemporary facades that echo heritage proportion and ornament in modern materials.",
      image: U("photo-1477959858617-67f85cf4f1df"),
    },
    {
      tags: "HERITAGE · REUSE · CONTEXT",
      title: "Urban Conservation",
      description: "Context-aware conservation and adaptive reuse of heritage buildings.",
      image: U("photo-1600585154340-be6161a56a0c"),
    },
  ],
  ar: [
    {
      tags: "أناقة أوروبية · حديد زخرفي · تفاصيل كلاسيكية",
      title: "القاهرة الخديوية",
      description: "ترميم واجهات وسط البلد في القرن التاسع عشر — أفاريز كلاسيكية وبلكونات ونوافذ خشبية.",
      image: U("photo-1513694203232-719a280e022f"),
    },
    {
      tags: "أبلق · مقرنصات · توريق",
      title: "الإسلامية المملوكية",
      description: "واجهات مملوكية بمداميك حجرية متناوبة ومقرنصات ولوحات توريق منحوتة.",
      image: U("photo-1541888946425-d0fbb186a5b7"),
    },
    {
      tags: "ساحلية · باستيل · مصاريع",
      title: "الإسكندرية الساحلية",
      description: "واجهات فيلات مطلة على البحر بمصاريع ومشغولات البحر المتوسط.",
      image: U("photo-1503387762-592deb58ef4e"),
    },
    {
      tags: "نجارة · مشبكات · خصوصية",
      title: "المشربيات الخشبية",
      description: "مشربيات تاريخية وبلكونات بارزة وألواح خشبية منحوتة.",
      image: U("photo-1449824913935-59a10b8d2000"),
    },
    {
      tags: "حجر جيري · نحت · عراقة",
      title: "الحجر الهشمي",
      description: "ترميم بالحجر الهشمي مع شريطات حجرية منحوتة ومداخل مميزة.",
      image: U("photo-1580587771525-78b9dba3b914"),
    },
    {
      tags: "ضخامة · أعمدة · لوتس",
      title: "الإحياء الفرعوني",
      description: "واجهات حديثة مستوحاة من المعابد الفرعونية وتيجان اللوتس والجدران المائلة.",
      image: U("photo-1460578283813-4a9addd71c34"),
    },
    {
      tags: "عثمانية · خشب · قاهرة",
      title: "العثمانية",
      description: "منازل القاهرة العثمانية بكوابيل خشبية ونوافذ بارزة وعتبات حجرية.",
      image: U("photo-1494145904049-0dca59b4bbad"),
    },
    {
      tags: "شارع · رصف · إنارة",
      title: "الفراغ العام والشوارع",
      description: "تطوير الشوارع التراثية — رصف وفوانيس ولوحات إرشادية وتأثيث حضري.",
      image: U("photo-1486406146926-c627a92ad1ab"),
    },
    {
      tags: "معاصر · ذهبي · بسيط",
      title: "التفسير الحديث",
      description: "واجهات معاصرة تردد النسب والزخرفة التراثية بمواد حديثة.",
      image: U("photo-1477959858617-67f85cf4f1df"),
    },
    {
      tags: "تراث · إعادة استخدام · سياق",
      title: "الحفاظ العمراني",
      description: "حفاظ واعٍ بالسياق وإعادة استخدام تكيفية للمباني التراثية.",
      image: U("photo-1600585154340-be6161a56a0c"),
    },
  ],
};

export default function EditionsSection() {
  const { t, lang } = useI18n();
  const editions = EDITIONS[lang];

  return (
    <section id="editions" className="py-20 scroll-mt-20">
      <div className="container">
        {/* Section Header */}
        <div className="mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            — {t("editions.label")}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-foreground mb-4">
            {t("editions.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            {t("editions.desc")}
          </p>
        </div>

        {/* Style Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {editions.map((edition) => (
            <div
              key={edition.title}
              className="group relative overflow-hidden rounded-lg border border-border hover:border-gold/30 transition-all duration-300 bg-gradient-to-b from-navy-lighter to-background"
              style={{ minHeight: "280px" }}
            >
              {/* Background image */}
              <div className="absolute inset-0">
                <img
                  src={edition.image}
                  alt={edition.title}
                  loading="lazy"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.display = "none";
                  }}
                  className="w-full h-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
              </div>

              {/* Content overlay */}
              <div className="relative z-10 flex flex-col justify-end h-full p-6">
                <p className="text-gold text-[10px] tracking-[0.2em] uppercase mb-2">
                  {edition.tags}
                </p>
                <h3 className="font-serif text-xl text-foreground mb-2">{edition.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                  {edition.description}
                </p>
                <span className="inline-flex items-center gap-1 text-gold text-sm font-medium group-hover:gap-2 transition-all duration-200">
                  {t("editions.open")} <ArrowRight size={14} className="rtl:rotate-180" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
