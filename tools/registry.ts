/**
 * Qattan AI unified tool registry.
 *
 * Single source of truth for the eight studio tools: ids, bilingual copy,
 * control schemas, and prompt assembly. Both the studio UI and the server
 * restore engine consume this module, so it must stay free of React or
 * browser-only imports.
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

export type ToolOption = { value: string; label: { en: string; ar: string } };

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

const opts = (...values: string[]): ToolOption[] =>
  values.map((value) => ({ value, label: { en: value, ar: value } }));

export const QATTAN_TOOLS: QattanTool[] = [
  {
    id: "exterior",
    title: { en: "Exterior AI", ar: "الواجهات بالذكاء الاصطناعي" },
    description: {
      en: "Redesign facades in named architectural styles, lighting conditions, and material palettes. Absorbs the legacy facade restoration triptych.",
      ar: "أعد تصميم الواجهات بأنماط معمارية وظروف إضاءة ولوحات خامات محددة، ويشمل الترميم التراثي الثلاثي.",
    },
    status: "live",
    href: "/studio?mode=exterior",
    promptMode: "facade",
    uploadLabel: { en: "Facade photo or 3D screenshot", ar: "صورة واجهة أو لقطة نموذج ثلاثي الأبعاد" },
    controls: [
      { id: "exteriorStyle", type: "select", label: { en: "Style preset", ar: "الطراز" }, options: opts("Modern", "Neoclassical", "Mediterranean", "Brutalist", "Parametric") },
      { id: "exteriorLighting", type: "select", label: { en: "Lighting", ar: "الإضاءة" }, options: opts("Daylight", "Golden Hour", "Night 2700K", "Overcast") },
      { id: "exteriorMaterial", type: "select", label: { en: "Material palette", ar: "الخامات" }, options: opts("Limestone", "Glass", "Concrete", "Wood") },
    ],
  },
  {
    id: "interior",
    title: { en: "Interior AI", ar: "التصميم الداخلي" },
    description: {
      en: "Furnish and design empty rooms with full control over room type, design style, and color mood.",
      ar: "أثث وصمم الفراغات الفارغة بتحكم كامل في نوع الفراغ وطراز التصميم والمزاج اللوني.",
    },
    status: "live",
    href: "/studio?mode=interior",
    promptMode: "general",
    uploadLabel: { en: "Empty room photo or 3D layout", ar: "صورة غرفة فارغة أو مخطط ثلاثي الأبعاد" },
    controls: [
      { id: "interiorRoom", type: "select", label: { en: "Room type", ar: "نوع الفراغ" }, options: opts("Living Room", "Bedroom", "Kitchen", "Bathroom", "Office", "Restaurant") },
      { id: "interiorStyle", type: "select", label: { en: "Design style", ar: "طراز التصميم" }, options: opts("Modern Luxury", "Japandi", "Scandinavian", "Industrial", "Boho", "Art Deco", "Minimalist") },
      { id: "interiorMood", type: "select", label: { en: "Color mood", ar: "المزاج اللوني" }, options: opts("Warm Neutrals", "Cool Tones", "Bold Colors", "Monochrome") },
    ],
  },
  {
    id: "sketch",
    title: { en: "Sketch to Image", ar: "من الاسكتش إلى الصورة" },
    description: {
      en: "Turn hand-drawn sketches and line drawings into photorealistic building visualizations.",
      ar: "حوّل الاسكتشات اليدوية والرسومات الخطية إلى تصورات معمارية واقعية.",
    },
    status: "live",
    href: "/studio?mode=sketch",
    promptMode: "general",
    uploadLabel: { en: "Hand-drawn sketch or line drawing", ar: "اسكتش يدوي أو رسم خطي" },
    controls: [
      { id: "sketchBuilding", type: "select", label: { en: "Building type", ar: "نوع المبنى" }, options: opts("Residential Villa", "Apartment", "Office Tower", "Cultural Center") },
      { id: "sketchStyle", type: "select", label: { en: "Style preset", ar: "الطراز" }, options: opts("Modern", "Neoclassical", "Mediterranean", "Brutalist", "Parametric") },
      { id: "sketchEnvironment", type: "select", label: { en: "Environment", ar: "البيئة" }, options: opts("Urban", "Suburban", "Coastal", "Desert") },
    ],
  },
  {
    id: "masterplan",
    title: { en: "Masterplan AI", ar: "الماستر بلان" },
    description: {
      en: "Convert 2D site plans and zoning diagrams into aerial bird's-eye 3D visualizations.",
      ar: "حوّل المخططات الأرضية ثنائية الأبعاد إلى تصورات ثلاثية الأبعاد بمنظور علوي.",
    },
    status: "live",
    href: "/studio?mode=masterplan",
    promptMode: "general",
    uploadLabel: { en: "2D site plan or zoning diagram", ar: "مخطط موقع ثنائي الأبعاد أو رسم تقسيم" },
    controls: [
      { id: "masterplanProject", type: "select", label: { en: "Project type", ar: "نوع المشروع" }, options: opts("Residential Compound", "Mixed-Use", "Resort", "University Campus") },
      { id: "masterplanDensity", type: "select", label: { en: "Density", ar: "الكثافة" }, options: opts("Low-rise", "Mid-rise", "High-rise") },
      { id: "masterplanLandscape", type: "select", label: { en: "Landscape style", ar: "طراز المشهد" }, options: opts("Tropical", "Arid", "Mediterranean") },
    ],
  },
  {
    id: "landscape",
    title: { en: "Landscape AI", ar: "المناظر الطبيعية" },
    description: {
      en: "Design luxurious outdoor spaces with feature checklists and planting styles.",
      ar: "صمم مساحات خارجية فاخرة بقوائم مميزات وأنماط زراعة محددة.",
    },
    status: "live",
    href: "/studio?mode=landscape",
    promptMode: "general",
    uploadLabel: { en: "Outdoor space or garden photo", ar: "صورة مساحة خارجية أو حديقة" },
    controls: [
      { id: "landscapeFeatures", type: "multi", label: { en: "Features", ar: "المميزات" }, options: opts("Swimming Pool", "Pergola", "Fire Pit", "Walking Paths", "Water Feature", "Seating Area") },
      { id: "landscapePlantStyle", type: "select", label: { en: "Plant style", ar: "طراز الزراعة" }, options: opts("Tropical", "Desert", "English Garden", "Modern Minimal") },
    ],
  },
  {
    id: "staging",
    title: { en: "Virtual Staging", ar: "التأثيث الافتراضي" },
    description: {
      en: "Stage empty rooms for real estate marketing with market- and style-aware furnishing.",
      ar: "أثث الغرف الفارغة لتسويق العقارات بتأثيث مناسب للسوق والطراز.",
    },
    status: "live",
    href: "/studio?mode=staging",
    promptMode: "general",
    uploadLabel: { en: "Empty apartment or unfurnished room photo", ar: "صورة شقة فارغة أو غرفة غير مفروشة" },
    controls: [
      { id: "stagingMarket", type: "select", label: { en: "Target market", ar: "السوق المستهدف" }, options: opts("Luxury Residential", "Mid-Range", "Student Housing", "Commercial Office") },
      { id: "stagingFurniture", type: "select", label: { en: "Furniture style", ar: "طراز الأثاث" }, options: opts("Contemporary", "Classic", "IKEA-Modern", "Executive") },
    ],
  },
  {
    id: "enhancer",
    title: { en: "Render Enhancer", ar: "تحسين الرندر" },
    description: {
      en: "Push existing renders from V-Ray, Lumion, or Enscape toward photorealistic quality.",
      ar: "طوّر الرندرات الجاهزة من V-Ray أو Lumion أو Enscape نحو جودة واقعية.",
    },
    status: "live",
    href: "/studio?mode=enhancer",
    promptMode: "general",
    uploadLabel: { en: "Existing architectural render", ar: "رندر معماري جاهز" },
    controls: [
      { id: "enhancerLevel", type: "select", label: { en: "Enhancement level", ar: "مستوى التحسين" }, options: opts("Subtle", "Moderate", "Maximum") },
      { id: "enhancerFocus", type: "select", label: { en: "Focus", ar: "محور التحسين" }, options: opts("Materials & Textures", "Lighting & Shadows", "Overall Realism") },
    ],
  },
  {
    id: "floorplan",
    title: { en: "Floor Plan to CAD", ar: "تحويل المخطط إلى كاد" },
    description: {
      en: "Generate four consistent architectural views from a floor plan and export DXF files locally.",
      ar: "ولّد أربعة رسومات معمارية متناسقة من مخطط أرضي وصدّر ملفات DXF محلياً.",
    },
    status: "live",
    href: "/studio?mode=floorplan",
    promptMode: "cad",
    uploadLabel: { en: "Colored 2D or 3D floor plan", ar: "مخطط أرضي ملون ثنائي أو ثلاثي الأبعاد" },
    controls: [],
  },
];

export function getToolById(id: ToolId): QattanTool | undefined {
  return QATTAN_TOOLS.find((tool) => tool.id === id);
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
 * tool's first option so a submission is always fully specified.
 */
