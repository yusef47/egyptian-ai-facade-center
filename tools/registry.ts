/**
 * Qattan AI unified tool registry.
 *
 * Single source of truth for the eight studio tools: ids, bilingual copy,
 * control schemas, tool guides, and prompt assembly. Both the studio UI and
 * the server restore engine consume this module, so it must stay free of
 * React or browser-only imports.
 */

export type ToolId =
  | "exterior"
  | "interior"
  | "sketch"
  | "masterplan"
  | "landscape"
  | "staging"
  | "enhancer"
  | "floorplan";

export type ToolControlId =
  | "exteriorStyle"
  | "exteriorLighting"
  | "exteriorMaterial"
  | "interiorRoom"
  | "interiorStyle"
  | "interiorMood"
  | "sketchBuilding"
  | "sketchStyle"
  | "sketchEnvironment"
  | "masterplanProject"
  | "masterplanDensity"
  | "masterplanLandscape"
  | "landscapeFeatures"
  | "landscapePlantStyle"
  | "stagingMarket"
  | "stagingFurniture"
  | "enhancerLevel"
  | "enhancerFocus";

export type ToolPromptMode = "facade" | "cad" | "general";

export type ToolControlType = "select" | "multi";

/** Output presentation modes selectable per generation in the studio. */
export type OutputPresentation = "single" | "gallery" | "triptych";

export const OUTPUT_PRESENTATIONS: OutputPresentation[] = ["single", "gallery", "triptych"];

export const OUTPUT_PRESENTATION_LABELS: Record<OutputPresentation, { en: string; ar: string }> = {
  single: { en: "Single image", ar: "صورة فردية واحدة" },
  gallery: { en: "3 gallery cards", ar: "3 صور منفصلة" },
  triptych: { en: "Triptych board", ar: "لوحة ثلاثية مدمجة" },
};

/** Appended to the brief when the user requests the combined 3-panel board. */
export const TRIPTYCH_DIRECTIVE =
  "Present the final result as ONE cohesive ultra-wide 3-panel triptych presentation board with a 3:1 width-to-height ratio: three side-by-side panels of the same scene separated by thin elegant gold borders, each panel occupying exactly one-third of the total width at full render quality.";

/** Per-card variation hints for the 3-separate-cards gallery mode. */
export const GALLERY_VARIATION_DIRECTIVES = [
  "Design variation 1 of 3: a bold, expressive interpretation of the brief.",
  "Design variation 2 of 3: an alternative material and massing interpretation of the brief.",
  "Design variation 3 of 3: a refined, restrained interpretation of the brief.",
] as const;

export type ToolOption = { value: string; label: { en: string; ar: string } };

export type ToolGuide = {
  input: { en: string; ar: string };
  output: { en: string; ar: string };
  tip: { en: string; ar: string };
};

export type ToolControl = {
  id: ToolControlId;
  type: ToolControlType;
  label: { en: string; ar: string };
  options: ToolOption[];
};

export type QattanTool = {
  id: ToolId;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  status: "live";
  href: string;
  promptMode: ToolPromptMode;
  uploadLabel: { en: string; ar: string };
  guide: ToolGuide;
  controls: ToolControl[];
};

export const TOOL_IDS: ToolId[] = [
  "exterior",
  "interior",
  "sketch",
  "masterplan",
  "landscape",
  "staging",
  "enhancer",
  "floorplan",
];

/** Zero-text four-quadrant CAD prompt shared with the Floor Plan to CAD engine. */
export const FLOORPLAN_PROMPT =
  "Based on this architectural floor plan, generate a single large image divided into a 2x2 grid containing 4 professional architectural drawings. All in black and white clean CAD line art style with sharp thin black lines on pure white background:\n\nTOP-LEFT QUADRANT: Clean 2D CAD floor plan (remove all text labels, keep only walls, doors, windows, stairs as thin black lines)\nTOP-RIGHT QUADRANT: Front elevation drawing showing the building exterior facade with windows, doors, roof, and floor levels\nBOTTOM-LEFT QUADRANT: Architectural cross-section drawing showing interior room heights, floor slabs, cut walls, stairs, and roof structure\nBOTTOM-RIGHT QUADRANT: 3D perspective wireframe line drawing of the building from a 3/4 bird's eye view\n\nDraw thin separator lines between the 4 quadrants. Label each quadrant: PLAN, ELEVATION, SECTION, PERSPECTIVE. All drawings must be consistent with each other and derived from the uploaded floor plan.";

