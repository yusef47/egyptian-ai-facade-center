export type QattanLocale = "ar" | "en";
export type QattanDirection = "rtl" | "ltr";
export type ToolStatus = "live" | "planned";
export type StudioMode =
  | "facade"
  | "cad"
  | "exterior"
  | "interior"
  | "sketch"
  | "masterplan"
  | "landscape"
  | "staging"
  | "enhancer"
  | "floorplan";

export const QATTAN_TAGLINE = "Next-Gen AI Architectural & Interior Visualization Studio";
export const QATTAN_AR_TAGLINE = "استوديو التصور المعماري والداخلي بالذكاء الاصطناعي من الجيل القادم";

export type QattanTool = {
  id: StudioMode;
  title: string;
  description: string;
  status: ToolStatus;
  href: string;
  features: string[];
};

export type QattanCopy = {
  brand: string;
  tagline: string;
  nav: {
    tools: string;
    solutions: string;
    useCases: string;
    pricing: string;
    studio: string;
    signIn: string;
    start: string;
    language: string;
    theme: string;
    menu: string;
    close: string;
  };
  hero: {
    eyebrow: string;
    badge: string;
    titleLine1: string;
    titleLine2: string;
    titleLine3: string;
    description: string;
    primary: string;
    secondary: string;
    freeNote: string;
    trust: string;
    powered: string;
  };
  proof: {
    eyebrow: string;
    title: string;
    description: string;
    before: string;
    after: string;
    exteriorCard: string;
    sketchCard: string;
  };
  workflow: {
    eyebrow: string;
    title: string;
    description: string;
    steps: Array<{ number: string; title: string; description: string }>;
  };
  tools: {
    eyebrow: string;
    title: string;
    description: string;
    live: string;
    planned: string;
    open: string;
    preview: string;
    items: QattanTool[];
  };
  integrations: {
    eyebrow: string;
    title: string;
    description: string;
    items: string[];
  };
  pricing: {
    eyebrow: string;
    title: string;
    description: string;
    badge: string;
    tier: { name: string; price: string; period: string; features: string[]; action: string };
    action: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    items: Array<{ question: string; answer: string }>;
  };
  footer: {
    description: string;
    product: string;
    resources: string;
    legal: string;
    disclaimer: string;
    rights: string;
  };
  studio: {
    eyebrow: string;
    title: string;
    description: string;
    live: string;
    planned: string;
    session: string;
    model: string;
    active: string;
    history: string;
    empty: string;
    result: string;
    disclaimer: string;
    downloadPreview: string;
    facade: string;
    cad: string;
    back: string;
  };
};

const toolsEn: QattanTool[] = [
  { id: "exterior", title: "Exterior AI", description: "Redesign facades in named styles, lighting, and materials — including heritage restoration triptychs.", status: "live", href: "/studio?mode=exterior", features: ["Photorealistic facade redesign", "Heritage triptych mode"] },
  { id: "interior", title: "Interior AI", description: "Furnish and design empty rooms with full control over room type, style, and color mood.", status: "live", href: "/studio?mode=interior", features: ["20+ professional styles", "Full furnishing control"] },
  { id: "sketch", title: "Sketch to Image", description: "Turn hand-drawn sketches and line drawings into photorealistic building visualizations.", status: "live", href: "/studio?mode=sketch", features: ["Hand & digital sketches", "8K realistic output"] },
  { id: "masterplan", title: "Masterplan AI", description: "Convert 2D site plans into aerial bird's-eye 3D visualizations.", status: "live", href: "/studio?mode=masterplan", features: ["Understands 2D site plans", "Aerial 3D visualizations"] },
  { id: "landscape", title: "Landscape AI", description: "Design luxurious outdoor spaces with feature checklists and planting styles.", status: "live", href: "/studio?mode=landscape", features: ["Flexible feature checklist", "Evening visualization"] },
  { id: "staging", title: "Virtual Staging", description: "Stage empty rooms for real estate marketing with market-aware furnishing.", status: "live", href: "/studio?mode=staging", features: ["Real-estate marketing ready", "Walls & windows untouched"] },
  { id: "enhancer", title: "Render Enhancer", description: "Push V-Ray, Lumion, and Enscape renders toward photorealistic quality.", status: "live", href: "/studio?mode=enhancer", features: ["Up to 8K quality", "Works with every render engine"] },
  { id: "floorplan", title: "Floor Plan to CAD", description: "Generate four consistent architectural views and export DXF files locally.", status: "live", href: "/studio?mode=floorplan", features: ["Four consistent CAD views", "Local DXF export"] },
];

