import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

export type TranslationKey = keyof typeof en;

export const en = {
  // Navbar
  "nav.home": "Home",
  "nav.studio": "Restoration Studio",
  "nav.report": "Syndicate Report",
  "nav.cta": "Start Restoration",
  "nav.syndicate": "Egyptian Engineers Syndicate",
  "nav.center": "Egyptian Center for AI in Architecture & Urbanism",
  "nav.langEn": "EN",
  "nav.langAr": "عربي",

  // Hero
  "hero.label": "Egyptian AI Facade Restoration Studio",
  "hero.title": "Restoring Egypt's architectural identity with AI",
  "hero.subtitle":
    "Upload a facade, describe the restoration, and receive a photorealistic 8K heritage reconstruction — Khedivial Cairo, Islamic Mamluk, Coastal Alexandria and more.",
  "hero.cta1": "Start Restoration",
  "hero.cta2": "Explore the Studio",
  "hero.badge1": "Khedivial Cairo",
  "hero.badge2": "Islamic Mamluk",
  "hero.badge3": "Coastal Alexandria",
  "hero.badge4": "8K Photorealism",
  "hero.stat1": "8K Restoration",
  "hero.stat2": "≈3s Generation",
  "hero.stat3": "Heritage Styles",

  // Studio
  "studio.label": "AI Facade Restoration Studio",
  "studio.title": "From raw facade to heritage masterpiece",
  "studio.desc":
    "Upload the current facade, describe your brief, and receive one 8K-style image with three coordinated restoration directions in a single call.",
  "studio.inputTitle": "Current Facade",
  "studio.dropHint": "Drag & drop a facade photo, or click to browse",
  "studio.dropSub": "JPG or PNG · compressed before sending",
  "studio.replace": "Replace photo",
  "studio.promptLabel": "Restoration prompt",
  "studio.promptPlaceholder":
    "e.g. Preserve the existing geometry, use warm limestone, and add shaded balconies with evening light…",
  "studio.button": "Start Restoration",
  "studio.buttonLoading": "Restoring…",
  "studio.outputTitle": "Generated Triptych — 8K",
  "studio.outputEmpty": "Your single-call three-panel 8K triptych will appear here.",
  "studio.outputOriginal": "Original",
  "studio.outputRestored": "Restored",
  "studio.triptychTag": "3-panel presentation board",
  "studio.panel1": "Khedivial Classic",
  "studio.panel2": "Hashami / Biophilic",
  "studio.panel3": "Islamic Mashrabiya",
  "studio.reportButton": "Download Official Syndicate Report",
  "studio.reportHint": "HTML report with source image, brief, and triptych",
  "studio.errorNoImage": "Please upload a facade photo first.",
  "studio.errorNoPrompt": "Please describe the restoration you want.",
  "studio.errorPayload": "The image is too large. Try a smaller photo.",
  "studio.errorGeneric": "Restoration failed. Please try again.",
  "studio.creditsHint":
    "The restoration service needs credits. Top up your OpenRouter account to enable generation.",
  "studio.fastBadge": "≈3s generation",
  "studio.eightKBadge": "8K output",
  "studio.statusDraft": "Architectural brief updated.",
  "studio.statusUploaded": "Facade uploaded. Add a brief and start the single-call triptych.",
  "studio.statusComplete": "Triptych generated and ready for engineering review.",

  // CTA
  "cta.title": "Ready to restore Egypt's facades?",
  "cta.desc":
    "Upload a photo and watch the engine rebuild it as an 8K heritage masterpiece in seconds.",
  "cta.primary": "Start Restoration",
  "cta.secondary": "Talk to the Center",

  // Footer
  "footer.tagline": "AI-driven heritage restoration for Egyptian architecture",
  "footer.about":
    "The Egyptian Center for Artificial Intelligence in Architecture & Urbanism develops national AI platforms for facade restoration, heritage documentation and urban regeneration.",
  "footer.product": "Platform",
  "footer.center": "Center",
  "footer.rights":
    "© 2026 Egyptian Center for AI in Architecture & Urbanism. All rights reserved.",
  "footer.disclaimer":
    "AI-generated restorations are conceptual and illustrative. They are not construction, permit or regulatory determinations. All outputs must be verified by licensed engineers and architects.",
} as const;