/** Guide copy for the legacy facade restoration triptych engine (mode=facade). */
export const FACADE_GUIDE: ToolGuide = {
  input: {
    en: "Upload a photo of the existing facade you want to restore or redesign.",
    ar: "ارفع صورة الواجهة الحالية التي تريد ترميمها أو تطويرها.",
  },
  output: {
    en: "A 3-panel heritage triptych board — Khedivial Classic, Hashami Biophilic, and Islamic Mashrabiya — as one cohesive 8K image.",
    ar: "لوحة ترميم ثلاثية — كلاسيكي خديوي، وحشمي نباتي، وإسلامي بمشربيات — في صورة 8K واحدة متكاملة.",
  },
  tip: {
    en: "Shoot the facade straight-on in soft daylight for the cleanest triptych geometry.",
    ar: "صوّر الواجهة بشكل مستقيم في ضوء نهار ناعم للحصول على أدق هندسة للتريبتيك.",
  },
};

/** Builds options from [value, en, ar] triples so every option is fully bilingual. */
const opts = (...triples: [string, string, string][]): ToolOption[] =>
  triples.map(([value, en, ar]) => ({ value, label: { en, ar } }));

/**
 * Dr. Ahmed's "complete design freedom" option: every dropdown carries a
 * None (Custom Prompt) choice at index 0. Selecting it omits that preset
 * constraint from the assembled prompt so the user's written brief alone
 * drives the design.
 */
export const NONE_OPTION: ToolOption = {
  value: "none",
  label: { en: "None (Custom Prompt)", ar: "بدون (حسب النص المكتوب)" },
};

const selectOpts = (...triples: [string, string, string][]): ToolOption[] => [
  NONE_OPTION,
  ...opts(...triples),
];