const toolsAr: QattanTool[] = [
  { id: "exterior", title: "الواجهات بالذكاء الاصطناعي", description: "أعد تصميم الواجهات بأنماط وإضاءة وخامات محددة — بما يشمل تريبتيك الترميم التراثي.", status: "live", href: "/studio?mode=exterior", features: ["إعادة تصميم واجهات واقعية", "وضع تريبتيك التراث"] },
  { id: "interior", title: "التصميم الداخلي", description: "أثث وصمم الفراغات الفارغة بتحكم كامل في نوع الفراغ والطراز والمزاج اللوني.", status: "live", href: "/studio?mode=interior", features: ["أكثر من 20 طرازاً احترافياً", "تحكم كامل في الفرش"] },
  { id: "sketch", title: "من الاسكتش إلى الصورة", description: "حوّل الاسكتشات اليدوية والرسومات الخطية إلى تصورات معمارية واقعية.", status: "live", href: "/studio?mode=sketch", features: ["رسومات يدوية وديجيتال", "مخرجات واقعية 8K"] },
  { id: "masterplan", title: "الماستر بلان", description: "حوّل المخططات الأرضية ثنائية الأبعاد إلى تصورات ثلاثية الأبعاد بمنظور علوي.", status: "live", href: "/studio?mode=masterplan", features: ["يفهم المخططات ثنائية الأبعاد", "مناظر جوية ثلاثية الأبعاد"] },
  { id: "landscape", title: "المناظر الطبيعية", description: "صمم مساحات خارجية فاخرة بقوائم مميزات وأنماط زراعة محددة.", status: "live", href: "/studio?mode=landscape", features: ["قائمة مميزات مرنة", "تصور مسائي فاخر"] },
  { id: "staging", title: "التأثيث الافتراضي", description: "أثث الغرف الفارغة لتسويق العقارات بتأثيث مناسب للسوق.", status: "live", href: "/studio?mode=staging", features: ["جاهز للتسويق العقاري", "الجدران والنوافذ كما هي"] },
  { id: "enhancer", title: "تحسين الرندر", description: "طوّر رندرات V-Ray وLumion وEnscape نحو جودة واقعية.", status: "live", href: "/studio?mode=enhancer", features: ["جودة تصل إلى 8K", "يشتغل مع كل محركات الرندر"] },
  { id: "floorplan", title: "تحويل المخطط إلى كاد", description: "ولّد أربعة رسومات معمارية متناسقة وصدّر ملفات DXF محلياً.", status: "live", href: "/studio?mode=floorplan", features: ["أربعة رسومات CAD متناسقة", "تصدير DXF محلي"] },
];

