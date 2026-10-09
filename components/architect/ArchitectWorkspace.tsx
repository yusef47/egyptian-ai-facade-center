"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  applyBriefPatch,
  toLayoutBrief,
  type WorkspaceBrief,
} from "../../lib/architect/brief-patch";
import { generateLayout, type LayoutError } from "../../lib/architect/generate";
import {
  applyRoomActions,
  buildRoomPlan,
  defaultRoomProgram,
  type RoomProgram,
} from "../../lib/architect/room-plan";
import {
  PROJECT_DRAFT_STORAGE_KEY,
  createProjectDraft,
  parseProjectDraft,
} from "../../lib/architect/project-draft";
import {
  interpretArchitectMessage,
  getArchitectChatStatus,
  ArchitectChatError,
  type ArchitectChatStatus,
} from "../../client/src/lib/architect-chat";
import { WORKSPACE_COPY, type ArchitectLocale } from "./architect-copy";
import { PlanCanvas, buildPlanCards } from "./PlanCanvas";
import {
  compileDesignProposal,
  designMatchesSite,
  type BuildingProposal,
  type DesignProposal,
} from "../../lib/architect/building-proposal";
import { ConceptCanvas } from "./ConceptCanvas";
import { BuildingConceptCanvas } from "./BuildingConceptCanvas";
import { DEFAULT_WALL_MESH_PRESET, type WallMeshPreset } from "../../lib/architect/wall-mesh";

/** Some embedded browsers expose File without Blob.text(); keep local imports usable there. */
async function readProjectFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    try {
      const content = await file.text();
      if (content) return content;
    } catch {
      // Fall back to FileReader below.
    }
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Empty file result"));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsText(file);
  });
}

/**
 * Conversational Architect Workspace: a chat sidebar beside a large live
 * plan canvas (stacked with a tab switcher on mobile).
 *
 * State ownership — this component owns everything interactive:
 * - the brief lives as the four direct-control inputs (strings + coreSide);
 *   every plan on canvas is DERIVED from them via generateLayout, so a
 *   patch (AI) and a typed correction take exactly the same path;
 * - a patch is committed only through applyBriefPatch (pure) — invalid or
 *   infeasible changes leave inputs, plan, and history untouched;
 * - undoStack holds the input snapshots taken before each applied AI edit;
 * - chat history, pending/error state, and the model availability probe.
 *
 * Only `interpretArchitectMessage` talks to the server; local controls,
 * option switching, and Undo never reach the model or the credit ledger.
 */

type OptionNumber = 1 | 2;

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Local workspace notice (e.g. Undo) — never presented as a model reply. */
  notice?: boolean;
};