export const QATTAN_TOOLS: QattanTool[] = [
  {
    id: "exterior",
    title: { en: "Exterior AI", ar: "رندر وتطوير الواجهات المعمارية" },
    description: {
      en: "Redesign facades in named architectural styles, lighting conditions, and material palettes. Absorbs the legacy facade restoration triptych.",
      ar: "أعد تصميم الواجهات بأنماط معمارية وظروف إضاءة ولوحات خامات محددة، ويشمل الترميم التراثي الثلاثي.",
    },
    status: "live",
    href: "/studio?mode=exterior",
    promptMode: "facade",
    uploadLabel: { en: "Facade photo or 3D screenshot", ar: "صورة واجهة أو لقطة نموذج ثلاثي الأبعاد" },
    guide: {
      input: {
        en: "Upload a facade photo, a 3D model screenshot, or a clear photo of the building exterior.",
        ar: "ارفع صورة واجهة أو لقطة من نموذج ثلاثي الأبعاد أو صورة واضحة لواجهة المبنى.",
      },
      output: {
        en: "A photorealistic 8K exterior in your chosen style, lighting, and materials — same structural grid, floors, and window rhythm.",
        ar: "واجهة خارجية واقعية بدقة 8K بالطراز والإضاءة والخامات المختارة — مع الحفاظ على الشبكة الإنشائية وإيقاع النوافذ.",
      },
      tip: {
        en: "Use Night 2700K lighting for luxury villa presentations — warm light sells stone.",
        ar: "استخدم إضاءة «ليلي 2700 كلفن» لعروض الفلل الفاخرة — الإضاءة الدافئة تُبرز جمال الحجر.",
      },
    },
    controls: [
      { id: "exteriorStyle", type: "select", label: { en: "Style preset", ar: "الطراز المعماري" }, options: selectOpts(["Modern", "Modern", "حديث"], ["Neoclassical", "Neoclassical", "نيوكلاسيكي"], ["Mediterranean", "Mediterranean", "متوسطي"], ["Brutalist", "Brutalist", "وحشي"], ["Parametric", "Parametric", "بارامتري"]) },
      { id: "exteriorLighting", type: "select", label: { en: "Lighting", ar: "الإضاءة" }, options: selectOpts(["Daylight", "Daylight", "ضوء النهار"], ["Golden Hour", "Golden Hour", "الساعة الذهبية"], ["Night 2700K", "Night 2700K", "ليلي 2700 كلفن"], ["Overcast", "Overcast", "غائم"]) },
      { id: "exteriorMaterial", type: "select", label: { en: "Material palette", ar: "لوحة الخامات" }, options: selectOpts(["Limestone", "Limestone", "حجر جيري"], ["Glass", "Glass", "زجاج"], ["Concrete", "Concrete", "خرسانة"], ["Wood", "Wood", "خشب"]) },
    ],
  },
  {
    id: "interior",
    title: { en: "Interior AI", ar: "التصميم الداخلي والفرش المعماري" },
    description: {
      en: "Furnish and design empty rooms with full control over room type, design style, and color mood.",
      ar: "أثث وصمم الفراغات الفارغة بتحكم كامل في نوع الفراغ وطراز التصميم والمزاج اللوني.",
    },
    status: "live",
    href: "/studio?mode=interior",
    promptMode: "general",
    uploadLabel: { en: "Empty room photo or 3D layout", ar: "صورة غرفة فارغة أو مخطط ثلاثي الأبعاد" },
    guide: {
      input: {
        en: "Upload an empty room photo or a 3D layout view of the space.",
        ar: "ارفع صورة غرفة فارغة أو لقطة مخطط ثلاثي الأبعاد للفراغ.",
      },
      output: {
        en: "A fully furnished photorealistic interior with furniture, lighting fixtures, textiles, and decor — walls, doors, and windows preserved.",
        ar: "تصميم داخلي مفروش بالكامل بواقعية مع الأثاث ووحدات الإضاءة والمنسوجات — مع الحفاظ على الحوائط والأبواب والنوافذ.",
      },
      tip: {
        en: "Photograph the room at chest height with the windows visible for the most believable staging.",
        ar: "التقط صورة الغرفة من مستوى الصدر مع ظهور النوافذ لأكثر النتائج واقعية.",
      },
    },
    controls: [
      { id: "interiorRoom", type: "select", label: { en: "Room type", ar: "نوع الفراغ" }, options: selectOpts(["Living Room", "Living Room", "غرفة معيشة"], ["Bedroom", "Bedroom", "غرفة نوم"], ["Kitchen", "Kitchen", "مطبخ"], ["Bathroom", "Bathroom", "حمام"], ["Office", "Office", "مكتب"], ["Restaurant", "Restaurant", "مطعم"]) },
      { id: "interiorStyle", type: "select", label: { en: "Design style", ar: "طراز التصميم" }, options: selectOpts(["Modern Luxury", "Modern Luxury", "فخامة حديثة"], ["Japandi", "Japandi", "جاباندي"], ["Scandinavian", "Scandinavian", "إسكندنافي"], ["Industrial", "Industrial", "صناعي"], ["Boho", "Boho", "بوهيمي"], ["Art Deco", "Art Deco", "آرت ديكو"], ["Minimalist", "Minimalist", "مينيمالي"]) },
      { id: "interiorMood", type: "select", label: { en: "Color mood", ar: "المزاج اللوني" }, options: selectOpts(["Warm Neutrals", "Warm Neutrals", "محايدات دافئة"], ["Cool Tones", "Cool Tones", "درجات باردة"], ["Bold Colors", "Bold Colors", "ألوان جريئة"], ["Monochrome", "Monochrome", "أحادي اللون"]) },
    ],
  },
  {
    id: "sketch",
    title: { en: "Sketch to Image", ar: "تحويل السكتشات اليدوية لرندر 8K" },
    description: {
      en: "Turn hand-drawn sketches and line drawings into photorealistic building visualizations.",
      ar: "حوّل الاسكتشات اليدوية والرسومات الخطية إلى تصورات معمارية واقعية.",
    },
    status: "live",
    href: "/studio?mode=sketch",
    promptMode: "general",
    uploadLabel: { en: "Hand-drawn sketch or line drawing", ar: "اسكتش يدوي أو رسم خطي" },
    guide: {
      input: {
        en: "Upload a hand-drawn sketch or a digital line drawing of the building.",
        ar: "ارفع اسكتشاً يدوياً أو رسماً خطياً رقمياً للمبنى.",
      },
      output: {
        en: "A photorealistic building visualization that interprets your drawn lines as walls, windows, and structural elements.",
        ar: "تصور معماري واقعي يفسّر خطوط اسكتشك كحوائط ونوافذ وعناصر إنشائية.",
      },
      tip: {
        en: "Darken the main outlines and erase construction guides — cleaner lines mean fewer invented details.",
        ar: "غمّق الخطوط الرئيسية واحذف خطوط البناء المساعدة — كلما كان السكتش أنظف كانت النتيجة أدق.",
      },
    },
    controls: [
      { id: "sketchBuilding", type: "select", label: { en: "Building type", ar: "نوع المبنى" }, options: selectOpts(["Residential Villa", "Residential Villa", "فيلا سكنية"], ["Apartment", "Apartment", "عمارة سكنية"], ["Office Tower", "Office Tower", "برج مكاتب"], ["Cultural Center", "Cultural Center", "مركز ثقافي"]) },
      { id: "sketchStyle", type: "select", label: { en: "Style preset", ar: "الطراز المعماري" }, options: selectOpts(["Modern", "Modern", "حديث"], ["Neoclassical", "Neoclassical", "نيوكلاسيكي"], ["Mediterranean", "Mediterranean", "متوسطي"], ["Brutalist", "Brutalist", "وحشي"], ["Parametric", "Parametric", "بارامتري"]) },
      { id: "sketchEnvironment", type: "select", label: { en: "Environment", ar: "البيئة المحيطة" }, options: selectOpts(["Urban", "Urban", "حضري"], ["Suburban", "Suburban", "ضواحي"], ["Coastal", "Coastal", "ساحلي"], ["Desert", "Desert", "صحراوي"]) },
    ],
  },
  {
    id: "masterplan",
    title: { en: "Masterplan AI", ar: "المخططات العمرانية والمجمعات 3D" },
    description: {
      en: "Convert 2D site plans and zoning diagrams into aerial bird's-eye 3D visualizations.",
      ar: "حوّل المخططات الأرضية ثنائية الأبعاد إلى تصورات ثلاثية الأبعاد بمنظور علوي.",
    },
    status: "live",
    href: "/studio?mode=masterplan",
    promptMode: "general",
    uploadLabel: { en: "2D site plan or zoning diagram", ar: "مخطط موقع ثنائي الأبعاد أو رسم تقسيم" },
    guide: {
      input: {
        en: "Upload a 2D site plan, a CAD layout export, or a zoning diagram.",
        ar: "ارفع مخطط موقع ثنائي الأبعاد أو تصدير CAD أو رسم تقسيم.",
      },
      output: {
        en: "An aerial bird's-eye 3D visualization with realistic building masses, paved roads, green spaces, and parking.",
        ar: "منظور ثلاثي الأبعاد علوي بكتل مبانٍ وطرق ومساحات خضراء ومواقف واقعية.",
      },
      tip: {
        en: "Make sure the plan is high-contrast with readable roads before uploading.",
        ar: "تأكد من وضوح تباين المخطط وقراءة الطرق بسهولة قبل الرفع.",
      },
    },
    controls: [
      { id: "masterplanProject", type: "select", label: { en: "Project type", ar: "نوع المشروع" }, options: selectOpts(["Residential Compound", "Residential Compound", "كمبوند سكني"], ["Mixed-Use", "Mixed-Use", "متعدد الاستخدامات"], ["Resort", "Resort", "منتجع"], ["University Campus", "University Campus", "حرم جامعي"]) },
      { id: "masterplanDensity", type: "select", label: { en: "Density", ar: "الكثافة العمرانية" }, options: selectOpts(["Low-rise", "Low-rise", "مبانٍ منخفضة"], ["Mid-rise", "Mid-rise", "مبانٍ متوسطة"], ["High-rise", "High-rise", "أبراج عالية"]) },
      { id: "masterplanLandscape", type: "select", label: { en: "Landscape style", ar: "طراز المشهد" }, options: selectOpts(["Tropical", "Tropical", "استوائي"], ["Arid", "Arid", "جاف"], ["Mediterranean", "Mediterranean", "متوسطي"]) },
    ],
  },
  {
    id: "landscape",
    title: { en: "Landscape AI", ar: "تنسيق الحدائق والمساحات الخارجية" },
    description: {
      en: "Design luxurious outdoor spaces with feature checklists and planting styles.",
      ar: "صمم مساحات خارجية فاخرة بقوائم مميزات وأنماط زراعة محددة.",
    },
    status: "live",
    href: "/studio?mode=landscape",
    promptMode: "general",
    uploadLabel: { en: "Outdoor space or garden photo", ar: "صورة مساحة خارجية أو حديقة" },
    guide: {
      input: {
        en: "Upload a photo of the outdoor space, garden area, or site boundary.",
        ar: "ارفع صورة المساحة الخارجية أو الحديقة أو حدود الموقع.",
      },
      output: {
        en: "A luxurious landscape design with your chosen features, planting style, hardscape, and ambient evening lighting.",
        ar: "تصميم حدائق فاخر بمميزاتك المختارة وطراز الزراعة والأعمال الصلبة والإضاءة المسائية.",
      },
      tip: {
        en: "Select three to four features at most for one coherent scene.",
        ar: "اختر ثلاث إلى أربع مميزات كحد أقصى لمشهد واحد متناسق.",
      },
    },
    controls: [
      { id: "landscapeFeatures", type: "multi", label: { en: "Features", ar: "المميزات" }, options: opts(["Swimming Pool", "Swimming Pool", "مسبح"], ["Pergola", "Pergola", "بيرجولا"], ["Fire Pit", "Fire Pit", "موقد خارجي"], ["Walking Paths", "Walking Paths", "مسارات مشي"], ["Water Feature", "Water Feature", "عنصر مائي"], ["Seating Area", "Seating Area", "جلسات خارجية"]) },
      { id: "landscapePlantStyle", type: "select", label: { en: "Plant style", ar: "طراز الزراعة" }, options: selectOpts(["Tropical", "Tropical", "استوائي"], ["Desert", "Desert", "صحراوي"], ["English Garden", "English Garden", "حديقة إنجليزية"], ["Modern Minimal", "Modern Minimal", "حداثة بسيطة"]) },
    ],
  },
  {
    id: "staging",
    title: { en: "Virtual Staging", ar: "الفرش الافتراضي للتسويق العقاري" },
    description: {
      en: "Stage empty rooms for real estate marketing with market- and style-aware furnishing.",
      ar: "أثث الغرف الفارغة لتسويق العقارات بتأثيث مناسب للسوق والطراز.",
    },
    status: "live",
    href: "/studio?mode=staging",
    promptMode: "general",
    uploadLabel: { en: "Empty apartment or unfurnished room photo", ar: "صورة شقة فارغة أو غرفة غير مفروشة" },
    guide: {
      input: {
        en: "Upload an empty apartment or unfurnished room photo.",
        ar: "ارفع صورة شقة فارغة أو غرفة غير مفروشة.",
      },
      output: {
        en: "A marketing-ready staged photo with complete furnishing, rugs, curtains, and artwork — the architecture untouched.",
        ar: "صورة تسويقية مؤثثة بالكامل مع سجاد وستائر ولوحات — دون أي تغيير في العمارة.",
      },
      tip: {
        en: "Pick the target market first — a student flat and a luxury penthouse need completely different furniture budgets.",
        ar: "حدد السوق المستهدف أولاً — شقة الطلاب تحتاج تأثيثاً مختلفاً تماماً عن البنتهاوس الفاخر.",
      },
    },
    controls: [
      { id: "stagingMarket", type: "select", label: { en: "Target market", ar: "السوق المستهدف" }, options: selectOpts(["Luxury Residential", "Luxury Residential", "سكني فاخر"], ["Mid-Range", "Mid-Range", "متوسط"], ["Student Housing", "Student Housing", "سكن طلابي"], ["Commercial Office", "Commercial Office", "مكاتب تجارية"]) },
      { id: "stagingFurniture", type: "select", label: { en: "Furniture style", ar: "طراز الأثاث" }, options: selectOpts(["Contemporary", "Contemporary", "معاصر"], ["Classic", "Classic", "كلاسيكي"], ["IKEA-Modern", "IKEA-Modern", "عصري عملي"], ["Executive", "Executive", "تنفيذي"]) },
    ],
  },
  {
    id: "enhancer",
    title: { en: "Render Enhancer", ar: "تحسين جودة وتفاصيل الرندر" },
    description: {
      en: "Push existing renders from V-Ray, Lumion, or Enscape toward photorealistic quality.",
      ar: "طوّر الرندرات الجاهزة من V-Ray أو Lumion أو Enscape نحو جودة واقعية.",
    },
    status: "live",
    href: "/studio?mode=enhancer",
    promptMode: "general",
    uploadLabel: { en: "Existing architectural render", ar: "رندر معماري جاهز" },
    guide: {
      input: {
        en: "Upload an existing render from V-Ray, Lumion, Enscape, or any 3D engine.",
        ar: "ارفع رندراً جاهزاً من V-Ray أو Lumion أو Enscape أو أي محرك ثلاثي الأبعاد.",
      },
      output: {
        en: "A photorealistic enhancement with sharper material textures, accurate light bounce, and atmospheric depth — composition unchanged.",
        ar: "تحسين واقعي بملامس خامات أدق وانعكاسات إضاءة صحيحة وعمق جوي — مع بقاء التكوين كما هو.",
      },
      tip: {
        en: "Use Moderate + Lighting & Shadows for daytime shots to avoid over-sharpened materials.",
        ar: "استخدم «متوسط» مع «الإضاءة والظلال» لمشاهد النهار لتجنّب حدة مبالغ فيها في الخامات.",
      },
    },
    controls: [
      { id: "enhancerLevel", type: "select", label: { en: "Enhancement level", ar: "مستوى التحسين" }, options: selectOpts(["Subtle", "Subtle", "خفيف"], ["Moderate", "Moderate", "متوسط"], ["Maximum", "Maximum", "أقصى"]) },
      { id: "enhancerFocus", type: "select", label: { en: "Focus", ar: "محور التحسين" }, options: selectOpts(["Materials & Textures", "Materials & Textures", "الخامات والملامس"], ["Lighting & Shadows", "Lighting & Shadows", "الإضاءة والظلال"], ["Overall Realism", "Overall Realism", "الواقعية الشاملة"]) },
    ],
  },
  {
    id: "floorplan",
    title: { en: "Floor Plan to CAD", ar: "تحويل المخطط لأوتوكاد DXF" },
    description: {
      en: "Generate four consistent architectural views from a floor plan and export DXF files locally.",
      ar: "ولّد أربعة رسومات معمارية متناسقة من مخطط أرضي وصدّر ملفات DXF محلياً.",
    },
    status: "live",
    href: "/studio?mode=floorplan",
    promptMode: "cad",
    uploadLabel: { en: "Colored 2D or 3D floor plan", ar: "مخطط أرضي ملون ثنائي أو ثلاثي الأبعاد" },
    guide: {
      input: {
        en: "Upload a colored 2D floor plan, a CAD export, or a 3D plan screenshot.",
        ar: "ارفع مخططاً أرضياً ملوناً أو تصدير CAD أو لقطة مخطط ثلاثي الأبعاد.",
      },
      output: {
        en: "A 2×2 board of four consistent CAD views (plan, elevation, section, perspective) ready for DXF vectorization.",
        ar: "لوحة 2×2 بأربعة رسومات CAD متناسقة (مسقط وواجهة ومقطع ومنظور) جاهزة للتحويل إلى DXF.",
      },
      tip: {
        en: "Clean, text-free plans vectorize best — the engine strips labels automatically.",
        ar: "المخططات النظيفة الخالية من النصوص تُحوَّل بأفضل دقة — المحرك يزيل الكتابات تلقائياً.",
      },
    },
    controls: [],
  },
];

