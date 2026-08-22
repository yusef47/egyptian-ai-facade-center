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
  "nav.facadeTab": "Facade Restoration",
  "nav.cadTab": "Floor Plan to CAD",
  "nav.studioTabs": "Studio modes",

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
  "hero.stat3": "Heritage Review",

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
  "studio.openGenerated": "Open generated triptych in fullscreen",
  "studio.closeLightbox": "Close fullscreen triptych",
  "studio.lightboxTitle": "Generated triptych — native-resolution view",
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

  // CAD vectorizer
  "cad.label": "AI Floor Plan to AutoCAD Studio",
  "cad.title": "From colored plan to 4 architectural CAD views",
  "cad.desc": "Convert a colored 2D or 3D floor plan into four consistent black-and-white CAD drawings — plan, elevation, section and perspective — in a single generation, then export each as an editable DXF.",
  "cad.inputTitle": "Floor plan image",
  "cad.dropHint": "Drag & drop a floor plan, or click to browse",
  "cad.dropSub": "JPG or PNG · compressed before sending",
  "cad.replace": "Replace plan",
  "cad.convertButton": "Generate 4 Architectural Views",
  "cad.convertLoading": "Generating 4 views…",
  "cad.outputTitle": "Generated 4 Architectural Views (2×2)",
  "cad.outputEmpty": "Your four quadrant CAD drawings — plan, elevation, section and perspective — will appear here.",
  "cad.downloadPlan": "Download Plan DXF",
  "cad.downloadElevation": "Download Elevation DXF",
  "cad.downloadSection": "Download Section DXF",
  "cad.downloadPerspective": "Download Perspective DXF",
  "cad.downloadAll": "Download All (ZIP)",
  "cad.downloadAllLoading": "Preparing ZIP…",
  "cad.downloadQuadrantLoading": "Preparing DXF…",
  "cad.downloadHint": "Each quadrant exports as a separate editable ASCII DXF for AutoCAD 2024",
  "cad.reviewNote": "Review dimensions, wall thicknesses, openings, and layers with a licensed architect before construction use.",
  "cad.statusUploaded": "Floor plan uploaded. Generate the four CAD views when ready.",
  "cad.statusComplete": "4 CAD views are ready for DXF export.",
  "cad.errorNoImage": "Please upload a floor plan image first.",
  "cad.errorGeneric": "CAD conversion failed. Please try again.",
  "cad.errorPayload": "The floor plan image is too large. Try a smaller image.",
  "cad.errorEmptyDxf": "No usable dark contours were found for DXF export.",
  "cad.zipProgressStart": "Starting vectorization…",
  "cad.zipProgressPlan": "Processing Plan (1/4)…",
  "cad.zipProgressElevation": "Processing Elevation (2/4)…",
  "cad.zipProgressSection": "Processing Section (3/4)…",
  "cad.zipProgressPerspective": "Processing Perspective (4/4)…",
  "cad.zipPartialFailure": "Some quadrants could not be vectorized. The ZIP contains only the successful files.",

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
  "nav.facadeTab": "ترميم الواجهات",
  "nav.cadTab": "تحويل مخطط لكاد",
  "nav.studioTabs": "أنماط الاستوديو",

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
  "hero.stat3": "مراجعة تراثية",

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
  "studio.openGenerated": "فتح التريبتيك المولد بملء الشاشة",
  "studio.closeLightbox": "إغلاق التريبتيك بملء الشاشة",
  "studio.lightboxTitle": "التريبتيك المولد — عرض بالدقة الأصلية",
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

  "cad.label": "استوديو تحويل المخططات إلى أوتوكاد بالذكاء الاصطناعي",
  "cad.title": "من مخطط ملون إلى أربعة رسومات معمارية",
  "cad.desc": "حوّل المخطط المعماري ثنائي أو ثلاثي الأبعاد إلى أربعة رسومات كاد متناسقة — مخطط، واجهة، مقطع ومنظور — في توليد واحد، ثم صدّر كل رسم كملف DXF قابل للتحرير.",
  "cad.inputTitle": "صورة المخطط",
  "cad.dropHint": "اسحب المخطط أو انقر لاختيار ملف",
  "cad.dropSub": "JPG أو PNG · يتم ضغطها قبل الإرسال",
  "cad.replace": "تغيير المخطط",
  "cad.convertButton": "✨ توليد 4 رسومات معمارية",
  "cad.convertLoading": "جارٍ توليد 4 رسومات…",
  "cad.outputTitle": "الرسومات المعمارية الأربعة المولدة (2×2)",
  "cad.outputEmpty": "ستظهر هنا رسومات الكاد الأربعة — المخطط والواجهة والمقطع والمنظور.",
  "cad.downloadPlan": "تحميل مخطط DXF",
  "cad.downloadElevation": "تحميل واجهة DXF",
  "cad.downloadSection": "تحميل مقطع DXF",
  "cad.downloadPerspective": "تحميل منظور DXF",
  "cad.downloadAll": "تحميل الكل (ZIP)",
  "cad.downloadAllLoading": "جارٍ تجهيز ZIP…",
  "cad.downloadQuadrantLoading": "جارٍ تجهيز DXF…",
  "cad.downloadHint": "يُصدَّر كل ربع كملف DXF نصي منفصل قابل للتحرير في AutoCAD 2024",
  "cad.reviewNote": "يرجى مراجعة الأبعاد وسماكات الحوائط والفتحات والطبقات مع معماري مرخص قبل استخدامه في التنفيذ.",
  "cad.statusUploaded": "تم رفع المخطط. يمكنك توليد الرسومات الأربعة عند الاستعداد.",
  "cad.statusComplete": "الرسومات الأربعة جاهزة لتصدير DXF.",
  "cad.errorNoImage": "يرجى رفع صورة مخطط أولاً.",
  "cad.errorGeneric": "فشل تحويل المخطط إلى كاد. حاول مرة أخرى.",
  "cad.errorPayload": "صورة المخطط كبيرة جداً. جرّب صورة أصغر.",
  "cad.errorEmptyDxf": "لم يتم العثور على حدود داكنة صالحة لتصدير DXF.",
  "cad.zipProgressStart": "جارٍ بدء التحليل…",
  "cad.zipProgressPlan": "جارٍ معالجة المخطط (1/4)…",
  "cad.zipProgressElevation": "جارٍ معالجة الواجهة (2/4)…",
  "cad.zipProgressSection": "جارٍ معالجة المقطع (3/4)…",
  "cad.zipProgressPerspective": "جارٍ معالجة المنظور (4/4)…",
  "cad.zipPartialFailure": "تعذر تحويل بعض الأجزاء. يحتوي الملف على الملفات الناجحة فقط.",

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
