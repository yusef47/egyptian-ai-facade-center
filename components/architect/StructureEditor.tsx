"use client";

import { useState, type FormEvent } from "react";
import type { BuildingProposal } from "../../lib/architect/building-proposal";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import type { BuildingBeam, BuildingColumn, BuildingStructure } from "../../lib/architect/building-structure";
import type { WallMeshPreset } from "../../lib/architect/wall-mesh";
import type { ArchitectLocale } from "./architect-copy";

const INITIAL_STRUCTURE: BuildingStructure = { version: 1, status: "coordination-only", columns: [], beams: [] };
const numberInput = "w-full rounded-lg border border-white/20 bg-[#121f23] px-2 py-2 text-sm text-white outline-none focus:border-[#d4af37]";
const cellLabel = "block space-y-1 text-xs text-slate-300";

function nextId(prefix: string, ids: string[]): string {
  const used = new Set(ids);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function errorText(error: string, arabic: boolean): string {
  if (error === "INVALID_BUILDING_PROPOSAL") return arabic
    ? "راجع عدد الأعمدة والكمرات، المعرفات، والمقاسات (بين 0.1 و3 متر)."
    : "Check member counts, IDs and dimensions (0.1 to 3 m).";
  const [code, ...details] = error.split(":");
  const labels: Record<string, [string, string]> = {
    COLUMN_OUT_OF_SITE: ["عمود خارج حدود الأرض", "Column outside the site"],
    COLUMN_BLOCKS_CORE: ["عمود يتداخل مع نواة الحركة", "Column blocks the circulation core"],
    COLUMN_BLOCKS_OPENING: ["عمود يحجب بابًا أو شباكًا", "Column blocks a door or window"],
    COLUMN_OUTSIDE_FLOOR: ["عمود خارج المساحات المرسومة في دور", "Column outside the authored floor cells"],
    COLUMNS_OVERLAP: ["عمودان متداخلان", "Overlapping columns"],
    COLUMN_ID_DUPLICATE: ["معرّف عمود مكرر", "Duplicate column ID"],
    BEAM_FLOOR_INVALID: ["كمرة تشير إلى دور غير موجود", "Beam references an unknown floor"],
    BEAM_ON_BASE_FLOOR: ["كمرات الدور الأساسي تحتاج نظام أساسات غير ممثل هنا", "Base-level beams need a foundation system not modelled here"],
    BEAM_COLUMN_REFERENCE_INVALID: ["كمرة تشير إلى عمود غير موجود", "Beam references an unknown column"],
    BEAM_ZERO_LENGTH: ["كمرة طولها صفر", "Zero-length beam"],
    BEAM_OUT_OF_SITE: ["كمرة خارج حدود الأرض", "Beam outside the site"],
    BEAM_BLOCKS_CORE: ["كمرة تتداخل مع نواة الحركة", "Beam blocks the circulation core"],
    BEAM_OUTSIDE_FLOOR: ["كمرة خارج مساحات الدور", "Beam outside the floor cells"],
    BEAM_CROSSES_OPENING: ["كمرة تتداخل مع فتحة في الدور السفلي", "Beam crosses an opening in the storey below"],
    BEAM_SPAN_DUPLICATE: ["كمرة مكررة بين العمودين نفسيهما", "Duplicate beam span"],
    BEAM_ID_DUPLICATE: ["معرّف كمرة مكرر", "Duplicate beam ID"],
    BEAMS_MISSING_ON_UPPER_FLOOR: ["الدور العلوي بلا كمرات", "Upper floor has no beams"],
  };
  const label = labels[code ?? ""];
  return `${label ? label[arabic ? 0 : 1] : error} · ${details.filter(Boolean).join(" / ")}`;
}

/** Staged editing keeps invalid intermediate coordinates out of the saved project and OBJ. */
export function StructureEditor({ proposal, locale, wallMeshPreset, onApply, onCancel }: {
  proposal: BuildingProposal;
  locale: ArchitectLocale;
  wallMeshPreset: WallMeshPreset;
  onApply: (proposal: BuildingProposal) => void;
  onCancel: () => void;
}) {
  const arabic = locale === "ar";
  const [draft, setDraft] = useState<BuildingStructure>(() => structuredClone(proposal.structure ?? INITIAL_STRUCTURE));
  const [errors, setErrors] = useState<string[]>([]);
  const upperFloors = proposal.floors.slice(1);

  const setColumn = (index: number, change: Partial<BuildingColumn> | { position: Partial<BuildingColumn["position"]> }) => {
    setDraft((current) => ({ ...current, columns: current.columns.map((column, at) => at === index
      ? { ...column, ...change, position: { ...column.position, ...change.position } }
      : column) }));
    setErrors([]);
  };
  const setBeam = (index: number, change: Partial<BuildingBeam>) => {
    setDraft((current) => ({ ...current, beams: current.beams.map((beam, at) => at === index ? { ...beam, ...change } : beam) }));
    setErrors([]);
  };
  const addColumn = () => {
    setDraft((current) => ({ ...current, columns: [...current.columns, {
      id: nextId("c", current.columns.map((column) => column.id)),
      position: { x: 0, y: 0 }, width: 0.3, depth: 0.3,
    }] }));
    setErrors([]);
  };
  const addBeam = () => {
    setDraft((current) => ({ ...current, beams: [...current.beams, {
      id: nextId("b", current.beams.map((beam) => beam.id)),
      floorId: upperFloors[0]!.id,
      fromColumnId: current.columns[0]?.id ?? "",
      toColumnId: current.columns[1]?.id ?? "",
      width: 0.25, depth: 0.45,
    }] }));
    setErrors([]);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = { ...proposal, structure: draft };
    const compiled = compileBuildingProposal(candidate);
    if (!compiled.ok || compiled.kind !== "building") {
      setErrors(compiled.ok ? ["INVALID_BUILDING_PROPOSAL"] : compiled.errors);
      return;
    }
    const model = buildBuildingModelObj(compiled, wallMeshPreset);
    const clashes = model.ok ? [] : model.errors.filter((error) => error.startsWith("BEAM_CROSSES_OPENING:"));
    if (clashes.length) {
      setErrors(clashes);
      return;
    }
    onApply(compiled.proposal);
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-[#a68ac6]/40 bg-[#171923] p-4">
      <div>
        <h3 className="text-sm font-bold text-[#e7d8f8]">{arabic ? "تعديل شبكة التنسيق الإنشائي" : "Edit structural coordination grid"}</h3>
        <p className="mt-1 text-xs leading-6 text-slate-300">{arabic
          ? "الإحداثيات بالمتر من أصل الأرض. الأعمدة مستمرة عبر كل الأدوار، والكمرات تُرسم تحت بلاطة الدور المختار. المقاسات افتراضية وليست حسابًا إنشائيًا."
          : "Coordinates are meters from the site origin. Columns span all floors; beams sit below the selected floor slab. Dimensions are illustrative, not engineered."}</p>
      </div>
      <section className="space-y-2" aria-label={arabic ? "الأعمدة" : "Columns"}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white">{arabic ? "الأعمدة" : "Columns"}</h4>
          <button type="button" onClick={addColumn} disabled={draft.columns.length >= 64} className="rounded-lg border border-[#a68ac6]/50 px-3 py-1.5 text-xs text-[#e7d8f8] disabled:opacity-40">{arabic ? "إضافة عمود" : "Add column"}</button>
        </div>
        {draft.columns.map((column, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-6">
            <label className={cellLabel}><span>{arabic ? "رمز العمود" : "Column ID"}</span><input className={numberInput} value={column.id} maxLength={40} onChange={(event) => setColumn(index, { id: event.target.value })} /></label>
            <label className={cellLabel}><span>X (m)</span><input className={numberInput} type="number" step="0.01" value={column.position.x} onChange={(event) => setColumn(index, { position: { x: Number(event.target.value) } })} /></label>
            <label className={cellLabel}><span>Y (m)</span><input className={numberInput} type="number" step="0.01" value={column.position.y} onChange={(event) => setColumn(index, { position: { y: Number(event.target.value) } })} /></label>
            <label className={cellLabel}><span>{arabic ? "عرض (م)" : "Width (m)"}</span><input className={numberInput} type="number" step="0.01" value={column.width} onChange={(event) => setColumn(index, { width: Number(event.target.value) })} /></label>
            <label className={cellLabel}><span>{arabic ? "عمق (م)" : "Depth (m)"}</span><input className={numberInput} type="number" step="0.01" value={column.depth} onChange={(event) => setColumn(index, { depth: Number(event.target.value) })} /></label>
            <button type="button" onClick={() => { setDraft((current) => ({ ...current, columns: current.columns.filter((_, at) => at !== index) })); setErrors([]); }} className="self-end rounded-lg border border-rose-400/30 px-2 py-2 text-xs text-rose-200">{arabic ? `حذف ${column.id}` : `Remove ${column.id}`}</button>
          </div>
        ))}
      </section>
      <section className="space-y-2" aria-label={arabic ? "الكمرات" : "Beams"}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white">{arabic ? "الكمرات" : "Beams"}</h4>
          <button type="button" onClick={addBeam} disabled={draft.beams.length >= 128 || draft.columns.length < 2} className="rounded-lg border border-[#d4af37]/50 px-3 py-1.5 text-xs text-[#e7d394] disabled:opacity-40">{arabic ? "إضافة كمرة" : "Add beam"}</button>
        </div>
        {draft.beams.map((beam, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-3 xl:grid-cols-7">
            <label className={cellLabel}><span>{arabic ? "رمز الكمرة" : "Beam ID"}</span><input className={numberInput} value={beam.id} maxLength={40} onChange={(event) => setBeam(index, { id: event.target.value })} /></label>
            <label className={cellLabel}><span>{arabic ? "الدور" : "Floor"}</span><select className={numberInput} value={beam.floorId} onChange={(event) => setBeam(index, { floorId: event.target.value })}>{upperFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
            <label className={cellLabel}><span>{arabic ? "من عمود" : "From column"}</span><select className={numberInput} value={beam.fromColumnId} onChange={(event) => setBeam(index, { fromColumnId: event.target.value })}>{draft.columns.map((column) => <option key={column.id} value={column.id}>{column.id}</option>)}</select></label>
            <label className={cellLabel}><span>{arabic ? "إلى عمود" : "To column"}</span><select className={numberInput} value={beam.toColumnId} onChange={(event) => setBeam(index, { toColumnId: event.target.value })}>{draft.columns.map((column) => <option key={column.id} value={column.id}>{column.id}</option>)}</select></label>
            <label className={cellLabel}><span>{arabic ? "عرض (م)" : "Width (m)"}</span><input className={numberInput} type="number" step="0.01" value={beam.width} onChange={(event) => setBeam(index, { width: Number(event.target.value) })} /></label>
            <label className={cellLabel}><span>{arabic ? "عمق (م)" : "Depth (m)"}</span><input className={numberInput} type="number" step="0.01" value={beam.depth} onChange={(event) => setBeam(index, { depth: Number(event.target.value) })} /></label>
            <button type="button" onClick={() => { setDraft((current) => ({ ...current, beams: current.beams.filter((_, at) => at !== index) })); setErrors([]); }} className="self-end rounded-lg border border-rose-400/30 px-2 py-2 text-xs text-rose-200">{arabic ? `حذف ${beam.id}` : `Remove ${beam.id}`}</button>
          </div>
        ))}
      </section>
      {errors.length > 0 ? <div role="alert" className="space-y-1 rounded-lg border border-rose-400/30 bg-rose-950/20 p-3 text-xs text-rose-200">{errors.slice(0, 12).map((error, index) => <p key={`${index}:${error}`}>{errorText(error, arabic)}</p>)}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-lg bg-[#d4af37] px-4 py-2 text-xs font-bold text-[#101719]">{arabic ? "تطبيق بعد فحص الشبكة" : "Validate and apply grid"}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/20 px-4 py-2 text-xs text-slate-200">{arabic ? "إلغاء" : "Cancel"}</button>
        {proposal.structure ? <button type="button" onClick={() => {
          onApply({ kind: "building", version: 1, coreCellId: proposal.coreCellId, floors: proposal.floors,
            ...(proposal.stairs ? { stairs: proposal.stairs } : {}) });
        }} className="rounded-lg border border-rose-400/30 px-4 py-2 text-xs text-rose-200">{arabic ? "حذف الشبكة من المشروع" : "Remove grid from project"}</button> : null}
      </div>
    </form>
  );
}