type InputSnapshot = {
  widthInput: string;
  depthInput: string;
  shareInput: string;
  coreSide: "east" | "west";
  roomProgram: RoomProgram;
  activeMode: "template" | "concept";
  conceptProposal: DesignProposal | null;
  wallMeshPreset: WallMeshPreset;
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-white/15 bg-[#182226] px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-[#d4af37] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-50";

function ErrorList({ messages, id }: { messages: string[]; id: string }) {
  if (messages.length === 0) return null;
  return (
    <div id={id} role="alert" className="mt-1 space-y-1 text-sm font-medium text-rose-300">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}

export default function ArchitectWorkspace({ locale }: { locale: ArchitectLocale }) {
  const copy = WORKSPACE_COPY[locale];
  const rtl = locale === "ar";

  // ── Direct controls: the single owner of the brief ────────────────────
  const [widthInput, setWidthInput] = useState("12");
  const [depthInput, setDepthInput] = useState("20");
  const [shareInput, setShareInput] = useState("50");
  const [coreSide, setCoreSide] = useState<"east" | "west">("east");
  const [roomProgram, setRoomProgram] = useState<RoomProgram>(defaultRoomProgram);
  const [selected, setSelected] = useState<OptionNumber>(1);
  const [activeMode, setActiveMode] = useState<"template" | "concept">("template");
  const [conceptProposal, setConceptProposal] = useState<DesignProposal | null>(null);
  const [wallMeshPreset, setWallMeshPreset] = useState<WallMeshPreset>(DEFAULT_WALL_MESH_PRESET);
  const [projectName, setProjectName] = useState(locale === "ar" ? "مشروع جديد" : "New project");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  // ── Chat state ────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [status, setStatus] = useState<ArchitectChatStatus | null>(null);
  const [undoStack, setUndoStack] = useState<InputSnapshot[]>([]);
  const [mobileView, setMobileView] = useState<"chat" | "plan">("chat");
  const messageIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const brief: WorkspaceBrief = useMemo(
    () => ({
      siteWidth: Number(widthInput),
      siteDepth: Number(depthInput),
      unitBSharePercent: Number(shareInput),
      coreSide,
    }),
    [widthInput, depthInput, shareInput, coreSide],
  );

  // Every plan on the canvas derives from the brief through the SAME
  // mapping the patch contract uses — AI edits and typed edits are one path.
  const result = useMemo(() => generateLayout(toLayoutBrief(brief)), [brief]);
  const roomPlansFit = useMemo(
    () => result.ok && result.options.every((option) =>
      buildRoomPlan(option.geometry, roomProgram, option.coreSide).ok
    ),
    [result, roomProgram],
  );

  const groupedErrors = useMemo(() => {
    const grouped: Record<"site" | "share" | "side" | "general", string[]> = {
      site: [],
      share: [],
      side: [],
      general: [],
    };
    if (!result.ok) {
      for (const error of result.errors as LayoutError[]) grouped[fieldFor(error)].push(error.message);
    }
    return grouped;
  }, [result]);

  const cards = useMemo(
    () => (result.ok ? buildPlanCards(result.options, locale) : []),
    [result, locale],
  );
  const compiledConcept = useMemo(
    () => conceptProposal ? compileDesignProposal(conceptProposal) : null,
    [conceptProposal],
  );
  const conceptMatchesBrief = conceptProposal !== null
    && designMatchesSite(conceptProposal, brief.siteWidth, brief.siteDepth);
  const portableDraft = useMemo(
    () => createProjectDraft(projectName, brief, roomProgram, selected, activeMode, conceptProposal, wallMeshPreset),
    [projectName, brief, roomProgram, selected, activeMode, conceptProposal, wallMeshPreset],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY);
      if (raw) {
        const saved = parseProjectDraft(JSON.parse(raw));
        if (saved) {
          setProjectName(saved.name);
          setWidthInput(String(saved.brief.siteWidth));
          setDepthInput(String(saved.brief.siteDepth));
          setShareInput(String(saved.brief.unitBSharePercent));
          setCoreSide(saved.brief.coreSide);
          setRoomProgram(saved.roomProgram);
          setSelected(saved.selectedOption);
          setActiveMode(saved.activeMode);
          setConceptProposal(saved.conceptProposal);
          setWallMeshPreset(saved.wallMeshPreset);
        }
      }
    } catch {
      // Browser storage can be unavailable; the workspace still works.
    }
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated || !portableDraft) return;
    try {
      window.localStorage.setItem(PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(portableDraft));
    } catch {
      // Manual JSON export remains available if browser storage is full.
    }
  }, [draftHydrated, portableDraft]);

  // Probe model availability once on mount (read-only, no credits).
  useEffect(() => {
    let alive = true;
    getArchitectChatStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Keep the newest message visible.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, chatError]);

  const snapshot = (): InputSnapshot => ({
    widthInput, depthInput, shareInput, coreSide,
    roomProgram: structuredClone(roomProgram), activeMode,
    conceptProposal: conceptProposal ? structuredClone(conceptProposal) : null,
    wallMeshPreset: { ...wallMeshPreset },
  });

  const restore = (snap: InputSnapshot) => {
    setWidthInput(snap.widthInput);
    setDepthInput(snap.depthInput);
    setShareInput(snap.shareInput);
    setCoreSide(snap.coreSide);
    setRoomProgram(snap.roomProgram);
    setActiveMode(snap.activeMode);
    setConceptProposal(snap.conceptProposal);
    setWallMeshPreset(snap.wallMeshPreset);
  };

  const importProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) {
      setDraftNotice(locale === "ar" ? "ملف المشروع أكبر من الحد المسموح." : "Project file is too large.");
      return;
    }
    try {
      const parsed = parseProjectDraft(JSON.parse(await readProjectFileText(file)));
      if (!parsed) throw new Error("Invalid project draft");
      setProjectName(parsed.name);
      setWidthInput(String(parsed.brief.siteWidth));
      setDepthInput(String(parsed.brief.siteDepth));
      setShareInput(String(parsed.brief.unitBSharePercent));
      setCoreSide(parsed.brief.coreSide);
      setRoomProgram(parsed.roomProgram);
      setSelected(parsed.selectedOption);
      setActiveMode(parsed.activeMode);
      setConceptProposal(parsed.conceptProposal);
      setWallMeshPreset(parsed.wallMeshPreset);
      setUndoStack([]);
      setMessages([]);
      setDraft("");
      setChatError(null);
      setDraftNotice(locale === "ar" ? "تم فتح المشروع والتحقق من هندسته." : "Project opened and its geometry checked.");
    } catch {
      setDraftNotice(locale === "ar" ? "ملف المشروع غير صالح أو لا يلائم المحرك الحالي." : "Invalid project file or incompatible geometry.");
    }
  };

  const appendMessage = (role: ChatMessage["role"], text: string, notice = false) => {
    messageIdRef.current += 1;
    setMessages((previous) => [...previous, { id: messageIdRef.current, role, text, notice }]);
  };

  const canSend =
    !pending &&
    result.ok &&
    roomPlansFit &&
    draft.trim().length > 0 &&
    status?.available !== false;

  const send = async () => {
    const message = draft.trim();
    if (!canSend || !result.ok) return;

    appendMessage("user", message);
    setDraft("");
    setPending(true);
    setChatError(null);

    const history = messages
      .filter((entry) => !entry.notice)
      .map((entry) => ({ role: entry.role, content: entry.text }));

    try {
      const { outcome } = await interpretArchitectMessage({
        message, brief, roomProgram,
        wallMeshPreset,
        ...(activeMode === "concept" && conceptProposal ? { conceptProposal } : {}),
        history,
      });
      if (outcome.type === "patch" && outcome.patch) {
        const applied = applyBriefPatch(brief, outcome.patch);
        if (applied.ok && applied.result.options.every((option) =>
          buildRoomPlan(option.geometry, roomProgram, option.coreSide).ok
        )) {
          // Commit only after generation succeeded; keep the previous plan
          // reachable through Undo.
          setUndoStack((stack) => [...stack, snapshot()]);
          setWidthInput(String(applied.brief.siteWidth));
          setDepthInput(String(applied.brief.siteDepth));
          setShareInput(String(applied.brief.unitBSharePercent));
          setCoreSide(applied.brief.coreSide);
          appendMessage("assistant", outcome.reply);
        } else {
          // Server re-validated this patch, so this is a defensive branch:
          // the plan stays unchanged and the user is told honestly.
          setChatError(copy.chatError);
        }
      } else if (outcome.type === "room_actions" && outcome.actions) {
        const applied = applyRoomActions(roomProgram, outcome.actions, result.options);
        if (applied.ok) {
          setUndoStack((stack) => [...stack, snapshot()]);
          setRoomProgram(applied.program);
          appendMessage("assistant", outcome.reply);
        } else {
          setChatError(copy.chatError);
        }
      } else if (outcome.type === "concept" && outcome.proposal) {
        const compiled = compileDesignProposal(outcome.proposal);
        const dropsBuilding = compiled.ok && activeMode === "concept" && compiledConcept?.ok
          && compiledConcept.kind === "building" && compiled.kind === "floor";
        if (compiled.ok && !dropsBuilding && designMatchesSite(compiled.proposal, brief.siteWidth, brief.siteDepth)) {
          setUndoStack((stack) => [...stack, snapshot()]);
          setConceptProposal(compiled.proposal);
          setActiveMode("concept");
          setMobileView("plan");
          appendMessage("assistant", outcome.reply);
        } else {
          setChatError(copy.chatError);
        }
      } else {
        appendMessage("assistant", outcome.reply);
      }
    } catch (error) {
      if (error instanceof ArchitectChatError) {
        if (error.code === "TEXT_MODEL_UNAVAILABLE") {
          setStatus({ available: false, cost: status?.cost ?? 1 });
        }
        setChatError(error.message);
      } else {
        setChatError(copy.chatError);
      }
    } finally {
      setPending(false);
    }
  };

  const undo = () => {
    if (pending) return;
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    restore(previous);
    setUndoStack((stack) => stack.slice(0, -1));
    appendMessage("assistant", copy.undoDone, true);
  };

  const applyBuildingEdit = (proposal: BuildingProposal) => {
    if (pending) return;
    const checked = compileDesignProposal(proposal);
    if (!checked.ok || checked.kind !== "building" || !designMatchesSite(checked.proposal, brief.siteWidth, brief.siteDepth)) return;
    setUndoStack((stack) => [...stack, snapshot()]);
    setConceptProposal(checked.proposal);
    appendMessage("assistant", locale === "ar" ? "تم تعديل شبكة التنسيق وفحص مواقع العناصر. التعديل قابل للتراجع ومجاني." : "Structural coordination grid updated and checked. This free edit can be undone.", true);
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const unavailable = status?.available === false;
  const cost = status?.cost ?? 1;
  const showFixHint =
    (!result.ok && (groupedErrors.site.length > 0 || groupedErrors.share.length > 0 || groupedErrors.side.length > 0)) || !roomPlansFit;

  return (
    <main
      lang={locale}
      dir={rtl ? "rtl" : "ltr"}
      className="min-h-screen bg-[#090e11] px-3 py-5 text-slate-100 sm:px-6 sm:py-7"
      style={{ backgroundImage: "radial-gradient(circle at 50% -20%,rgba(212,175,55,.13),transparent 40%),radial-gradient(circle at 100% 30%,rgba(42,96,101,.12),transparent 35%)" }}
    >
      <header className="mx-auto mb-5 max-w-[1600px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#e7c76b]/50 bg-gradient-to-br from-[#e7c76b] to-[#a87a25] text-xl font-black text-[#101719] shadow-[0_10px_28px_rgba(212,175,55,.2)]">Q</span>
            <div>
              <p className="text-[11px] font-bold tracking-[.24em] text-[#d4af37]">QATTAN AI / ARCHITECT</p>
              <h1 className="mt-0.5 text-2xl font-bold text-white sm:text-3xl">{copy.title}</h1>
            </div>
          </div>
          <div className="rounded-full border border-[#d4af37]/25 bg-[#d4af37]/10 px-4 py-1.5 text-xs font-semibold text-[#ebd497]">
            {locale === "ar" ? "بيئة تصميم تجريبية" : "Concept design workspace"}
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{copy.intro}</p>
        <p className="mt-3 border-s-2 border-[#d4af37]/60 ps-3 text-xs leading-6 text-slate-400">{copy.note}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-[#11191d]/90 p-3">
          <label className="min-w-48 flex-1 text-xs font-semibold text-slate-300">
            {locale === "ar" ? "اسم المشروع" : "Project name"}
            <input
              type="text"
              maxLength={80}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/15 bg-[#182226] px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            />
          </label>
          <a
            role="link"
            aria-disabled={!portableDraft}
            href={portableDraft ? "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(portableDraft, null, 2)) : undefined}
            download="qattan-architect-project.json"
            className="rounded-lg border border-[#d4af37]/50 px-3 py-2 text-xs font-bold text-[#e7d394] aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          >
            {locale === "ar" ? "تنزيل المشروع" : "Download project"}
          </a>
          <label className="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white hover:border-[#d4af37]/50">
            {locale === "ar" ? "فتح مشروع" : "Open project"}
            <input type="file" accept="application/json,.json" disabled={pending} onChange={(event) => { void importProjectFile(event); }} className="sr-only" />
          </label>
          <span className="text-xs text-slate-400">{locale === "ar" ? "المسودة تُحفظ في هذا المتصفح" : "Draft saved in this browser"}</span>
        </div>
        {draftNotice ? <p role="status" className="mt-2 text-xs text-[#e7d394]">{draftNotice}</p> : null}
      </header>

      {/* Mobile: switch between chat and plan. Desktop: both visible. */}
      <div className="mx-auto mb-4 flex max-w-[1600px] gap-2 lg:hidden" aria-label={copy.title}>
        {(["chat", "plan"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mobileView === view}
            onClick={() => setMobileView(view)}
            className={
              mobileView === view
                ? "rounded-xl bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#101719]"
                : "rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300"
            }
          >
            {view === "chat" ? copy.chatTab : copy.planTab}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1600px] items-start gap-5 lg:grid-cols-[minmax(310px,370px)_minmax(0,1fr)]">
        {/* ── Conversation sidebar ──────────────────────────────────── */}
        <section
          aria-label={copy.chatTitle}
          className={`${mobileView === "chat" ? "flex" : "hidden"} min-h-[620px] flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#11191d] shadow-[0_24px_80px_rgba(0,0,0,.25)] lg:sticky lg:top-5 lg:flex lg:h-[calc(100vh-2.5rem)]`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] font-bold tracking-[.2em] text-[#d4af37]">{locale === "ar" ? "مساحة الحوار" : "CONVERSATION"}</p>
              <h2 className="mt-1 text-lg font-bold text-white">{copy.chatTitle}</h2>
            </div>
            <button
              type="button"
              onClick={undo}
              disabled={pending || undoStack.length === 0}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 enabled:hover:border-[#d4af37]/60 disabled:opacity-40"
            >
              {copy.undo}
            </button>
          </div>

          <p className="border-b border-white/10 px-5 py-3 text-xs leading-6 text-slate-400">
            {copy.costLabel(cost)}
          </p>

          {unavailable ? (
            <p
              role="status"
              className="mx-4 mt-4 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 py-3 text-sm leading-6 text-[#ebd497]"
            >
              {activeMode === "concept"
                ? locale === "ar"
                  ? "نموذج النص غير مُفعّل على هذا الخادم. يمكنك عرض المخطط الحر وتصديره، وفتح التقسيم الأولي للتعديل المباشر."
                  : "The text model is not configured. You can view and export this concept, or open the starter layout for direct edits."
                : copy.unavailable}
            </p>
          ) : null}

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-label={copy.chatTitle}
            className="min-h-40 flex-1 space-y-3 overflow-y-auto px-4 py-5"
          >
            {messages.length === 0 && !pending ? (
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2a2d] to-[#142024] p-5">
                <span aria-hidden="true" className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 text-lg text-[#d4af37]">✦</span>
                <p className="text-sm font-semibold leading-7 text-slate-200">{copy.emptyHistory}</p>
                <p className="mt-3 text-xs leading-6 text-slate-400">{locale === "ar" ? "مثال: اقترح مبنى من دورين بنواة سلم ثابتة، ومعيشة في الأرضي وغرف نوم في الأول." : "Example: propose a two-floor building with an aligned stair core, living space on the ground floor and bedrooms above."}</p>
              </div>
            ) : null}
            {messages.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.role === "user"
                    ? "ml-6 rounded-xl bg-[#d4af37] px-3 py-2 text-sm text-[#101719]"
                    : entry.notice
                      ? "mr-6 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm italic text-slate-300"
                      : "mr-6 rounded-xl border border-white/10 bg-[#1b292d] px-3 py-2 text-sm text-slate-100"
                }
              >
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide opacity-70">
                  {entry.role === "user"
                    ? copy.you
                    : entry.notice
                      ? copy.workspaceNotice
                      : copy.assistant}
                </span>
                {entry.text}
              </div>
            ))}
            {pending ? (
              <p role="status" aria-busy="true" className="mr-6 rounded-xl bg-white/5 px-3 py-2 text-sm italic text-slate-300">
                {copy.sending}
              </p>
            ) : null}
            {chatError ? (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-medium text-rose-200">
                {chatError}
              </p>
            ) : null}
          </div>

          <form
            className="border-t border-white/10 bg-[#10181b] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {showFixHint ? (
              <p className="mb-2 text-sm font-medium text-[#ebd497]">{copy.fixInputs}</p>
            ) : null}
            <label className="block text-sm font-semibold text-slate-200">
              {copy.chatTitle}
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onDraftKeyDown}
                rows={3}
                maxLength={1500}
                placeholder={copy.chatPlaceholder}
                disabled={unavailable}
                className={`${inputClassName} resize-y`}
              />
            </label>
            <button
              type="submit"
              disabled={!canSend}
              className="mt-3 w-full rounded-xl bg-[#d4af37] px-4 py-2.5 text-sm font-bold text-[#101719] enabled:hover:bg-[#e7c76b] disabled:opacity-40"
            >
              {copy.send}
            </button>
          </form>
        </section>

        {/* ── Plan canvas ───────────────────────────────────────────── */}
        <section
          aria-label={copy.planTab}
          className={`${mobileView === "plan" ? "block" : "hidden"} min-w-0 space-y-4 lg:block`}
        >
          {conceptProposal ? (
            <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#11191d] p-2">
              <button type="button" aria-pressed={activeMode === "concept"} onClick={() => setActiveMode("concept")} disabled={pending || !conceptMatchesBrief} className={activeMode === "concept" ? "rounded-lg bg-[#d4af37] px-4 py-2 text-xs font-bold text-[#101719]" : "rounded-lg px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"}>{locale === "ar" ? "المخطط الحر" : "Original concept"}</button>
              <button type="button" aria-pressed={activeMode === "template"} onClick={() => setActiveMode("template")} disabled={pending} className={activeMode === "template" ? "rounded-lg bg-[#d4af37] px-4 py-2 text-xs font-bold text-[#101719]" : "rounded-lg px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5"}>{locale === "ar" ? "التقسيم الأولي" : "Starter layout"}</button>
              {!conceptMatchesBrief ? <p className="w-full px-2 text-xs text-amber-200">{locale === "ar" ? "تغيّرت أبعاد الأرض. ارجع للأبعاد السابقة أو اطلب مخططًا حرًا جديدًا لهذه الأرض." : "Site dimensions changed. Restore the previous dimensions or request a new original concept."}</p> : null}
            </div>
          ) : null}
          {activeMode === "concept" && compiledConcept?.ok ? (
            compiledConcept.kind === "building"
              ? <BuildingConceptCanvas building={compiledConcept} locale={locale} wallMeshPreset={wallMeshPreset} onWallMeshPresetChange={setWallMeshPreset} onBuildingChange={applyBuildingEdit} editingDisabled={pending} />
              : <ConceptCanvas geometry={compiledConcept.geometry} proposal={compiledConcept.proposal} locale={locale} />
          ) : (
          <>
          {/* Compact direct controls — correct an AI interpretation here. */}
          <details open className="rounded-[1.4rem] border border-white/10 bg-[#11191d] p-4 shadow-[0_12px_36px_rgba(0,0,0,.18)] sm:p-5">
            <summary className="cursor-pointer font-bold text-white">{copy.numericTitle}<span className="mx-2 text-xs font-normal text-slate-400">{locale === "ar" ? "عدّل الأرقام وشاهد المخطط يتغير" : "Change values to update the plan"}</span></summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-300">
                {copy.width}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="1"
                  value={widthInput}
                  disabled={pending}
                  onChange={(event) => setWidthInput(event.target.value)}
                  aria-describedby={groupedErrors.site.length > 0 ? "site-errors" : undefined}
                  className={inputClassName}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                {copy.depth}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="1"
                  value={depthInput}
                  disabled={pending}
                  onChange={(event) => setDepthInput(event.target.value)}
                  aria-describedby={groupedErrors.site.length > 0 ? "site-errors" : undefined}
                  className={inputClassName}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                {copy.share}
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  max="99"
                  value={shareInput}
                  disabled={pending}
                  onChange={(event) => setShareInput(event.target.value)}
                  aria-describedby={groupedErrors.share.length > 0 ? "share-errors" : undefined}
                  className={inputClassName}
                />
              </label>
              <fieldset
                aria-describedby={groupedErrors.side.length > 0 ? "side-errors" : undefined}
                className="rounded-xl border border-white/15 px-3 pb-3 pt-2"
              >
                <legend className="px-1 text-sm font-semibold text-slate-300">{copy.side}</legend>
                <div className="flex gap-6 pt-1">
                  {(["east", "west"] as const).map((side) => (
                    <label key={side} className="flex items-center gap-2 text-base">
                      <input
                        type="radio"
                        name="architect-core-side"
                        value={side}
                        checked={coreSide === side}
                        disabled={pending}
                        onChange={() => setCoreSide(side)}
                        className="h-4 w-4 accent-[#d4af37]"
                      />
                      {side === "east" ? copy.east : copy.west}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <ErrorList id="site-errors" messages={groupedErrors.site} />
            <ErrorList id="share-errors" messages={groupedErrors.share} />
            <ErrorList id="side-errors" messages={groupedErrors.side} />
            <ErrorList id="general-errors" messages={groupedErrors.general} />
          </details>

          <PlanCanvas
            locale={locale}
            cards={cards}
            selected={selected}
            onSelect={setSelected}
            roomProgram={roomProgram}
            onRoomProgramChange={setRoomProgram}
            editingDisabled={pending}
          />
          </>
          )}
        </section>
      </div>
    </main>
  );
}

function fieldFor(error: LayoutError): "site" | "share" | "side" | "general" {
  switch (error.code) {
    case "INVALID_SITE_DIMENSIONS":
    case "SITE_TOO_SMALL":
    case "NUMERICAL_OVERFLOW":
      return "site";
    case "SPLIT_OUT_OF_RANGE":
    case "SPLIT_INFEASIBLE":
      return "share";
    case "INVALID_BRIEF":
      return "side";
    default:
      return "general";
  }
}