export const qattanCopy: Record<QattanLocale, QattanCopy> = {
  en: {
    brand: "Qattan AI",
    tagline: QATTAN_TAGLINE,
    nav: { tools: "Explore Tools", solutions: "Product", useCases: "Use Cases", pricing: "Pricing", studio: "Studio", signIn: "Log in", start: "Get Started", language: "Language", theme: "Toggle theme", menu: "Open menu", close: "Close menu" },
    hero: { eyebrow: "AI visualization for architecture and interiors", badge: "The first AI architectural platform", titleLine1: "Architectural rendering", titleLine2: "with artificial intelligence", titleLine3: "From sketch to photorealistic image in seconds", description: "Professional rendering tools for architects and designers. Turn SketchUp, Revit, and Blender models into studio-quality photorealistic images.", primary: "Try Free", secondary: "See How It Works", freeNote: "Free credits upon signup · No credit card required", trust: "+2 Million architects and designers trust Qattan", powered: "Powered by Qattan Gemini Engine" },
    proof: { eyebrow: "From sketch to reality", title: "From drawing to reality in seconds.", description: "Watch how AI transforms your sketches and 3D models into stunning visuals.", before: "Sketch", after: "Realistic design", exteriorCard: "Exterior Redesign", sketchCard: "Sketch to Render" },
    workflow: { eyebrow: "Get a professional render effortlessly", title: "Just 3 steps.", description: "Keep the creative loop focused: upload the source, choose the style, and download the result.", steps: [{ number: "1", title: "Upload your image", description: "Upload a sketch or a screenshot from SketchUp, Revit, or any architectural image." }, { number: "2", title: "Choose the style", description: "Pick from more than 40 architectural styles and tune the settings to your taste." }, { number: "3", title: "Download the result", description: "Within seconds you get a presentation-ready photorealistic 8K image." }] },
    tools: { eyebrow: "The Qattan toolkit", title: "AI design tools.", description: "Eight live engines share one workspace and one server-side image pipeline. Pick a tool, upload your source, and control the output with architectural presets.", live: "Live now", planned: "Planned", open: "Open tool", preview: "Watch preview", items: toolsEn },
    integrations: { eyebrow: "Works with your process", title: "Bring the tools you already use.", description: "Qattan is designed around common architectural inputs and presentation workflows. Direct file parsing integrations are planned; today you can upload image exports from your preferred tools.", items: ["SketchUp", "Revit", "Blender", "Rhino", "AutoCAD", "V-Ray", "Lumion", "Enscape"] },
    pricing: { eyebrow: "Access", title: "Clear and simple pricing.", description: "Start free and scale with the studio. Subscriptions open soon — the studio itself is live today.", badge: "SOON · قريباً", tier: { name: "Studio", price: "$29", period: "/month", features: ["1,000 credits", "100 professional designs", "10 AI videos", "Free 4K upgrade", "Commercial use", "Premium support"], action: "Try Free" }, action: "See all plans" },
    faq: { eyebrow: "Questions", title: "A clear starting point for your team.", items: [{ question: "What can I generate today?", answer: "All eight studio tools are live: exterior facades with heritage triptych mode, interiors, sketch-to-image, masterplans, landscapes, virtual staging, render enhancement, and floor-plan-to-CAD with local DXF export — all through the shared server-side image engine." }, { question: "Are the outputs construction documents?", answer: "No. Outputs are conceptual visual studies. Dimensions, structure, materials, code compliance, and permissions must be reviewed by licensed professionals." }, { question: "Do I need an account?", answer: "Not in this preview slice. Session history is held in the browser and can be lost on refresh; persistent accounts are deferred." }, { question: "Can Qattan export DWG?", answer: "The live browser workflow exports editable ASCII DXF files. AutoCAD can open a DXF and save it as DWG when your team is ready." }, { question: "Are the other tools live?", answer: "Every tool in the toolkit is a live engine. Each one runs through the same server-side Gemini image pipeline with tool-specific architectural prompts." }] },
    footer: { description: "Next-Gen AI Architectural & Interior Visualization Studio for clearer design decisions.", product: "Product", resources: "Resources", legal: "Legal", disclaimer: "AI outputs are conceptual and illustrative. Verify all geometry, dimensions, materials, accessibility, heritage constraints, and structural decisions with licensed professionals.", rights: "© 2026 Qattan AI. Built for architectural exploration." },
    studio: { eyebrow: "Qattan workspace", title: "A focused studio for architectural image-making.", description: "Choose a live engine, upload your source, and keep the rest of the workflow in one responsive workspace.", live: "Live engine", planned: "Planned mode", session: "This session only", model: "Gemini image engine · server-side", active: "Active tool", history: "Session history", empty: "Generated outputs will appear here during this session.", result: "Generated output", disclaimer: "Outputs are conceptual studies. Review geometry, dimensions, materials, and code with a licensed professional.", downloadPreview: "Download preview", facade: "Facade Restoration", cad: "Floor Plan to CAD", back: "Back to Qattan AI" },
  },
  ar: {
    brand: "قطان AI",
    tagline: QATTAN_AR_TAGLINE,
    nav: { tools: "استكشاف الأدوات", solutions: "المنتج", useCases: "حالات الاستخدام", pricing: "الأسعار", studio: "الاستوديو", signIn: "تسجيل الدخول", start: "ابدأ", language: "اللغة", theme: "تبديل المظهر", menu: "فتح القائمة", close: "إغلاق القائمة" },
    hero: { eyebrow: "التصور بالذكاء الاصطناعي للعمارة والداخلية", badge: "منصة الذكاء الاصطناعي المعماري الأولى", titleLine1: "رندر معماري", titleLine2: "بالذكاء الاصطناعي", titleLine3: "من الاسكتش للصورة الواقعية في ثواني", description: "أدوات رندر احترافية للمعماريين والمصممين. حوّل نماذج سكتش أب وريفيت وبلندر لصور واقعية بجودة استوديو احترافي.", primary: "جرّب مجاناً", secondary: "شوف كيف يشتغل", freeNote: "رصيد مجاني عند التسجيل • بدون بطاقة ائتمانية", trust: "موثوق من قبل +2 مليون معماري ومصمم", powered: "مدعوم بـ Qattan Gemini Engine" },
    proof: { eyebrow: "من الفكرة إلى الصورة", title: "من الرسمة للواقع في ثواني", description: "شوف كيف يحوّل الذكاء الاصطناعي رسوماتك ونماذجك ثلاثية الأبعاد لصور مذهلة.", before: "قبل", after: "بعد", exteriorCard: "إعادة تصميم الواجهات", sketchCard: "من الاسكتش للرندر" },
    workflow: { eyebrow: "احصل على رندر احترافي بكل سهولة", title: "٣ خطوات بس", description: "ارفع المصدر، اختر الستايل، وحمّل النتيجة — دورة إبداع مركزة من الفكرة إلى العرض.", steps: [{ number: "1", title: "ارفع صورتك", description: "ارفع اسكتشك أو لقطة من سكتش أب أو ريفيت أو أي صورة معمارية." }, { number: "2", title: "اختر الستايل", description: "اختر من أكثر من 40 ستايل معماري وعدّل الإعدادات على ذوقك." }, { number: "3", title: "حمّل النتيجة", description: "خلال ثواني، تحصل على صورة واقعية بجودة احترافية جاهزة للعرض." }] },
    tools: { eyebrow: "مجموعة أدوات قطان", title: "أدوات الذكاء الاصطناعي للتصميم", description: "ثمانية محركات حية في مساحة واحدة ومسار صور واحد على الخادم. اختر الأداة، ارفع مصدرك، وتحكم في المخرجات بضبط معماري.", live: "متاح الآن", planned: "مخطط", open: "فتح الأداة", preview: "شاهد المعاينة", items: toolsAr },
    integrations: { eyebrow: "ينسجم مع طريقتك", title: "استخدم الأدوات التي تعرفها.", description: "صُمم قطان حول مدخلات العمارة ومسارات العرض الشائعة. تكامل قراءة الملفات مباشرة مخطط له؛ ويمكنك الآن رفع الصور المصدرة من أدواتك المفضلة.", items: ["SketchUp", "Revit", "Blender", "Rhino", "AutoCAD", "V-Ray", "Lumion", "Enscape"] },
    pricing: { eyebrow: "الوصول", title: "أسعار واضحة وبسيطة", description: "ابدأ مجاناً وطوّر حسب احتياجك. الاشتراكات قريباً — والاستوديو متاح اليوم.", badge: "قريباً", tier: { name: "استوديو", price: "$29", period: "/شهرياً", features: ["1,000 رصيد", "100 تصميم احترافي", "10 فيديو", "ترقية 4K مجانية", "استخدام تجاري", "دعم فني متميز"], action: "جرّب مجاناً" }, action: "شوف كل الباقات" },
    faq: { eyebrow: "أسئلة", title: "بداية واضحة لفريقك.", items: [{ question: "ماذا يمكنني توليده الآن؟", answer: "الأدوات الثماني كلها حية: الواجهات مع وضع الترميم التراثي، الداخلية، الاسكتش، الماستر بلان، المناظر الطبيعية، التأثيث الافتراضي، تحسين الرندر، وتحويل المخطط إلى كاد مع تصدير DXF محلياً — كلها عبر محرك الصور المشترك على الخادم." }, { question: "هل المخرجات مستندات تنفيذية؟", answer: "لا. المخرجات دراسات بصرية مفاهيمية. يجب أن يراجع المختصون المرخصون الأبعاد والإنشاء والخامات والكود والتراخيص." }, { question: "هل أحتاج إلى حساب؟", answer: "ليس في هذه المعاينة. تحفظ الجلسة داخل المتصفح وقد تختفي عند التحديث؛ الحسابات الدائمة مؤجلة." }, { question: "هل يصدّر قطان DWG؟", answer: "يصدّر المسار الحالي ملفات DXF نصية قابلة للتحرير. يستطيع AutoCAD فتح DXF وحفظه بصيغة DWG عند الحاجة." }, { question: "هل الأدوات الأخرى حية؟", answer: "كل أداة في المجموعة محرك حي يعمل عبر مسار Gemini على الخادم مع برومبتات معمارية مخصصة لكل أداة." }] },
    footer: { description: "استوديو التصور المعماري والداخلي بالذكاء الاصطناعي من الجيل القادم لاتخاذ قرارات تصميم أوضح.", product: "المنتج", resources: "المصادر", legal: "قانوني", disclaimer: "المخرجات بالذكاء الاصطناعي مفاهيمية واسترشادية. تحقق من الهندسة والأبعاد والخامات وإتاحة الوصول وقيود التراث والقرارات الإنشائية مع مختصين مرخصين.", rights: "© 2026 قطان AI. صُمم لاستكشاف العمارة." },
    studio: { eyebrow: "مساحة قطان", title: "استوديو مركز لصناعة الصور المعمارية.", description: "اختر محركاً حياً، ارفع مصدرك، وأكمل بقية المسار في مساحة عمل متجاوبة واحدة.", live: "محرك حي", planned: "وضع مخطط", session: "هذه الجلسة فقط", model: "محرك Gemini للصور · على الخادم", active: "الأداة النشطة", history: "سجل الجلسة", empty: "ستظهر المخرجات المولدة هنا خلال هذه الجلسة.", result: "مخرج مولد", disclaimer: "المخرجات دراسات مفاهيمية. راجع الهندسة والأبعاد والخامات والكود مع متخصص مرخص.", downloadPreview: "تحميل المعاينة", facade: "ترميم الواجهات", cad: "تحويل المخطط إلى كاد", back: "العودة إلى قطان AI" }
  },
};

export function getQattanCopy(locale: QattanLocale): QattanCopy {
  return qattanCopy[locale];
}

export function getQattanDirection(locale: QattanLocale): QattanDirection {
  return locale === "ar" ? "rtl" : "ltr";
}