export function getToolById(id: ToolId): QattanTool | undefined {
  return QATTAN_TOOLS.find((tool) => tool.id === id);
}

/** Any legacy studio mode plus the unified registry tool ids. */
export type StudioModeInput = ToolId | "facade" | "cad";

const LEGACY_MODE_MAP: Record<string, ToolId> = { cad: "floorplan" };

/**
 * Normalizes legacy deep links: /studio?mode=facade keeps the heritage
 * triptych engine, /studio?mode=cad maps onto the unified floorplan tool,
 * and every registry id passes through unchanged. Unknown values fall
 * back to the default exterior workspace.
 *
 * Lives in this pure module (no React or browser imports) so both Server
 * Components and Client Components can call it without crossing the
 * Server-Client boundary incorrectly.
 */
export function resolveStudioMode(mode: StudioModeInput | string): ToolId | "facade" {
  if (mode === "facade") return "facade";
  const mapped = LEGACY_MODE_MAP[mode];
  if (mapped) return mapped;
  return getToolById(mode as ToolId) ? (mode as ToolId) : "exterior";
}

export type ToolControlValues = Partial<Record<ToolControlId, string | string[]>>;

function valueFor(tool: QattanTool, controlId: ToolControlId, values: ToolControlValues): string | string[] | undefined {
  return values[controlId];
}