export const ar: Record<TranslationKey, string> = {
  "nav.home": "الرئيسية",
  "nav.studio": "استوديو الترميم",
  "nav.report": "تقرير النقابة",
  "nav.cta": "ابدأ الترميم",
  "nav.syndicate": "نقابة المهندسين المصرية",
  "nav.center": "المركز المصري للذكاء الاصطناعي في العمارة والعمران",
  "nav.langEn": "EN",
  "nav.langAr": "عربي",

  "hero.label": "استوديو ترميم الواجهات المصري بالذكاء الاصطناعي",
  "hero.title": "إعادة إحياء الهوية المعمارية المصرية بالذكاء الاصطناعي",
  "hero.subtitle":
    "ارفع صورة الواجهة، صِف الترميم المطلوب، واحصل على إعادة بناء تراثية فوتوغرافية بدقة 8K — القاهرة الخديوية، الإسلامية المملوكية، الإسكندرية الساحلية والمزيد.",
  "hero.cta1": "ابدأ الترميم",
  "hero.cta2": "استكشف الاستوديو",
  "hero.badge1": "القاهرة الخديوية",
  "hero.badge2": "الإسلامي المملوكي",
  "hero.badge3": "الإسكندرية الساحلية",
  "hero.badge4": "فوتوغرافية 8K",
  "hero.stat1": "ترميم بدقة 8K",
  "hero.stat2": "توليد خلال ~3 ثوانٍ",
  "hero.stat3": "أنماط تراثية",

  "studio.label": "استوديو ترميم الواجهات بالذكاء الاصطناعي",
  "studio.title": "من واجهة خام إلى تحفة تراثية",
  "studio.desc":
    "ارفع الواجهة الحالية، اكتب رؤيتك، واحصل على صورة واحدة بدقة 8K تضم ثلاثة اتجاهات ترميمية متناسقة في طلب واحد.",
  "studio.inputTitle": "الواجهة الحالية",
  "studio.dropHint": "اسحب صورة الواجهة أو انقر للاختيار",
  "studio.dropSub": "JPG أو PNG · يتم ضغطها قبل الإرسال",
  "studio.replace": "تغيير الصورة",
  "studio.promptLabel": "وصف الترميم",
  "studio.promptPlaceholder":
    "مثال: حافظ على هندسة الواجهة، استخدم الحجر الدافئ، وأضف بلكونات مظللة وإضاءة مسائية…",
  "studio.button": "بدء الترميم",
  "studio.buttonLoading": "جارٍ الترميم…",
  "studio.outputTitle": "التريبتيك المولد — 8K",
  "studio.outputEmpty": "ستظهر هنا صورة التريبتيك ذات اللوحات الثلاث المولدة في طلب واحد.",
  "studio.outputOriginal": "الأصلية",
  "studio.outputRestored": "المرممة",
  "studio.triptychTag": "لوحة عرض ثلاثية",
  "studio.panel1": "الكلاسيكي الخديوي",
  "studio.panel2": "الهشمي / البيوفيلي",
  "studio.panel3": "المشربيات الإسلامية",
  "studio.reportButton": "تحميل تقرير النقابة الرسمي",
  "studio.reportHint": "تقرير HTML يتضمن الصورة والوصف والتريبتيك",
  "studio.errorNoImage": "يرجى رفع صورة واجهة أولاً.",
  "studio.errorNoPrompt": "يرجى كتابة وصف للترميم المطلوب.",
  "studio.errorPayload": "الصورة كبيرة جداً. جرّب صورة أصغر.",
  "studio.errorGeneric": "فشل الترميم. حاول مرة أخرى.",
  "studio.creditsHint":
    "خدمة الترميم تحتاج رصيداً. أضف رصيداً إلى حساب OpenRouter لتفعيل التوليد.",
  "studio.fastBadge": "توليد خلال ~3 ثوانٍ",
  "studio.eightKBadge": "مخرجات 8K",
  "studio.statusDraft": "تم تحديث الوصف المعماري.",
  "studio.statusUploaded": "تم رفع الواجهة. أضف وصفاً وابدأ التريبتيك في طلب واحد.",
  "studio.statusComplete": "تم توليد التريبتيك وهو جاهز للمراجعة الهندسية.",

  "cta.title": "مستعد لإحياء واجهات مصر؟",
  "cta.desc": "ارفع صورة وشاهد المحرك يعيد بناءها تحفة تراثية بدقة 8K في ثوانٍ.",
  "cta.primary": "ابدأ الترميم الآن",
  "cta.secondary": "تواصل مع المركز",

  "footer.tagline": "ترميم تراثي بالذكاء الاصطناعي للعمارة المصرية",
  "footer.about":
    "يطوّر المركز المصري للذكاء الاصطناعي في العمارة والعمران منصات قومية لترميم الواجهات وتوثيق التراث وإحياء العمران.",
  "footer.product": "المنصة",
  "footer.center": "المركز",
  "footer.rights": "© 2026 المركز المصري للذكاء الاصطناعي في العمارة والعمران. جميع الحقوق محفوظة.",
  "footer.disclaimer":
    "الترميمات المولدة بالذكاء الاصطناعي مفاهيمية واسترشادية. لا تمثل قرارات إنشائية أو تراخيص أو جهات تنظيمية. يجب مراجعة جميع المخرجات من مهندسين ومعماريين مرخصين.",
};

interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  toggle: () => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    try {
      return window.localStorage.getItem("lang") === "ar" ? "ar" : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    root.classList.toggle("arabic", lang === "ar");
    try {
      window.localStorage.setItem("lang", lang);
    } catch {
      /* ignore storage errors */
    }
  }, [lang]);

  const value: I18nContextValue = {
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    setLang: setLangState,
    toggle: () => setLangState((prev) => (prev === "en" ? "ar" : "en")),
    t: (key: TranslationKey) => (lang === "ar" ? ar[key] : en[key]),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