export function buildToolPrompt(id: ToolId, values: ToolControlValues): string {
  const tool = getToolById(id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);

  if (tool.id === "floorplan") return FLOORPLAN_PROMPT;

  const pick = (controlId: ToolControlId): string => {
    const control = tool.controls.find((control) => control.id === controlId);
    const fallback = control?.options[0]?.value ?? "";
    const selected = joinValues(valueFor(tool, controlId, values)) ?? fallback;
    return selected;
  };

  switch (tool.id) {
    case "exterior":
      return `Redesign this building exterior in ${pick("exteriorStyle")} architectural style with ${pick("exteriorMaterial")} facade materials under ${pick("exteriorLighting")} lighting conditions. Maintain the exact structural grid, floor count, and window positions. Produce a photorealistic 8K architectural visualization.`;
    case "interior":
      return `Furnish and design this empty interior space as a ${pick("interiorRoom")} in ${pick("interiorStyle")} style with ${pick("interiorMood")} color palette. Add appropriate furniture, lighting fixtures, textiles, and decorative elements. Maintain existing walls, doors, and windows. Produce a photorealistic interior visualization.`;
    case "sketch":
      return `Transform this architectural sketch of a ${pick("sketchBuilding")} into a photorealistic building visualization. Interpret the drawn lines as walls, windows, and structural elements. Apply ${pick("sketchStyle")} architectural style in a ${pick("sketchEnvironment")} setting with professional lighting and landscaping.`;
    case "masterplan":
      return `Convert this 2D site plan into a realistic aerial bird's-eye view 3D visualization. Show buildings at appropriate heights, paved roads, green spaces, water features, and parking areas for a ${pick("masterplanProject")} development with ${pick("masterplanLandscape")} landscaping and ${pick("masterplanDensity")} building density.`;
    case "landscape": {
      const control = tool.controls.find((control) => control.id === "landscapeFeatures");
      const selected = valueFor(tool, "landscapeFeatures", values);
      const features = joinValues(selected) ?? (control?.options[0]?.value ?? "professional landscaping");
      return `Design a luxurious landscape for this outdoor space featuring ${features}. Use ${pick("landscapePlantStyle")} planting with professional hardscape, ambient lighting, and premium outdoor furniture. Produce a photorealistic evening visualization.`;
    }
    case "staging":
      return `Virtually stage this empty room for real estate marketing. Add complete ${pick("stagingFurniture")} furnishing appropriate for ${pick("stagingMarket")}. Include rugs, curtains, artwork, plants, and table accessories. Keep all walls, floors, windows, and doors exactly as they are. The result must look like a real professionally photographed furnished apartment.`;
    case "enhancer":
      return `Enhance this architectural render to photorealistic quality at ${pick("enhancerLevel")} enhancement level. Improve ${pick("enhancerFocus")} with hyper-detailed material textures, accurate light bouncing, realistic reflections, and atmospheric depth. Maintain the exact composition, camera angle, and architectural design. Output at maximum quality.`;
    default:
      throw new Error(`Unknown tool: ${id}`);
  }
}
