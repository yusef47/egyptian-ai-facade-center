"use client";

import { useMemo, useState } from "react";
import type { LayoutOption } from "../../lib/architect/generate";
import { measureSpaces, type SpaceMeasurement } from "../../lib/architect/geometry";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";
import { buildMassingSvg } from "../../lib/architect/massing";
import { buildStructuralConcept, buildStructuralDxf, buildStructuralSvg } from "../../lib/architect/structural-concept";
import {
  ROOM_KIND_INFO,
  buildRoomPlan,
  buildRoomPlanDxf,
  buildRoomPlanSvg,
  type RoomKind,
  type RoomProgram,
  type RoomRequest,
  type UnitKey,
} from "../../lib/architect/room-plan";
import { InlineSvg } from "./InlineSvg";
import {
  WORKSPACE_COPY,
  formatTradeoff,
  type ArchitectLocale,
} from "./architect-copy";

/** Everything the canvas needs to draw one generated option. */
export type PlanCard = {
  option: LayoutOption;
  svg: string;
  areas: { unitA: number; unitB: number; core: number };
  measurements: SpaceMeasurement[];
};

/** Builds the render data for both options from a validated layout. */
export function buildPlanCards(options: LayoutOption[], locale: ArchitectLocale = "en"): PlanCard[] {
  return options.map((option) => {
    const measurements = measureSpaces(option.geometry);
    const areaOf = (suffix: string): number =>
      measurements.find((measurement) => measurement.spaceId === `${option.id}-space-${suffix}`)
        ?.area ?? 0;
    return {
      option,
      svg: buildSvgPlan(option.geometry, { locale }),
      areas: { unitA: areaOf("unit-a"), unitB: areaOf("unit-b"), core: areaOf("core") },
      measurements,
    };
  });
}

function cellFacts(card: PlanCard, suffix: "unit-a" | "unit-b") {
  return card.measurements.find(
    (measurement) => measurement.spaceId === `${card.option.id}-space-${suffix}`,
  ) as SpaceMeasurement;
}

const ROOM_KINDS = Object.keys(ROOM_KIND_INFO) as RoomKind[];

