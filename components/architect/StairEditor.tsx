"use client";

import { useState, type FormEvent } from "react";
import { compileBuildingProposal, type BuildingProposal } from "../../lib/architect/building-proposal";
import type { BuildingStair } from "../../lib/architect/building-stair";
import type { ArchitectLocale } from "./architect-copy";

const field = "w-full rounded-lg border border-white/20 bg-[#121f23] px-2 py-2 text-sm text-white outline-none focus:border-[#d4af37]";

function stairErrorText(error: string, arabic: boolean): string {
  const [code, ...ids] = error.split(":");
  const labels: Record<string, [string, string]> = {
    INVALID_BUILDING_PROPOSAL: ["بيانات السلم غير مكتملة أو خارج الحدود المسموحة", "Stair data is incomplete or outside the accepted bounds"],
    STAIR_FLOORS_NOT_ADJACENT: ["السلم لا يصل بين دورين متجاورين", "The stair must connect adjacent floors"],
    STAIR_ZERO_RUN: ["بداية السلم ونهايته في نفس النقطة", "Stair run has zero length"],
    STAIR_OUTSIDE_CORE: ["الدرجات أو البسطات خارج حدود النواة", "Treads or landings extend outside the core"],
    STAIR_GEOMETRY_IMPLAUSIBLE: ["ارتفاع القائمة أو عمق النائمة غير معقول هندسيًا", "Riser height or tread depth is geometrically implausible"],
    STAIR_BLOCKS_CORE_DOOR: ["السلم يغطي مدخل باب في النواة", "The stair blocks a core doorway"],
    STAIR_DOOR_APPROACH_INVALID: ["تعذر تحديد منطقة الدخول من الباب", "The door approach could not be resolved"],
    STAIR_DOOR_UNREACHABLE: ["لا يوجد مسار مشي متصل من الباب إلى بسطة السلم", "No continuous walking path connects the door to the stair landing"],
    STAIRS_OVERLAP: ["سلمان متداخلان في نفس الدور", "Stairs overlap in the same storey"],
  };
  return `${labels[code ?? ""]?.[arabic ? 0 : 1] ?? error}${ids.length ? ` · ${ids.join(" / ")}` : ""}`;
}

