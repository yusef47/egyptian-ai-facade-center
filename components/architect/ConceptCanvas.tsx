"use client";

import { useMemo } from "react";
import type { ProjectGeometry } from "../../lib/architect/geometry";
import { measureSpaces } from "../../lib/architect/geometry";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";
import type { BuildingStructure } from "../../lib/architect/building-structure";
import { buildStructuralFloorOverlays } from "../../lib/architect/structural-plan-overlay";
import { buildStairFloorOverlay } from "../../lib/architect/stair-plan-overlay";
import type { BuildingStair } from "../../lib/architect/building-stair";
import { CONCEPT_KIND_LABELS, type ConceptProposal } from "../../lib/architect/concept-proposal";
import type { ArchitectLocale } from "./architect-copy";
import { InlineSvg } from "./InlineSvg";

/** A model-proposed single-floor concept, compiled into one editable vector plan. */
export function ConceptCanvas({ geometry, proposal, locale, floorName, downloadPrefix = "qattan-concept", structure, stairs, showStructure = true }: {
  geometry: ProjectGeometry;
  proposal: ConceptProposal;
  locale: ArchitectLocale;
  floorName?: string;
  downloadPrefix?: string;
  structure?: BuildingStructure;
  stairs?: BuildingStair[];
  showStructure?: boolean;
}) {
  const fills = useMemo(
    () => Object.fromEntries(proposal.cells.map((cell) => [cell.id, CONCEPT_KIND_LABELS[cell.kind].fill])),
    [proposal],
  );
  const stairOverlay = useMemo(() => stairs?.length
    ? buildStairFloorOverlay(stairs, geometry.floor.id) : null, [stairs, geometry.floor.id]);
  const svg = useMemo(() => buildSvgPlan(geometry, { locale, spaceFills: fills, spaceLabelMetric: "area",
    stairOverlay: stairOverlay?.svg }), [geometry, locale, fills, stairOverlay]);
  const dxf = useMemo(() => buildDxfPlan(geometry, stairOverlay?.treads ? stairOverlay.dxf : undefined), [geometry, stairOverlay]);
  const overlay = useMemo(() => structure
    ? buildStructuralFloorOverlays(structure, geometry.floor.id, geometry.site.polygon.points)
    : null, [structure, geometry]);
  const coordinatedSvg = useMemo(() => overlay
    ? buildSvgPlan(geometry, { locale, spaceFills: fills, spaceLabelMetric: "area", structuralOverlay: overlay.svg,
      stairOverlay: stairOverlay?.svg })
    : null, [geometry, locale, fills, overlay, stairOverlay]);
  const coordinatedDxf = useMemo(() => overlay ? buildDxfPlan(geometry, {
    layers: [...overlay.dxf.layers, ...(stairOverlay?.treads ? stairOverlay.dxf.layers : [])],
    entities: [...overlay.dxf.entities, ...(stairOverlay?.treads ? stairOverlay.dxf.entities : [])],
  }) : null, [geometry, overlay, stairOverlay]);
  const visibleSvg = showStructure && coordinatedSvg ? coordinatedSvg : svg;
  const areas = useMemo(() => measureSpaces(geometry), [geometry]);
  const total = areas.reduce((sum, space) => sum + space.area, 0);
  const arabic = locale === "ar";
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-[#d4af37]/25 bg-[#11191d] shadow-[0_24px_80px_rgba(0,0,0,.25)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
        <div>
          <p className="text-[10px] font-bold tracking-[.2em] text-[#d4af37]">{arabic ? "مقترح حر" : "ORIGINAL CONCEPT"}</p>
          <h2 className="mt-1 text-xl font-bold text-white">{floorName ?? (arabic ? "المخطط الناتج من الحوار" : "Plan from your conversation")}</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            {arabic
              ? "المساحات تخطيطية. تم فحص حدود الرسم والتداخل والوصول بين الفراغات ومواضع الفتحات؛ لم تُفحص الإضاءة الطبيعية أو الأحمال أو الاشتراطات أو صلاحية التنفيذ."
              : "Areas are conceptual. Geometry, overlaps, door connectivity and opening placement were checked; daylight, loads, regulations and construction suitability were not checked."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`${downloadPrefix}.svg`} className="rounded-lg border border-[#d4af37]/50 px-3 py-2 text-xs font-bold text-[#e7d394] hover:bg-[#d4af37]/10">SVG</a>
          <a href={`data:application/dxf;charset=utf-8,${encodeURIComponent(dxf)}`} download={`${downloadPrefix}.dxf`} className="rounded-lg border border-[#d4af37]/50 px-3 py-2 text-xs font-bold text-[#e7d394] hover:bg-[#d4af37]/10">DXF</a>
          {coordinatedSvg ? <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(coordinatedSvg)}`} download={`${downloadPrefix}-coordination.svg`} className="rounded-lg border border-[#a68ac6]/50 px-3 py-2 text-xs font-bold text-[#d8c7ee]">{arabic ? "SVG + تنسيق" : "SVG + grid"}</a> : null}
          {coordinatedDxf ? <a href={`data:application/dxf;charset=utf-8,${encodeURIComponent(coordinatedDxf)}`} download={`${downloadPrefix}-coordination.dxf`} className="rounded-lg border border-[#a68ac6]/50 px-3 py-2 text-xs font-bold text-[#d8c7ee]">{arabic ? "DXF + تنسيق" : "DXF + grid"}</a> : null}
        </div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#314c50]/20 bg-[#f7f9fa] p-2">
          <InlineSvg source={visibleSvg} label={arabic ? "مخطط معماري حر مبدئي" : "Original concept floor plan"} />
        </div>
        <div className="rounded-xl border border-white/10 bg-[#172225] p-4">
          <p className="text-xs font-bold text-[#e7d394]">{arabic ? "مساحات تخطيطية" : "Concept areas"}</p>
          <p className="mt-2 text-2xl font-bold text-white">{total.toFixed(1)} <span className="text-xs text-slate-400">m²</span></p>
          <ul className="mt-4 space-y-2">
            {geometry.spaces.map((space) => {
              const area = areas.find((item) => item.spaceId === space.id)?.area ?? 0;
              const kind = proposal.cells.find((cell) => cell.id === space.id)?.kind ?? "other";
              return (
                <li key={space.id} className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 text-xs text-slate-300">
                  <span className="min-w-0">
                    <span className="block text-[10px] text-[#e7d394]">{CONCEPT_KIND_LABELS[kind][locale]}</span>
                    <span className="block truncate" title={space.name}>{space.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-white">{area.toFixed(1)} m²</span>
                </li>
              );
            })}
          </ul>
        </div>
        {stairOverlay?.treads ? <p className="text-xs text-emerald-200 xl:col-span-2">{arabic
          ? `الأخضر: ${stairOverlay.treads} درجة مرسومة في النواة مع بسطتين. المعاينة تخطيطية؛ الخلوص ومسار الحركة والاشتراطات لم تُعتمد.`
          : `Green: ${stairOverlay.treads} treads with two landings in the core. This is a concept; clearances, access and rules are unapproved.`}</p> : null}
        {overlay ? <p className="text-xs text-[#d8c7ee] xl:col-span-2">{arabic
          ? `البنفسجي: ${overlay.columns} أعمدة في كل الأدوار. الذهبي: ${overlay.beams} كمرات لهذا الدور. ملفات التنسيق طبقات منفصلة غير محسوبة وغير صالحة للتنفيذ.`
          : `Purple: ${overlay.columns} columns on every floor. Gold: ${overlay.beams} beams on this floor. Coordination layers are unanalysed and not for construction.`}</p> : null}
      </div>
    </div>
  );
}