function joinValues(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : undefined;
  return value;
}

/**
 * Assembles the final architectural prompt for a tool from the user's control
 * selections. Unknown tool ids throw; missing selections fall back to the
 * tool's first non-None option so a submission is always fully specified —
 * while an explicit "None (Custom Prompt)" selection omits that preset
 * constraint entirely and leaves the decision to the user's written brief.
 *
 * Prompts are always assembled from English option values — they are model
 * instructions, while bilingual labels are display-only.
 */
export function buildToolPrompt(id: ToolId, values: ToolControlValues): string {
  const tool = getToolById(id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);

  if (tool.id === "floorplan") return FLOORPLAN_PROMPT;

  const pickOrNull = (controlId: ToolControlId): string | null => {
    const control = tool.controls.find((item) => item.id === controlId);
    const selected = joinValues(valueFor(tool, controlId, values));
    if (selected === "none") return null;
    if (selected !== undefined) return selected;
    return control?.options.find((option) => option.value !== NONE_OPTION.value)?.value ?? null;
  };

  switch (tool.id) {
    case "exterior": {
      const style = pickOrNull("exteriorStyle");
      const material = pickOrNull("exteriorMaterial");
      const lighting = pickOrNull("exteriorLighting");
      let sentence = "Redesign this building exterior";
      if (style) sentence += ` in ${style} architectural style`;
      if (material) sentence += ` with ${material} facade materials`;
      if (lighting) sentence += ` under ${lighting} lighting conditions`;
      return `${sentence}. Maintain the exact structural grid, floor count, and window positions. Produce a photorealistic 8K architectural visualization.`;
    }
    case "interior": {
      const room = pickOrNull("interiorRoom");
      const style = pickOrNull("interiorStyle");
      const mood = pickOrNull("interiorMood");
      let sentence = "Furnish and design this empty interior space";
      if (room) sentence += ` as a ${room}`;
      if (style) sentence += ` in ${style} style`;
      if (mood) sentence += ` with ${mood} color palette`;
      return `${sentence}. Add appropriate furniture, lighting fixtures, textiles, and decorative elements. Maintain existing walls, doors, and windows. Produce a photorealistic interior visualization.`;
    }
    case "sketch": {
      const building = pickOrNull("sketchBuilding");
      const style = pickOrNull("sketchStyle");
      const environment = pickOrNull("sketchEnvironment");
      let sentence = "Transform this architectural sketch";
      if (building) sentence += ` of a ${building}`;
      sentence += " into a photorealistic building visualization. Interpret the drawn lines as walls, windows, and structural elements.";
      if (style || environment) {
        sentence += " Apply";
        if (style) sentence += ` ${style} architectural style`;
        if (environment) sentence += ` in a ${environment} setting`;
        sentence += " with professional lighting and landscaping.";
      } else {
        sentence += " Derive the architectural style and surrounding setting from the user's written brief, with professional lighting and landscaping.";
      }
      return sentence;
    }
    case "masterplan": {
      const project = pickOrNull("masterplanProject");
      const density = pickOrNull("masterplanDensity");
      const landscape = pickOrNull("masterplanLandscape");
      let tail = "";
      if (landscape && density) tail = ` with ${landscape} landscaping and ${density} building density`;
      else if (landscape) tail = ` with ${landscape} landscaping`;
      else if (density) tail = ` with ${density} building density`;
      if (project) tail = ` for a ${project} development${tail}`;
      return `Convert this 2D site plan into a realistic aerial bird's-eye view 3D visualization. Show buildings at appropriate heights, paved roads, green spaces, water features, and parking areas${tail}.`;
    }
    case "landscape": {
      const control = tool.controls.find((item) => item.id === "landscapeFeatures");
      const selected = valueFor(tool, "landscapeFeatures", values);
      const features = joinValues(selected) ?? (control?.options.find((option) => option.value !== NONE_OPTION.value)?.value ?? "professional landscaping");
      const plant = pickOrNull("landscapePlantStyle");
      return `Design a luxurious landscape for this outdoor space featuring ${features}. Use ${plant ? `${plant} planting` : "professional planting"} with professional hardscape, ambient lighting, and premium outdoor furniture. Produce a photorealistic evening visualization.`;
    }
    case "staging": {
      const furniture = pickOrNull("stagingFurniture");
      const market = pickOrNull("stagingMarket");
      const furnishing = furniture ? `complete ${furniture} furnishing` : "complete professional furnishing";
      const marketClause = market ? ` appropriate for ${market}` : "";
      return `Virtually stage this empty room for real estate marketing. Add ${furnishing}${marketClause}. Include rugs, curtains, artwork, plants, and table accessories. Keep all walls, floors, windows, and doors exactly as they are. The result must look like a real professionally photographed furnished apartment.`;
    }
    case "enhancer": {
      const level = pickOrNull("enhancerLevel");
      const focus = pickOrNull("enhancerFocus");
      const levelClause = level ? ` at ${level} enhancement level` : "";
      return `Enhance this architectural render to photorealistic quality${levelClause}. Improve ${focus ?? "overall realism"} with hyper-detailed material textures, accurate light bouncing, realistic reflections, and atmospheric depth. Maintain the exact composition, camera angle, and architectural design. Output at maximum quality.`;
    }
    default:
      throw new Error(`Unknown tool: ${id}`);
  }
}
