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
};

export type QattanCopy = {
  brand: string;
  tagline: string;
  nav: {
    tools: string;
    solutions: string;
    pricing: string;
    studio: string;
    signIn: string;
    start: string;
    language: string;
    menu: string;
    close: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primary: string;
    secondary: string;
    freeNote: string;
    visualInput: string;
    visualOutput: string;
  };
  proof: {
    eyebrow: string;
    title: string;
    description: string;
    before: string;
    after: string;
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
    details: string[];
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
  { id: "exterior", title: "Exterior AI", description: "Redesign facades in named styles, lighting, and materials — including heritage restoration triptychs.", status: "live", href: "/studio?mode=exterior" },
  { id: "interior", title: "Interior AI", description: "Furnish and design empty rooms with full control over room type, style, and color mood.", status: "live", href: "/studio?mode=interior" },
  { id: "sketch", title: "Sketch to Image", description: "Turn hand-drawn sketches and line drawings into photorealistic building visualizations.", status: "live", href: "/studio?mode=sketch" },
  { id: "masterplan", title: "Masterplan AI", description: "Convert 2D site plans into aerial bird's-eye 3D visualizations.", status: "live", href: "/studio?mode=masterplan" },
  { id: "landscape", title: "Landscape AI", description: "Design luxurious outdoor spaces with feature checklists and planting styles.", status: "live", href: "/studio?mode=landscape" },
  { id: "staging", title: "Virtual Staging", description: "Stage empty rooms for real estate marketing with market-aware furnishing.", status: "live", href: "/studio?mode=staging" },
  { id: "enhancer", title: "Render Enhancer", description: "Push V-Ray, Lumion, and Enscape renders toward photorealistic quality.", status: "live", href: "/studio?mode=enhancer" },
  { id: "floorplan", title: "Floor Plan to CAD", description: "Generate four consistent architectural views and export DXF files locally.", status: "live", href: "/studio?mode=floorplan" },
];

const toolsAr: QattanTool[] = [
  { id: "exterior", title: "الواجهات بالذكاء الاصطناعي", description: "أعد تصميم الواجهات بأنماط وإضاءة وخامات محددة — بما يشمل تريبتيك الترميم التراثي.", status: "live", href: "/studio?mode=exterior" },
  { id: "interior", title: "التصميم الداخلي", description: "أثث وصمم الفراغات الفارغة بتحكم كامل في نوع الفراغ والطراز والمزاج اللوني.", status: "live", href: "/studio?mode=interior" },
  { id: "sketch", title: "من الاسكتش إلى الصورة", description: "حوّل الاسكتشات اليدوية والرسومات الخطية إلى تصورات معمارية واقعية.", status: "live", href: "/studio?mode=sketch" },
  { id: "masterplan", title: "الماستر بلان", description: "حوّل المخططات الأرضية ثنائية الأبعاد إلى تصورات ثلاثية الأبعاد بمنظور علوي.", status: "live", href: "/studio?mode=masterplan" },
  { id: "landscape", title: "المناظر الطبيعية", description: "صمم مساحات خارجية فاخرة بقوائم مميزات وأنماط زراعة محددة.", status: "live", href: "/studio?mode=landscape" },
  { id: "staging", title: "التأثيث الافتراضي", description: "أثث الغرف الفارغة لتسويق العقارات بتأثيث مناسب للسوق.", status: "live", href: "/studio?mode=staging" },
  { id: "enhancer", title: "تحسين الرندر", description: "طوّر رندرات V-Ray وLumion وEnscape نحو جودة واقعية.", status: "live", href: "/studio?mode=enhancer" },
  { id: "floorplan", title: "تحويل المخطط إلى كاد", description: "ولّد أربعة رسومات معمارية متناسقة وصدّر ملفات DXF محلياً.", status: "live", href: "/studio?mode=floorplan" },
];

export const qattanCopy: Record<QattanLocale, QattanCopy> = {
  en: {
    brand: "Qattan AI",
    tagline: QATTAN_TAGLINE,
    nav: { tools: "Tools", solutions: "Solutions", pricing: "Pricing", studio: "Studio", signIn: "Sign in", start: "Start creating", language: "Language", menu: "Open menu", close: "Close menu" },
    hero: { eyebrow: "AI visualization for architecture and interiors", title: "Turn architectural intent into client-ready visuals.", description: "Qattan AI helps architects move from sketch, plan, or facade image to clear visual direction—without losing the logic of the design.", primary: "Create your first render", secondary: "Explore the workflow", freeNote: "Session-based preview · No account or card required for this prototype", visualInput: "Concept input", visualOutput: "Qattan study" },
    proof: { eyebrow: "From idea to image", title: "See the design direction before the long render.", description: "Compare an early architectural input with a generated visual study using a simple, touch-friendly slider.", before: "Before", after: "After" },
    workflow: { eyebrow: "A simpler workflow", title: "Three steps from concept to presentation.", description: "Keep the creative loop focused: upload the source, describe the intent, and review the result.", steps: [{ number: "01", title: "Upload your source", description: "Start with a facade image, floor plan, sketch, or architectural reference." }, { number: "02", title: "Describe the direction", description: "Use a natural-language brief to explain material, atmosphere, and design priorities." }, { number: "03", title: "Review and export", description: "Inspect the output, compare versions, and export the artifacts your workflow supports." }] },
    tools: { eyebrow: "The Qattan toolkit", title: "One workspace for the visual decisions that matter.", description: "Eight live engines share one workspace and one server-side image pipeline. Pick a tool, upload your source, and control the output with architectural presets.", live: "Live now", planned: "Planned", open: "Open tool", items: toolsEn },
    integrations: { eyebrow: "Works with your process", title: "Bring the tools you already use.", description: "Qattan is designed around common architectural inputs and presentation workflows. Direct file parsing integrations are planned; today you can upload image exports from your preferred tools.", items: ["SketchUp", "Revit", "Blender", "Rhino", "AutoCAD", "V-Ray", "Lumion", "Enscape"] },
    pricing: { eyebrow: "Access", title: "Start with the workflow, scale with the studio.", description: "The Qattan account and credit system is being prepared separately. This prototype keeps generation server-side and does not collect payment.", badge: "Private preview", details: ["All eight AI design tools", "Heritage facade triptych mode", "Local DXF and ZIP export", "Professional review disclaimer"], action: "Open the studio" },
    faq: { eyebrow: "Questions", title: "A clear starting point for your team.", items: [{ question: "What can I generate today?", answer: "All eight studio tools are live: exterior facades with heritage triptych mode, interiors, sketch-to-image, masterplans, landscapes, virtual staging, render enhancement, and floor-plan-to-CAD with local DXF export — all through the shared server-side image engine." }, { question: "Are the outputs construction documents?", answer: "No. Outputs are conceptual visual studies. Dimensions, structure, materials, code compliance, and permissions must be reviewed by licensed professionals." }, { question: "Do I need an account?", answer: "Not in this preview slice. Session history is held in the browser and can be lost on refresh; persistent accounts are deferred." }, { question: "Can Qattan export DWG?", answer: "The live browser workflow exports editable ASCII DXF files. AutoCAD can open a DXF and save it as DWG when your team is ready." }, { question: "Are the other tools live?", answer: "Every tool in the toolkit is a live engine. Each one runs through the same server-side Gemini image pipeline with tool-specific architectural prompts." }] },
    footer: { description: "Next-Gen AI Architectural & Interior Visualization Studio for clearer design decisions.", product: "Product", resources: "Resources", legal: "Legal", disclaimer: "AI outputs are conceptual and illustrative. Verify all geometry, dimensions, materials, accessibility, heritage constraints, and structural decisions with licensed professionals.", rights: "© 2026 Qattan AI. Built for architectural exploration." },
    studio: { eyebrow: "Qattan workspace", title: "A focused studio for architectural image-making.", description: "Choose a live engine, upload your source, and keep the rest of the workflow in one responsive workspace.", live: "Live engine", planned: "Planned mode", session: "This session only", model: "Gemini image engine · server-side", active: "Active tool", history: "Session history", empty: "Generated outputs will appear here during this session.", result: "Generated output", disclaimer: "Outputs are conceptual studies. Review geometry, dimensions, materials, and code with a licensed professional.", downloadPreview: "Download preview", facade: "Facade Restoration", cad: "Floor Plan to CAD", back: "Back to Qattan AI" },
  },
  ar: {
    brand: "قطان AI",
    tagline: QATTAN_AR_TAGLINE,
    nav: { tools: "الأدوات", solutions: "الحلول", pricing: "الأسعار", studio: "الاستوديو", signIn: "دخول", start: "ابدأ الإنشاء", language: "اللغة", menu: "فتح القائمة", close: "إغلاق القائمة" },
    hero: { eyebrow: "التصور بالذكاء الاصطناعي للعمارة والداخلية", title: "حوّل الفكرة المعمارية إلى صورة جاهزة للعرض.", description: "يساعدك قطان AI على الانتقال من الاسكتش أو المخطط أو صورة الواجهة إلى اتجاه بصري واضح، مع الحفاظ على منطق التصميم.", primary: "أنشئ أول رندر لك", secondary: "استكشف طريقة العمل", freeNote: "معاينة داخل الجلسة · لا يحتاج هذا النموذج إلى حساب أو بطاقة", visualInput: "مدخل التصميم", visualOutput: "دراسة قطان" },
    proof: { eyebrow: "من الفكرة إلى الصورة", title: "شاهد اتجاه التصميم قبل الرندر الطويل.", description: "قارن بين المدخل المعماري الأولي والدراسة البصرية المولدة من خلال شريط تفاعلي مناسب للمس.", before: "قبل", after: "بعد" },
    workflow: { eyebrow: "طريقة عمل أبسط", title: "ثلاث خطوات من الفكرة إلى العرض.", description: "حافظ على دورة الإبداع مركزة: ارفع المصدر، اشرح الرؤية، وراجع النتيجة.", steps: [{ number: "٠١", title: "ارفع المصدر", description: "ابدأ بصورة واجهة أو مخطط أرضي أو اسكتش أو مرجع معماري." }, { number: "٠٢", title: "اشرح الاتجاه", description: "استخدم وصفاً طبيعياً للخامات والإضاءة وأولويات التصميم." }, { number: "٠٣", title: "راجع وصدّر", description: "افحص النتيجة وقارن النسخ وصدّر الملفات التي يدعمها مسارك." }] },
    tools: { eyebrow: "مجموعة أدوات قطان", title: "مساحة واحدة للقرارات البصرية المهمة.", description: "ثمانية محركات حية في مساحة واحدة ومسار صور واحد على الخادم. اختر الأداة، ارفع مصدرك، وتحكم في المخرجات بضبط معماري.", live: "متاح الآن", planned: "مخطط", open: "فتح الأداة", items: toolsAr },
    integrations: { eyebrow: "ينسجم مع طريقتك", title: "استخدم الأدوات التي تعرفها.", description: "صُمم قطان حول مدخلات العمارة ومسارات العرض الشائعة. تكامل قراءة الملفات مباشرة مخطط له؛ ويمكنك الآن رفع الصور المصدرة من أدواتك المفضلة.", items: ["SketchUp", "Revit", "Blender", "Rhino", "AutoCAD", "V-Ray", "Lumion", "Enscape"] },
    pricing: { eyebrow: "الوصول", title: "ابدأ بمسار العمل وتوسع مع الاستوديو.", description: "يجري إعداد نظام الحسابات والأرصدة في قطان بشكل منفصل. هذه النسخة لا تجمع أي مدفوعات وتبقي التوليد على الخادم.", badge: "معاينة خاصة", details: ["جميع أدوات الذكاء الاصطناعي الثماني", "وضع تريبتيك ترميم الواجهات", "تصدير DXF وZIP محلياً", "تنبيه المراجعة المهنية"], action: "افتح الاستوديو" },
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