export function StairEditor({ proposal, locale, onApply, onCancel }: {
  proposal: BuildingProposal;
  locale: ArchitectLocale;
  onApply: (proposal: BuildingProposal) => void;
  onCancel: () => void;
}) {
  const arabic = locale === "ar";
  const [draft, setDraft] = useState<BuildingStair[]>(() => structuredClone(proposal.stairs ?? []));
  const [errors, setErrors] = useState<string[]>([]);
  const update = (index: number, change: Partial<BuildingStair>) => {
    setDraft((current) => current.map((stair, at) => at === index ? { ...stair, ...change } : stair));
    setErrors([]);
  };
  const add = () => {
    const used = new Set(draft.map((stair) => stair.id));
    let serial = 1;
    while (used.has(`s${serial}`)) serial += 1;
    const core = proposal.floors[0]!.plan.cells.find((cell) => cell.id === proposal.coreCellId)!;
    const xs = core.points.map((point) => point.x);
    const ys = core.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const alongY = maxY - minY >= maxX - minX;
    const lowerFloorId = proposal.floors[0]!.id;
    const upperFloorId = proposal.floors[1]!.id;
    const rise = proposal.floors[1]!.elevation - proposal.floors[0]!.elevation;
    setDraft((current) => [...current, {
      id: `s${serial}`, lowerFloorId, upperFloorId,
      start: alongY ? { x: (minX + maxX) / 2, y: minY + 1.1 } : { x: minX + 1.1, y: (minY + maxY) / 2 },
      end: alongY ? { x: (minX + maxX) / 2, y: maxY - 1.7 } : { x: maxX - 1.7, y: (minY + maxY) / 2 },
      width: 1.2, risers: Math.max(4, Math.min(40, Math.round(rise / 0.18))), landingLength: 0.8,
    }]);
    setErrors([]);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = { ...proposal, stairs: draft };
    const compiled = compileBuildingProposal(candidate);
    if (!compiled.ok || compiled.kind !== "building") {
      setErrors(compiled.ok ? ["INVALID_BUILDING_PROPOSAL"] : compiled.errors);
      return;
    }
    onApply(compiled.proposal);
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-emerald-300/30 bg-[#111d1c] p-3">
      <p className="text-xs leading-6 text-slate-300">{arabic
        ? "حدد مسار درجة مستقيم بين دورين متجاورين. الأرقام بالمتر، والبسطتان بنفس الطول. الفحص الحالي هندسي فقط؛ الميل والخلوص والدرابزين والاشتراطات تحتاج مراجعة مختص."
        : "Author a straight flight between adjacent floors. Coordinates are meters; both landings use the same length. Only geometric checks run here; headroom, rails, egress and code need specialist review."}</p>
      {draft.map((stair, index) => (
        <div key={index} className="rounded-lg border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <label className="text-xs text-slate-300">ID<input className={field} value={stair.id} onChange={(event) => update(index, { id: event.target.value })} /></label>
            <label className="text-xs text-slate-300">{arabic ? "من دور" : "Lower floor"}<select className={field} value={stair.lowerFloorId} onChange={(event) => update(index, { lowerFloorId: event.target.value })}>{proposal.floors.slice(0, -1).map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
            <label className="text-xs text-slate-300">{arabic ? "إلى دور" : "Upper floor"}<select className={field} value={stair.upperFloorId} onChange={(event) => update(index, { upperFloorId: event.target.value })}>{proposal.floors.slice(1).map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
            {(["start", "end"] as const).flatMap((endpoint) => (["x", "y"] as const).map((axis) => (
              <label key={`${endpoint}-${axis}`} className="text-xs text-slate-300">{endpoint === "start" ? (arabic ? "بداية" : "Start") : (arabic ? "نهاية" : "End")} {axis.toUpperCase()}
                <input className={field} type="number" step="0.01" value={stair[endpoint][axis]} onChange={(event) => update(index, { [endpoint]: { ...stair[endpoint], [axis]: Number(event.target.value) } })} />
              </label>
            )))}
            <label className="text-xs text-slate-300">{arabic ? "عرض (م)" : "Width (m)"}<input className={field} type="number" step="0.01" value={stair.width} onChange={(event) => update(index, { width: Number(event.target.value) })} /></label>
            <label className="text-xs text-slate-300">{arabic ? "عدد القوائم" : "Risers"}<input className={field} type="number" step="1" value={stair.risers} onChange={(event) => update(index, { risers: Number(event.target.value) })} /></label>
            <label className="text-xs text-slate-300">{arabic ? "طول البسطة (م)" : "Landing length (m)"}<input className={field} type="number" step="0.01" value={stair.landingLength} onChange={(event) => update(index, { landingLength: Number(event.target.value) })} /></label>
          </div>
          <button type="button" onClick={() => { setDraft((current) => current.filter((_, at) => at !== index)); setErrors([]); }} className="mt-2 text-xs text-rose-200 underline">{arabic ? `حذف ${stair.id}` : `Remove ${stair.id}`}</button>
        </div>
      ))}
      {errors.length ? <div role="alert" className="rounded-lg border border-rose-400/30 p-2 text-xs text-rose-200">{errors.slice(0, 8).map((error) => <p key={error}>{stairErrorText(error, arabic)}</p>)}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={draft.length >= 10} onClick={add} className="rounded-lg border border-emerald-300/40 px-3 py-2 text-xs text-emerald-100 disabled:opacity-40">{arabic ? "إضافة سلم مستقيم" : "Add straight stair"}</button>
        <button type="submit" className="rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]">{arabic ? "فحص وتطبيق" : "Validate and apply"}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/20 px-3 py-2 text-xs text-slate-200">{arabic ? "إلغاء" : "Cancel"}</button>
      </div>
    </form>
  );
}
