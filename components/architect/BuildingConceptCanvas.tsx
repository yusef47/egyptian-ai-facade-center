"use client";

import { useMemo, useState } from "react";
import type { BuildingProposal, CompiledDesign } from "../../lib/architect/building-proposal";
import { buildBuildingStackSvg } from "../../lib/architect/building-stack";
import type { WallMeshPreset } from "../../lib/architect/wall-mesh";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import type { ArchitectLocale } from "./architect-copy";
import { ConceptCanvas } from "./ConceptCanvas";
import { InlineSvg } from "./InlineSvg";
import { SolidModelViewer } from "./SolidModelViewer";
import { StructureEditor } from "./StructureEditor";
import { StairEditor } from "./StairEditor";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;

/** Floor switcher for an authored building concept; each vector export is floor-specific. */
export function BuildingConceptCanvas({ building, locale, wallMeshPreset, onWallMeshPresetChange, onBuildingChange, editingDisabled }: {
  building: Building;
  locale: ArchitectLocale;
  wallMeshPreset: WallMeshPreset;
  onWallMeshPresetChange: (preset: WallMeshPreset) => void;
  onBuildingChange: (proposal: BuildingProposal) => void;
  editingDisabled: boolean;
}) {
  const initialFloor = building.floors.find((floor) => floor.elevation === 0)?.id ?? building.floors[0]!.id;
  const [selectedId, setSelectedId] = useState(initialFloor);
  const [viewMode, setViewMode] = useState<"plan" | "stack">("plan");
  const [previewMode, setPreviewMode] = useState<"solid" | "layers">("solid");
  const [showStructure, setShowStructure] = useState(true);
  const [editingStructure, setEditingStructure] = useState(false);
  const [editingStairs, setEditingStairs] = useState(false);
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  const floor = building.floors.find((candidate) => candidate.id === selectedId)
    ?? building.floors.find((candidate) => candidate.id === initialFloor)!;
  const arabic = locale === "ar";
  const stackSvg = useMemo(() => buildBuildingStackSvg(building, floor.id, rotation), [building, floor.id, rotation]);
  const buildingMesh = useMemo(() => buildBuildingModelObj(building, wallMeshPreset), [building, wallMeshPreset]);
  const meshError = buildingMesh.ok ? "" : buildingMesh.errors.some((error) => error.startsWith("BEAM_CROSSES_OPENING"))
    ? (arabic ? "كمرة تتداخل مع باب أو شباك في الدور السفلي. قلّل عمق الكمرة أو غيّر موضعها." : "A beam crosses a door or window below. Reduce its depth or move it.")
    : buildingMesh.errors.some((error) => error.startsWith("OPENING_HEAD_EXCEEDS_STORY"))
      ? (arabic ? "ارتفاع باب أو شباك أكبر من ارتفاع الدور المتاح." : "An opening head exceeds an available storey height.")
      : (arabic ? "راجع ارتفاع الدور الأخير وارتفاعات الفتحات وسماكة البلاطة." : "Check the last storey, openings and slab thickness.");

  return (
    <div className="space-y-3">
      <div className="rounded-[1.4rem] border border-[#d4af37]/25 bg-[#11191d] p-4">
        <p className="text-xs font-bold tracking-wider text-[#e7d394]">{arabic ? "تصور مبنى متعدد الأدوار" : "Multi-floor concept"}</p>
        <p className="mt-2 text-xs leading-6 text-slate-300">
          {arabic
            ? "المخطط لكل دور مستقل، ونواة الحركة الرأسية متطابقة الموضع. السلالم المضافة مجرد هندسة مبدئية؛ المصعد والتحليل الإنشائي والاشتراطات لم تُفحص."
            : "Each floor has its own plan and an aligned vertical core. Authored stairs are concept geometry; lift, structural analysis and regulations have not been checked."}
        </p>
        <div role="tablist" aria-label={arabic ? "اختيار الدور" : "Select floor"} className="mt-3 flex flex-wrap gap-2">
          {building.floors.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={floor.id === candidate.id}
              onClick={() => setSelectedId(candidate.id)}
              className={floor.id === candidate.id
                ? "rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]"
                : "rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-[#d4af37]/50"}
            >
              {candidate.name} · {candidate.elevation.toFixed(2)} m
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={viewMode === "plan"} onClick={() => setViewMode("plan")} className={viewMode === "plan" ? "rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]" : "rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300"}>{arabic ? "مخطط الدور" : "Floor plan"}</button>
          <button type="button" aria-pressed={viewMode === "stack"} onClick={() => setViewMode("stack")} className={viewMode === "stack" ? "rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]" : "rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300"}>{arabic ? "نموذج المبنى 3D" : "3D building model"}</button>
          {building.proposal.structure ? <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#a68ac6]/40 px-3 py-2 text-xs text-[#d8c7ee]">
            <input type="checkbox" checked={showStructure} onChange={(event) => setShowStructure(event.target.checked)} className="accent-[#a68ac6]" />
            {arabic ? "إظهار شبكة إنشائية غير محسوبة" : "Show unanalysed structural grid"}
          </label> : null}
        </div>
      </div>
      <section aria-label={arabic ? "فحص الحركة بين الأدوار" : "Vertical circulation audit"} className="rounded-[1.4rem] border border-amber-400/35 bg-[#1b1a17] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-amber-200">{arabic ? "فحص الحركة بين الأدوار" : "Floor connection review"}</h2>
          <span className="rounded-full border border-amber-400/40 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{arabic ? "تصور هندسي غير معتمد" : "Unapproved concept"}</span>
        </div>
        <p className="mt-2 text-xs leading-6 text-slate-300">
          {arabic
            ? `النواة المرسومة مساحتها التخطيطية ${building.circulation.coreNominalArea.toFixed(1)} م² وحدودها ${building.circulation.coreBoundingWidth.toFixed(2)} × ${building.circulation.coreBoundingDepth.toFixed(2)} م. هذه أبعاد على محاور الحوائط وليست عرضًا صافيًا. وجود فتحة في البلاطة ونواة متطابقة لا يعني وجود مسار آمن بين الأدوار.`
            : `The drawn core has ${building.circulation.coreNominalArea.toFixed(1)} m² nominal planning area and a ${building.circulation.coreBoundingWidth.toFixed(2)} × ${building.circulation.coreBoundingDepth.toFixed(2)} m bounding box. These are wall-reference dimensions, not clear widths. An aligned shaft does not provide a usable route between floors.`}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {building.circulation.links.map((link) => (
            <div key={`${link.lowerFloorId}-${link.upperFloorId}`} className="rounded-xl border border-white/10 bg-[#11191d] p-3 text-xs text-slate-300">
              <p className="font-semibold text-white">{link.lowerFloorId} → {link.upperFloorId} · {link.rise.toFixed(2)} m</p>
              <p className="mt-1">{arabic ? `أبواب النواة: ${link.lowerCoreDoors.length} أسفل · ${link.upperCoreDoors.length} أعلى` : `Core doors: ${link.lowerCoreDoors.length} below · ${link.upperCoreDoors.length} above`}</p>
              <p className="mt-1 text-amber-200">{link.status === "concept-stair-authored"
                ? (arabic ? "درجات وبسطات مبدئية مرسومة؛ فُحص اتصال الأبواب المرسومة بالبسطات تخطيطيًا. الخلوص والاشتراطات لم تُعتمَد." : "Concept treads and landings authored; drawn door-to-landing paths passed a plan-view precheck. Headroom and rules remain unapproved.")
                : (arabic ? "لا يوجد سلم مرسوم بين هذين الدورين." : "No stair is authored between these floors.")}</p>
            </div>
          ))}
        </div>
        {building.circulation.groundOutsideDoors.length === 0 ? (
          <p role="alert" className="mt-2 text-xs text-amber-200">{arabic ? "لا يوجد باب مباشر من خارج المبنى إلى النواة في الأرضي؛ راجع مسار الدخول." : "There is no direct outside-to-core door at ground level; review the entrance route."}</p>
        ) : null}
        <button type="button" disabled={editingDisabled} onClick={() => setEditingStairs((current) => !current)} className="mt-3 rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-40">{editingStairs ? (arabic ? "إخفاء محرر السلم" : "Hide stair editor") : (arabic ? "تعديل السلالم والبسطات" : "Edit stairs and landings")}</button>
        {editingStairs ? <StairEditor key={JSON.stringify(building.proposal.stairs ?? [])} proposal={building.proposal} locale={locale}
          onApply={(next) => { onBuildingChange(next); setEditingStairs(false); }} onCancel={() => setEditingStairs(false)} /> : null}
      </section>
      {viewMode === "plan" ? (
        <ConceptCanvas
          geometry={floor.geometry}
          proposal={floor.plan}
          locale={locale}
          floorName={floor.name}
          downloadPrefix={`qattan-${floor.id}-concept`}
          structure={building.proposal.structure}
          stairs={building.proposal.stairs}
          showStructure={showStructure}
        />
      ) : (
        <div className="rounded-[1.4rem] border border-[#d4af37]/25 bg-[#11191d] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">{arabic ? "نموذج المبنى ثلاثي الأبعاد" : "3D building concept"}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-400">{arabic ? "المعاينة وملف OBJ من نفس الهندسة. ارتفاعات الأدوار من المقترح؛ ارتفاع الدور الأخير وسماكة البلاطات والفتحات من القيم أدناه. السلالم المرسومة والتصميم الإنشائي لم يُعتمدا." : "The preview and OBJ use the same geometry. Floor levels come from the proposal; last-storey height, slab thickness and opening heights use the values below. Authored stairs and structure remain unapproved."}</p>
            </div>
            <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(stackSvg)}`} download="qattan-building-stack.svg" className="rounded-lg border border-[#d4af37]/50 px-3 py-2 text-xs font-bold text-[#e7d394]">SVG</a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-pressed={previewMode === "solid"} onClick={() => setPreviewMode("solid")} className={previewMode === "solid" ? "rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]" : "rounded-lg border border-white/20 px-3 py-2 text-xs text-slate-200"}>{arabic ? "النموذج المجسم" : "Solid model"}</button>
            <button type="button" aria-pressed={previewMode === "layers"} onClick={() => setPreviewMode("layers")} className={previewMode === "layers" ? "rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]" : "rounded-lg border border-white/20 px-3 py-2 text-xs text-slate-200"}>{arabic ? "طبقات SVG" : "SVG layers"}</button>
          </div>
          <button type="button" disabled={editingDisabled} onClick={() => setEditingStructure((current) => !current)}
            className="mt-3 rounded-lg border border-[#a68ac6]/50 px-3 py-2 text-xs font-semibold text-[#e7d8f8] disabled:opacity-40">
            {editingStructure ? (arabic ? "إخفاء محرر الشبكة" : "Hide grid editor") : (arabic ? "تعديل الأعمدة والكمرات" : "Edit columns and beams")}
          </button>
          {editingStructure ? <StructureEditor key={JSON.stringify(building.proposal.structure ?? null)} proposal={building.proposal} locale={locale} wallMeshPreset={wallMeshPreset}
            onApply={(next) => { onBuildingChange(next); setEditingStructure(false); }} onCancel={() => setEditingStructure(false)} /> : null}
          {previewMode === "solid" && buildingMesh.ok ? (
            <div className="mt-4"><SolidModelViewer obj={buildingMesh.obj} selectedFloorId={floor.id} fallbackSvg={stackSvg} locale={locale} showStructure={showStructure} /></div>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-[#d4af37]/20 bg-[#0b171b] p-3">
                <InlineSvg source={stackSvg} label={arabic ? "معاينة طبقات المبنى ثلاثية الأبعاد" : "Illustrative 3D building floor stack"} />
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setRotation(((rotation + 3) % 4) as 0 | 1 | 2 | 3)} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200">{arabic ? "تدوير يسار" : "Rotate left"}</button>
                <button type="button" onClick={() => setRotation(((rotation + 1) % 4) as 0 | 1 | 2 | 3)} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200">{arabic ? "تدوير يمين" : "Rotate right"}</button>
              </div>
            </>
          )}
          <div className="mt-4 rounded-xl border border-[#d4af37]/20 bg-[#0b171b] p-4">
            <h3 className="text-sm font-bold text-white">{arabic ? "نموذج مبنى أولي قابل للتصدير" : "Exportable building concept"}</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">{arabic
              ? "ملف OBJ بالمتر وZ لأعلى: حوائط بفتحات وبلاطات وفتحة للنواة العليا. السلالم المضافة درجات وبسطات مبدئية، والأعمدة والكمرات شبكة تنسيق غير محسوبة. لا يوجد درابزين أو أساسات أو تحليل إنشائي."
              : "OBJ in meters, Z up: walls with openings, floor-cell plates and the upper core shaft. Authored stair treads and landings are concept geometry; columns and beams are unanalysed coordination members. No rails, footings or structural analysis."}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {([
                { key: "roofRise", ar: "ارتفاع الدور الأخير (م)", en: "Last storey height (m)" },
                { key: "doorHeadHeight", ar: "ارتفاع الباب (م)", en: "Door head (m)" },
                { key: "windowSillHeight", ar: "جلسة الشباك (م)", en: "Window sill (m)" },
                { key: "windowHeadHeight", ar: "أعلى الشباك (م)", en: "Window head (m)" },
                { key: "slabThickness", ar: "سماكة البلاطة (م)", en: "Slab thickness (m)" },
              ] as const).map((setting) => (
                <label key={setting.key} className="space-y-1 text-xs text-slate-300">
                  <span>{arabic ? setting.ar : setting.en}</span>
                  <input type="number" min="0" max="10" step="0.1" value={wallMeshPreset[setting.key]}
                    onChange={(event) => onWallMeshPresetChange({ ...wallMeshPreset, [setting.key]: Number(event.target.value) })}
                    className="w-full rounded-lg border border-white/20 bg-[#121f23] px-3 py-2 text-sm text-white outline-none focus:border-[#d4af37]" />
                </label>
              ))}
            </div>
            {buildingMesh.ok ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(buildingMesh.obj)}`} download="qattan-building-concept.obj"
                  className="rounded-lg bg-[#d4af37] px-3 py-2 text-xs font-bold text-[#101719]">{arabic ? "تنزيل نموذج المبنى OBJ" : "Download building OBJ"}</a>
                <span className="text-xs text-slate-400">{arabic ? `${buildingMesh.wallSolids} حائط · ${buildingMesh.slabSolids} بلاطة · ${buildingMesh.stairSolids} درجة/بسطة · ${buildingMesh.columnSolids} عمود · ${buildingMesh.beamSolids} كمرة · ${buildingMesh.openings} فتحة` : `${buildingMesh.wallSolids} walls · ${buildingMesh.slabSolids} slabs · ${buildingMesh.stairSolids} treads/landings · ${buildingMesh.columnSolids} columns · ${buildingMesh.beamSolids} beams · ${buildingMesh.openings} openings`}</span>
              </div>
            ) : <p role="alert" className="mt-3 text-xs text-amber-300">{meshError}</p>}
            {building.proposal.structure ? (
              <a href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(building.proposal.structure, null, 2))}`}
                download="qattan-structural-coordination.json" className="mt-3 inline-block text-xs font-semibold text-[#d8c7ee] underline underline-offset-4">
                {arabic ? "تنزيل بيانات التنسيق الإنشائي JSON" : "Download structural coordination JSON"}
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
