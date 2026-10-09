import type { CoreSide } from "../../lib/architect/generate";
import type { SpaceMeasurement } from "../../lib/architect/geometry";

/**
 * Single owner of the workspace's bilingual UI copy. Both the chat sidebar
 * and the plan canvas read from here, and tradeoff text is formatted from
 * measurement facts per locale — the Arabic page never shows an English
 * paragraph (the engine's English `option.summary` is an engine contract,
 * not UI text).
 */

export type ArchitectLocale = "en" | "ar";

export type WorkspaceCopy = {
  title: string;
  intro: string;
  /** Concept-only disclaimer. */
  note: string;
  // Numeric panel
  width: string;
  depth: string;
  share: string;
  side: string;
  east: string;
  west: string;
  numericTitle: string;
  // Canvas
  options: string;
  tradeoff: string;
  areas: string;
  unitA: string;
  unitB: string;
  core: string;
  select: string;
  downloadSvg: string;
  downloadDxf: string;
  errors: string;
  // Chat sidebar
  chatTitle: string;
  chatTab: string;
  planTab: string;
  chatPlaceholder: string;
  send: string;
  sending: string;
  you: string;
  assistant: string;
  workspaceNotice: string;
  undo: string;
  undoDone: string;
  emptyHistory: string;
  fixInputs: string;
  chatError: string;
  unavailable: string;
  costLabel: (credits: number) => string;
  // Option headings
  optionLabel: (index: number) => string;
  coreSideLabel: (side: string) => string;
  previewLabel: (side: string) => string;
};

export const WORKSPACE_COPY: Record<ArchitectLocale, WorkspaceCopy> = {
  en: {
    title: "Architect Workspace",
    intro:
      "Describe a new floor plan or a multi-floor building in chat, or refine the starter layout. Explore each vector plan on the canvas.",
    note:
      "Concept planning only. Room arrangements and areas are nominal, not net usable areas. Setbacks, structure, and Egyptian code compliance are not assessed.",
    width: "Site width (m)",
    depth: "Site depth (m)",
    share: "Unit B area share (%)",
    side: "Preferred core side",
    east: "East",
    west: "West",
    numericTitle: "Direct controls",
    options: "Generated options",
    tradeoff: "Tradeoff",
    areas: "Nominal planning areas",
    unitA: "Unit A",
    unitB: "Unit B",
    core: "Shared core",
    select: "Select option",
    downloadSvg: "Download SVG",
    downloadDxf: "Download DXF",
    errors: "Errors",
    chatTitle: "Plan assistant",
    chatTab: "Chat",
    planTab: "Plan",
    chatPlaceholder: "Describe a plan or a multi-floor building — e.g. “add a bedroom to Unit A”",
    send: "Send",
    sending: "Thinking…",
    you: "You",
    assistant: "Assistant",
    workspaceNotice: "Workspace",
    undo: "Undo last edit",
    undoDone: "Previous plan restored.",
    emptyHistory: "Ask for a change and the applied edit will appear here.",
    fixInputs: "Fix the site values or room program before sending a message.",
    chatError: "The message could not be processed. The plan was not changed.",
    unavailable:
      "The text model is not configured on this server, so chat is unavailable. You can still edit with the direct controls.",
    costLabel: (credits) =>
      credits === 1
        ? "Each message costs 1 credit — direct edits, option switching, and Undo are free."
        : `Each message costs ${credits} credits — direct edits, option switching, and Undo are free.`,
    optionLabel: (index) => `Option ${index}`,
    coreSideLabel: (side) => `Core side: ${side}`,
    previewLabel: (side) => `Plan preview, core on the ${side} side`,
  },
  ar: {
    title: "مساحة العمل المعمارية",
    intro: "احكِ للمساعد عن دور واحد أو مبنى متعدد الأدوار ليقترح مخططات جديدة، أو عدّل التقسيم الأولي وشاهد الرسومات على اللوحة.",
    note:
      "هذا تخطيط تصوّري؛ توزيع الغرف والمساحات تقديري وليس مساحة صافية قابلة للاعتماد. التراجعات والتصميم الإنشائي والتحقق من الكود المصري لم تُفحص بعد.",
    width: "عرض الموقع (م)",
    depth: "عمق الموقع (م)",
    share: "حصة الوحدة B من المساحة (%)",
    side: "جانب النواة المفضل",
    east: "شرق",
    west: "غرب",
    numericTitle: "تحكم مباشر",
    options: "الخيارات المولّدة",
    tradeoff: "المقايضة",
    areas: "مساحات تخطيطية اسميّة",
    unitA: "الوحدة أ",
    unitB: "الوحدة ب",
    core: "النواة المشتركة",
    select: "اختر الخيار",
    downloadSvg: "تنزيل SVG",
    downloadDxf: "تنزيل DXF",
    errors: "الأخطاء",
    chatTitle: "مساعد المخطط",
    chatTab: "المحادثة",
    planTab: "المخطط",
    chatPlaceholder: "صف دورًا أو مبنى متعدد الأدوار — مثال: «أضف غرفة نوم للوحدة أ»",
    send: "إرسال",
    sending: "جارٍ التفكير…",
    you: "أنت",
    assistant: "المساعد",
    workspaceNotice: "مساحة العمل",
    undo: "تراجع عن آخر تعديل",
    undoDone: "تمت استعادة المخطط السابق.",
    emptyHistory: "اطلب تعديلًا وسيظهر التطبيق هنا.",
    fixInputs: "صحّح أبعاد الموقع أو برنامج الغرف قبل إرسال رسالة.",
    chatError: "تعذّر معالجة الرسالة. لم يتغير المخطط.",
    unavailable:
      "نموذج النص غير مُفعّل على هذا الخادم، لذا المحادثة غير متاحة. يمكنك التعديل بأدوات التحكم المباشرة.",
    costLabel: (credits) =>
      credits === 1
        ? "كل رسالة تكلف كريديت واحدًا — التعديلات المباشرة وتبديل الخيارات والتراجع مجانية."
        : `كل رسالة تكلف ${credits} كريديتات — التعديلات المباشرة وتبديل الخيارات والتراجع مجانية.`,
    optionLabel: (index) => `الخيار ${index}`,
    coreSideLabel: (side) => `جانب النواة: ${side}`,
    previewLabel: (side) => `معاينة المخطط، النواة على الجانب ${side}`,
  },
};