function RoomProgramEditor({
  locale,
  program,
  onChange,
  disabled,
}: {
  locale: ArchitectLocale;
  program: RoomProgram;
  onChange: (next: RoomProgram) => void;
  disabled: boolean;
}) {
  const change = (unit: UnitKey, id: string, patch: Partial<RoomRequest>) =>
    onChange({ ...program, [unit]: program[unit].map((room) => room.id === id ? { ...room, ...patch } : room) });
  const remove = (unit: UnitKey, id: string) =>
    onChange({ ...program, [unit]: program[unit].filter((room) => room.id !== id) });
  const move = (unit: UnitKey, id: string, direction: -1 | 1) => {
    const list = [...program[unit]];
    const index = list.findIndex((room) => room.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    onChange({ ...program, [unit]: list });
  };
  const add = (unit: UnitKey) => {
    let index = 1;
    while (program[unit].some((room) => room.id === "room-" + index)) index += 1;
    onChange({
      ...program,
      [unit]: [...program[unit], { id: "room-" + index, kind: "bedroom", preferredArea: ROOM_KIND_INFO.bedroom.preferredArea }],
    });
  };
  return (
    <details className="rounded-[1.4rem] border border-white/10 bg-[#11191d] p-4 sm:p-5">
      <summary className="cursor-pointer font-bold text-white">
        {locale === "ar" ? "برنامج الغرف" : "Room program"}
        <span className="mx-2 text-xs font-normal text-slate-400">
          {locale === "ar" ? "أضف واحذف وحدد مساحة مفضلة لكل فراغ" : "Add rooms and set preferred areas"}
        </span>
      </summary>
      <p className="mt-3 text-xs leading-6 text-slate-400">
        {locale === "ar"
          ? "المساحات الناتجة تقديرية وقد تختلف عن المساحة المفضلة. كل غرفة تتصل بممر مشترك داخل وحدتها."
          : "Generated areas are nominal and may differ from preferences. Every room connects to its unit corridor."}
      </p>
      <fieldset disabled={disabled} className="mt-4 grid gap-4 disabled:opacity-50 xl:grid-cols-2">
        {(["unit-a", "unit-b"] as const).map((unit) => (
          <div key={unit} className="rounded-xl border border-white/10 bg-white/[.025] p-3">
            <h3 className="mb-3 text-sm font-bold text-[#e7d394]">{unit === "unit-a" ? (locale === "ar" ? "الوحدة أ" : "Unit A") : (locale === "ar" ? "الوحدة ب" : "Unit B")}</h3>
            <div className="space-y-2">
              {program[unit].map((room, index) => (
                <div key={room.id} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={(locale === "ar" ? "نوع غرفة " : "Room type ") + room.id + " " + unit}
                    value={room.kind}
                    onChange={(event) => change(unit, room.id, { kind: event.target.value as RoomKind })}
                    className="min-w-28 flex-1 rounded-lg border border-white/15 bg-[#182226] px-2 py-2 text-sm text-white"
                  >
                    {ROOM_KINDS.map((kind) => <option key={kind} value={kind}>{ROOM_KIND_INFO[kind][locale]}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-300">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      step="1"
                      value={Number.isFinite(room.preferredArea) ? room.preferredArea : ""}
                      onChange={(event) => change(unit, room.id, { preferredArea: Number(event.target.value) })}
                      aria-label={(locale === "ar" ? "المساحة المفضلة " : "Preferred area ") + room.id + " " + unit}
                      className="w-16 rounded-lg border border-white/15 bg-[#182226] px-2 py-2 text-sm text-white"
                    />
                    {locale === "ar" ? "م²" : "m²"}
                  </label>
                  <button type="button" disabled={index === 0} onClick={() => move(unit, room.id, -1)} aria-label={(locale === "ar" ? "قدّم " : "Move up ") + room.id + " " + unit} className="rounded-lg border border-white/15 px-2 py-2 text-xs text-slate-200 disabled:opacity-30">↑</button>
                  <button type="button" disabled={index === program[unit].length - 1} onClick={() => move(unit, room.id, 1)} aria-label={(locale === "ar" ? "أخّر " : "Move down ") + room.id + " " + unit} className="rounded-lg border border-white/15 px-2 py-2 text-xs text-slate-200 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => remove(unit, room.id)} aria-label={(locale === "ar" ? "حذف " : "Remove ") + room.id + " " + unit} className="rounded-lg border border-rose-300/25 px-2 py-2 text-xs text-rose-200 hover:bg-rose-300/10">
                    {locale === "ar" ? "حذف" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => add(unit)} className="mt-3 rounded-lg border border-[#d4af37]/45 px-3 py-2 text-xs font-bold text-[#e7d394] hover:bg-[#d4af37]/10">
              {locale === "ar" ? "+ أضف غرفة" : "+ Add room"}
            </button>
          </div>
        ))}
      </fieldset>
    </details>
  );
}

export function PlanCanvas({
  locale,
  cards,
  selected,
  onSelect,
  roomProgram,
  onRoomProgramChange,
  editingDisabled = false,
}: {
  locale: ArchitectLocale;
  cards: PlanCard[];
  selected: 1 | 2;
  onSelect: (option: 1 | 2) => void;
  roomProgram: RoomProgram;
  onRoomProgramChange: (next: RoomProgram) => void;
  editingDisabled?: boolean;
}) {
  const copy = WORKSPACE_COPY[locale];
  const [viewMode, setViewMode] = useState<"plan" | "rooms" | "structure" | "massing">("plan");

  const selectedCard = cards[selected - 1];
  const roomResult = useMemo(
    () => selectedCard ? buildRoomPlan(selectedCard.option.geometry, roomProgram, selectedCard.option.coreSide) : null,
    [selectedCard, roomProgram],
  );
  const roomSvg = useMemo(
    () => selectedCard && roomResult?.ok ? buildRoomPlanSvg(selectedCard.option.geometry, roomResult.plan, locale) : "",
    [selectedCard, roomResult, locale],
  );
  const massingSvg = useMemo(
    () => (selectedCard ? buildMassingSvg(selectedCard.option.geometry, locale) : ""),
    [selectedCard, locale],
  );
  const structuralConcept = useMemo(
    () => selectedCard ? buildStructuralConcept(selectedCard.option.geometry) : null,
    [selectedCard],
  );
  const structuralSvg = useMemo(
    () => selectedCard && structuralConcept ? buildStructuralSvg(selectedCard.option.geometry, structuralConcept, locale) : "",
    [selectedCard, structuralConcept, locale],
  );
  const dxfText = useMemo(
    () => selectedCard
      ? viewMode === "rooms" && roomResult?.ok
        ? buildRoomPlanDxf(selectedCard.option.geometry, roomResult.plan)
        : viewMode === "structure" && structuralConcept
          ? buildStructuralDxf(selectedCard.option.geometry, structuralConcept)
          : buildDxfPlan(selectedCard.option.geometry)
      : "",
    [selectedCard, viewMode, roomResult, structuralConcept],
  );

  if (cards.length === 0) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-dashed border-amber-400/30 bg-[#11191d] p-8 text-center text-slate-300"
      >
        {copy.errors}
      </p>
    );
  }

  if (!selectedCard) return null;

  const currentSvg = viewMode === "rooms" && roomResult?.ok ? roomSvg : viewMode === "structure" ? structuralSvg : viewMode === "massing" ? massingSvg : selectedCard.svg;
  const exportSvg = viewMode === "rooms" && roomResult?.ok ? roomSvg : viewMode === "structure" ? structuralSvg : selectedCard.svg;
  const structuralJsonHref = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(structuralConcept, null, 2));
  const sideLabel = selectedCard.option.coreSide === "east" ? copy.east : copy.west;
  const tradeoff = formatTradeoff(locale, {
    coreSide: selectedCard.option.coreSide,
    unitA: cellFacts(selectedCard, "unit-a"),
    unitB: cellFacts(selectedCard, "unit-b"),
  });
  const svgHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSvg)}`;
  const dxfHref = `data:application/dxf;charset=utf-8,${encodeURIComponent(dxfText)}`;

  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#11191d] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold tracking-[.24em] text-[#d4af37]">QATTAN / PLAN STUDIO</p>
          <h2 className="mt-1 text-xl font-bold text-white">{copy.options}</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          {locale === "ar" ? "المخطط يتحدث مباشرة" : "Live plan"}
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {cards.map((card, index) => {
          const optionNumber = (index + 1) as 1 | 2;
          const isSelected = selected === optionNumber;
          const optionSide = card.option.coreSide === "east" ? copy.east : copy.west;
          return (
            <article
              key={card.option.id}
              aria-label={copy.optionLabel(optionNumber)}
              className={
                isSelected
                  ? "rounded-2xl border border-[#d4af37]/75 bg-gradient-to-br from-[#47391c] to-[#20231e] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
                  : "rounded-2xl border border-white/10 bg-white/[.035] p-4 transition-colors hover:border-white/25"
              }
            >
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-[.15em] text-[#d4af37]">{copy.optionLabel(optionNumber)}</span>
                  <span className="mt-1 block text-sm font-semibold text-white">{copy.coreSideLabel(optionSide)}</span>
                  <span className="mt-1 block text-xs text-slate-300">{copy.unitA} {card.areas.unitA.toFixed(1)} {locale === "ar" ? "م²" : "m²"}</span>
                </span>
                <input
                  type="radio"
                  name="architect-option-select"
                  value={optionNumber}
                  checked={isSelected}
                  onChange={() => onSelect(optionNumber)}
                  aria-label={`${copy.select} ${optionNumber}`}
                  className="h-5 w-5 shrink-0 accent-[#d4af37]"
                />
              </label>
            </article>
          );
        })}
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="mb-4"><RoomProgramEditor locale={locale} program={roomProgram} onChange={onRoomProgramChange} disabled={editingDisabled} /></div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">{locale === "ar" ? "بدّل طريقة عرض نفس المخطط" : "Switch between views of the same concept"}</p>
          <div className="inline-flex rounded-xl border border-white/10 bg-[#0b1114] p-1" role="group" aria-label={locale === "ar" ? "طريقة العرض" : "View mode"}>
            {(["plan", "rooms", "structure", "massing"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={viewMode === mode ? "rounded-lg bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-[#101719]" : "rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"}
              >
                {mode === "plan" ? (locale === "ar" ? "مخطط 2D" : "2D plan") : mode === "rooms" ? (locale === "ar" ? "توزيع الغرف" : "Rooms") : mode === "structure" ? (locale === "ar" ? "إنشائي مبدئي" : "Structure") : (locale === "ar" ? "كتل مجسّمة" : "Block massing")}
              </button>
            ))}
          </div>
        </div>
        <div
          className={viewMode !== "massing"
            ? "relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-[#e9eeed] p-5 sm:min-h-[500px] sm:p-8"
            : "relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-[#11282d] p-5 sm:min-h-[500px] sm:p-8"}
          style={viewMode !== "massing"
            ? { backgroundImage: "linear-gradient(rgba(52,82,85,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(52,82,85,.07) 1px,transparent 1px)", backgroundSize: "24px 24px" }
            : { backgroundImage: "radial-gradient(circle at 50% 45%,rgba(66,125,130,.35),transparent 55%),linear-gradient(rgba(195,228,222,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(195,228,222,.05) 1px,transparent 1px)", backgroundSize: "auto,24px 24px,24px 24px" }}
        >
          <div className={viewMode !== "massing" ? "absolute left-4 top-4 rounded-md border border-[#314c50]/15 bg-white/85 px-2 py-1 text-[10px] font-bold tracking-[.16em] text-[#315258]" : "absolute left-4 top-4 rounded-md border border-[#d4af37]/30 bg-[#0b191c]/85 px-2 py-1 text-[10px] font-bold tracking-[.16em] text-[#e7d394]"}>{copy.optionLabel(selected)} / {copy.coreSideLabel(sideLabel)}</div>
          <div className={viewMode !== "massing"
            ? "w-full max-w-[580px] rounded-xl border border-[#a9b9b7]/40 bg-white/95 p-3 shadow-[0_16px_50px_rgba(29,55,60,.15)] sm:p-5"
            : "w-full max-w-[850px] p-2 drop-shadow-[0_22px_24px_rgba(0,0,0,.45)]"}>
            {viewMode === "rooms" && !roomResult?.ok ? (
              <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-950/60 p-5 text-sm text-rose-100">
                {roomResult?.errors.join(" · ") || (locale === "ar" ? "تعذر توزيع الغرف." : "Room layout unavailable.")}
              </div>
            ) : (
              <InlineSvg source={currentSvg} label={viewMode === "plan" ? copy.previewLabel(sideLabel) : viewMode === "rooms" ? (locale === "ar" ? "توزيع غرف مبدئي مع ممر وأبواب" : "Concept room layout with corridor and doors") : viewMode === "structure" ? (locale === "ar" ? "شبكة أعمدة وكمرات وبلاطة للتنسيق فقط" : "Coordination-only column, beam and slab grid") : (locale === "ar" ? "معاينة كتل مجسّمة تقريبية لنفس المخطط" : "Illustrative block massing of the same plan")} />
            )}
          </div>
          <div className={viewMode === "massing" ? "absolute bottom-4 left-4 rounded-md border border-[#d4af37]/30 bg-[#0b191c]/85 px-2 py-1 text-[10px] font-semibold text-[#e7d394]" : "absolute bottom-4 left-4 rounded-md border border-[#314c50]/15 bg-white/85 px-2 py-1 text-[10px] font-semibold text-[#315258]"}>{viewMode === "plan" ? (locale === "ar" ? "مخطط مفاهيمي · المقياس بالمتر" : "Concept plan · metric") : viewMode === "rooms" ? (locale === "ar" ? "توزيع أولي · يحتاج مراجعة هندسية" : "Concept rooms · engineering review required") : viewMode === "structure" ? (locale === "ar" ? "أعمدة وكمرات وبلاطة للتنسيق · بلا تحليل أو مقاسات" : "Coordination grid · no analysis or member sizes") : (locale === "ar" ? "كتل توضيحية فقط · ليست نموذجًا إنشائيًا" : "Illustrative blocks · not a structural model")}</div>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {([
            [copy.unitA, selectedCard.areas.unitA],
            [copy.unitB, selectedCard.areas.unitB],
            [copy.core, selectedCard.areas.core],
          ] as const).map(([label, area]) => (
            <li key={label} className="rounded-xl border border-white/10 bg-white/[.035] px-4 py-3">
              <span className="block text-xs text-slate-400">{label}</span>
              <strong className="mt-1 block text-xl font-semibold text-white">{area.toFixed(1)} <small className="text-sm font-normal text-[#d4af37]">{locale === "ar" ? "م²" : "m²"}</small></strong>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border border-[#d4af37]/15 bg-[#d4af37]/[.06] px-4 py-3">
          <p className="text-[11px] font-bold tracking-[.12em] text-[#d4af37]">{copy.tradeoff}</p>
          <p className="mt-1 text-sm leading-7 text-slate-200">{tradeoff}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!(viewMode === "rooms" && !roomResult?.ok) ? <a role="link" href={svgHref} download={selectedCard.option.id + (viewMode === "rooms" ? "-rooms" : viewMode === "structure" ? "-structure" : "") + ".svg"} className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#101719] transition-colors hover:bg-[#e7c76b] focus:outline-none focus:ring-2 focus:ring-[#e7c76b]">{copy.downloadSvg}</a> : null}
          {!(viewMode === "rooms" && !roomResult?.ok) ? <a role="link" href={dxfHref} download={selectedCard.option.id + (viewMode === "rooms" ? "-rooms" : viewMode === "structure" ? "-structure" : "") + ".dxf"} className="rounded-lg border border-[#d4af37]/50 px-4 py-2 text-sm font-bold text-[#e7d394] transition-colors hover:bg-[#d4af37]/10 focus:outline-none focus:ring-2 focus:ring-[#e7c76b]">{copy.downloadDxf}</a> : null}
          {viewMode === "structure" ? <a role="link" href={structuralJsonHref} download={selectedCard.option.id + "-structure.json"} className="rounded-lg border border-[#7051a8]/60 px-4 py-2 text-sm font-bold text-[#d8c7f5] hover:bg-[#7051a8]/10">{locale === "ar" ? "تنزيل بيانات التنسيق JSON" : "Download coordination JSON"}</a> : null}
        </div>
      </div>
    </div>
  );
}