const SIDE_WORD: Record<ArchitectLocale, Record<CoreSide, string>> = {
  en: { east: "east", west: "west" },
  ar: { east: "الشرقي", west: "الغربي" },
};

/** Localized core-side word for headings and tradeoffs. */
export function coreSideWord(locale: ArchitectLocale, side: CoreSide): string {
  return SIDE_WORD[locale][side];
}

export type TradeoffFacts = {
  coreSide: CoreSide;
  /** Unit A's cell measured from the generated geometry. */
  unitA: Pick<SpaceMeasurement, "width" | "depth" | "area">;
  /** Unit B's cell (spans the full site width). */
  unitB: Pick<SpaceMeasurement, "width" | "depth" | "area">;
};

/**
 * Formats the option tradeoff from measurement facts in the page's
 * language. Same facts as the generator's English summary template, but
 * owned by the UI so the Arabic page shows Arabic.
 */
export function formatTradeoff(locale: ArchitectLocale, facts: TradeoffFacts): string {
  const area = (value: number) => `${value.toFixed(1)}`;
  const side = coreSideWord(locale, facts.coreSide);
  if (locale === "ar") {
    return (
      `النواة على الجانب ${side}. للوحدة أ عرض ${facts.unitA.width.toFixed(2)} م ومساحة تقديرية ${area(facts.unitA.area)} م². ` +
      `تحتفظ الوحدة ب بواجهة عرضها ${facts.unitB.width.toFixed(2)} م وعمق ${facts.unitB.depth.toFixed(2)} م. ` +
      `اختيار جانب النواة يغيّر موضع المدخل وعلاقة الوحدة أ بحدود الموقع.`
    );
  }
  return (
    `Core on the ${side} side: Unit A is ${facts.unitA.width.toFixed(2)} m wide beside the core ` +
    `(${area(facts.unitA.area)} m2 nominal planning area), Unit B keeps the full ${facts.unitB.width.toFixed(2)} m frontage ` +
    `at ${facts.unitB.depth.toFixed(2)} m depth (${area(facts.unitB.area)} m2); the entrance is through the core's north wall. ` +
    `Tradeoff: the ${side} core shifts the entrance and which property-line facade Unit A shares.`
  );
}
