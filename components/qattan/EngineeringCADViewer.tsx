"use client";

import { Box, Download, FileBox, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import {
  ENGINEERING_VIEWS,
  ENGINEERING_VIEW_LABELS,
  buildEngineeringSolidPlan,
  type EngineeringGeometry,
  type EngineeringSolidPlan,
  type EngineeringView,
} from "../../lib/engineering-geometry";

/**
 * Real CAD board for Tool #9 — Engineering Multiview & 3D.
 *
 * The AI only read the drawing (structured geometry JSON); this component
 * rebuilds the part as a true CSG solid (base block minus every cut) and renders
 * the classic engineering sheet with Three.js:
 *
 *   ┌──────────────────────┬──────────────────────┐
 *   │ FRONT ELEVATION      │ SIDE VIEW            │
 *   ├──────────────────────┼──────────────────────┤
 *   │ TOP PLAN             │ ISOMETRIC PROJECTION │
 *   └──────────────────────┴──────────────────────┘
 *
 * Orthographic panels render visible edges as crisp black lines and hidden
 * edges as dashed grey lines (depth-buffer driven, exactly like a drafter's
 * hidden-line convention). The isometric panel is a shaded, drag-rotatable
 * 30-degree projection.
 */

type EngineeringCADViewerProps = {
  geometry: EngineeringGeometry;
  locale?: "en" | "ar";
  /** Called once with the board PNG so the studio session history can show it. */
  onRendered?: (dataUrl: string) => void;
};

export type CadViewport = {
  view: EngineeringView;
  /** Three.js viewport rect (origin = bottom-left, like WebGL). */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 2×2 panel rects in reading order: front, side, top, isometric. */
export function engineeringViewportRects(width: number, height: number): CadViewport[] {
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const rightWidth = Math.max(width - halfWidth, 1);
  const topHeight = Math.max(height - halfHeight, 1);
  return [
    { view: "front", x: 0, y: topHeight, width: halfWidth, height: halfHeight },
    { view: "side", x: halfWidth, y: topHeight, width: rightWidth, height: halfHeight },
    { view: "top", x: 0, y: 0, width: halfWidth, height: halfHeight },
    { view: "isometric", x: halfWidth, y: 0, width: rightWidth, height: halfHeight },
  ];
}

const VIEW_ALIASES: Record<EngineeringView, string[]> = {
  front: ["front", "elevation", "elev"],
  side: ["side", "profile"],
  top: ["top", "plan", "horizontal"],
  isometric: ["iso", "isometric", "3d", "perspective"],
};

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Dimension chips per panel: labels genuinely read off the drawing when the
 * analyzer extracted them, otherwise the block's own overall dimensions.
 */
export function engineeringPanelDimensions(
  plan: EngineeringSolidPlan,
  view: EngineeringView,
): string[] {
  const aliases = VIEW_ALIASES[view];
  const extracted = plan.dimensions
    .filter((dimension) => {
      const raw = (dimension.view ?? dimension.position ?? "").toLowerCase();
      return aliases.some((alias) => raw.includes(alias));
    })
    .map((dimension) => dimension.label)
    .slice(0, 3);
  if (extracted.length > 0) return extracted;

  const { width, height, depth } = plan.block;
  switch (view) {
    case "front":
      return [`${formatNumber(width)} × ${formatNumber(height)}`];
    case "side":
      return [`${formatNumber(depth)} × ${formatNumber(height)}`];
    case "top":
      return [`${formatNumber(width)} × ${formatNumber(depth)}`];
    default:
      return [`${formatNumber(width)} × ${formatNumber(height)} × ${formatNumber(depth)}`];
  }
}

type CadWorld = {
  three: typeof import("three");
  renderer: ThreeTypes.WebGLRenderer;
  scene: ThreeTypes.Scene;
  mesh: ThreeTypes.Mesh;
  isoMaterial: ThreeTypes.MeshStandardMaterial;
  orthoMaterial: ThreeTypes.MeshBasicMaterial;
  visibleEdges: ThreeTypes.LineSegments;
  hiddenEdges: ThreeTypes.LineSegments;
  cameras: Record<"front" | "side" | "top", ThreeTypes.OrthographicCamera> & {
    isometric: ThreeTypes.PerspectiveCamera;
  };
  geometry: ThreeTypes.BufferGeometry;
  radius: number;
};

/**
 * Edge extraction tolerance in degrees. CSG output is triangulated, so a low
 * threshold draws every triangulation diagonal as a stray internal line in the
 * flat orthographic views. 25° collapses coplanar triangles while still keeping
 * real chamfers, inclines and notch corners.
 */
export const CAD_EDGE_THRESHOLD = 25;

const DEFAULT_ROTATION = {
  azimuth: Math.PI / 4,
  // True isometric elevation: atan(1/√2) ≈ 35.264°.
  elevation: Math.atan(1 / Math.SQRT2),
  zoom: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Configures one panel's camera (orthographic projections + isometric). */
function configureCamera(
  world: CadWorld,
  view: EngineeringView,
  aspect: number,
  rotation: { azimuth: number; elevation: number; zoom: number },
): void {
  const { radius } = world;
  const safeAspect = Math.max(aspect, 0.05);

  if (view === "isometric") {
    const camera = world.cameras.isometric;
    camera.aspect = safeAspect;
    const distance = (radius * 3.1) / Math.max(rotation.zoom, 0.2);
    const cosElevation = Math.cos(rotation.elevation);
    camera.position.set(
      distance * cosElevation * Math.sin(rotation.azimuth),
      distance * Math.sin(rotation.elevation),
      distance * cosElevation * Math.cos(rotation.azimuth),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(radius * 0.05, 0.01);
    camera.far = distance * 6;
    camera.updateProjectionMatrix();
    return;
  }

  const camera = world.cameras[view];
  const block = world.mesh.userData.extent as {
    width: number;
    height: number;
    depth: number;
  };
  const spans: Record<"front" | "side" | "top", [number, number]> = {
    front: [block.width, block.height],
    side: [block.depth, block.height],
    top: [block.width, block.depth],
  };
  const [horizontal, vertical] = spans[view];
  const halfVertical = (Math.max(vertical, horizontal / safeAspect) / 2) * 1.28;
  const halfHorizontal = halfVertical * safeAspect;
  camera.left = -halfHorizontal;
  camera.right = halfHorizontal;
  camera.top = halfVertical;
  camera.bottom = -halfVertical;
  const distance = radius * 6;
  camera.position.set(0, 0, 0);
  if (view === "front") camera.position.set(0, 0, distance);
  else if (view === "side") camera.position.set(distance, 0, 0);
  else camera.position.set(0, distance, 0);
  // Top view looks straight down with the FRONT of the part facing the
  // bottom of the sheet, matching standard orthographic projection practice.
  camera.up.set(0, 0, view === "top" ? -1 : 1);
  camera.lookAt(0, 0, 0);
  camera.near = 0.01;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
}

/** Serialises the solid to Wavefront OBJ (bonus: download the 3D model). */
export function solidToObjText(
  positions: number[],
  indices: number[] | null,
  name: string,
): string {
  const lines = [`# Qattan AI — engineering solid`, `o ${name.replace(/\s+/g, "_")}`];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    lines.push(`v ${positions[index]} ${positions[index + 1]} ${positions[index + 2]}`);
  }
  if (indices && indices.length > 0) {
    for (let index = 0; index + 2 < indices.length; index += 3) {
      lines.push(`f ${indices[index] + 1} ${indices[index + 1] + 1} ${indices[index + 2] + 1}`);
    }
  } else {
    for (let index = 0; index + 2 < positions.length / 3; index += 3) {
      lines.push(`f ${index + 1} ${index + 2} ${index + 3}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export default function EngineeringCADViewer({
  geometry,
  locale = "en",
  onRendered,
}: EngineeringCADViewerProps) {
  const L = locale === "ar";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isoCellRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<CadWorld | null>(null);
  const rotationRef = useRef({ ...DEFAULT_ROTATION });
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    azimuth: number;
    elevation: number;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const [spinning, setSpinning] = useState(false);
  // Latest snapshot callback (kept in a ref so the CSG build never restarts
  // just because the parent re-rendered) and a once-per-geometry latch.
  const onRenderedRef = useRef(onRendered);
  const renderedOnceRef = useRef(false);

  const plan = useMemo(() => buildEngineeringSolidPlan(geometry), [geometry]);
  const dimensionChips = useMemo(
    () =>
      Object.fromEntries(
        ENGINEERING_VIEWS.map((view) => [view, engineeringPanelDimensions(plan, view)]),
      ) as Record<EngineeringView, string[]>,
    [plan],
  );

  const renderBoard = useCallback(() => {
    const world = worldRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;
    const { renderer, scene } = world;
    const size = new world.three.Vector2();
    renderer.getSize(size);

    for (const rect of engineeringViewportRects(size.x, size.y)) {
      renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
      renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
      renderer.setScissorTest(true);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, true, true);

      configureCamera(world, rect.view, rect.width / Math.max(rect.height, 1), rotationRef.current);
      const isIsometric = rect.view === "isometric";
      world.mesh.material = isIsometric ? world.isoMaterial : world.orthoMaterial;
      world.visibleEdges.visible = true;
      // Hidden edges are dashed grey and drawn only where the solid occludes
      // them (depthFunc GREATER) — the classic hidden-line convention.
      world.hiddenEdges.visible = !isIsometric;
      renderer.render(scene, world.cameras[rect.view]);
    }
  }, []);

  // Build the CSG solid and the four-panel sheet once per geometry.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const resetRotation = { ...DEFAULT_ROTATION };
    rotationRef.current = resetRotation;
    setStatus("loading");

    void (async () => {
      try {
        const THREE = await import("three");
        const { CSG } = await import("three-csg-ts");
        if (disposed) return;

        const { width, height, depth } = plan.block;
        let solid: ThreeTypes.Mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
        );
        solid.updateMatrix();

        for (const cut of plan.cuts) {
          const cutter =
            cut.kind === "cylinder"
              ? new THREE.Mesh(
                  new THREE.CylinderGeometry(cut.radius, cut.radius, cut.length, 48),
                )
              : new THREE.Mesh(new THREE.BoxGeometry(cut.size[0], cut.size[1], cut.size[2]));
          if (cut.kind === "cylinder") {
            // CylinderGeometry runs along +Y; rotate onto the requested axis.
            if (cut.axis === "x") cutter.rotation.z = Math.PI / 2;
            else if (cut.axis === "z") cutter.rotation.x = Math.PI / 2;
          } else if (cut.rotationZ) {
            cutter.rotation.z = cut.rotationZ;
          }
          cutter.position.set(cut.center[0], cut.center[1], cut.center[2]);
          cutter.updateMatrix();
          solid = CSG.subtract(solid, cutter);
          cutter.geometry.dispose();
          (cutter.material as ThreeTypes.Material).dispose();
        }
        if (disposed || !solid.geometry) return;

        const scene = new THREE.Scene();
        const radius = 0.5 * Math.hypot(width, height, depth);

        const orthoMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const isoMaterial = new THREE.MeshStandardMaterial({
          color: 0xc9ced6,
          metalness: 0.05,
          roughness: 0.72,
          flatShading: true,
        });
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a4, 1.05));
        const key = new THREE.DirectionalLight(0xffffff, 1.5);
        key.position.set(1, 1.4, 1);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xdfe6f2, 0.55);
        rim.position.set(-1.2, -0.6, -1);
        scene.add(rim);

        const mesh = new THREE.Mesh(solid.geometry, orthoMaterial);
        mesh.userData.extent = { width, height, depth };
        scene.add(mesh);

        const edgeGeometry = new THREE.EdgesGeometry(solid.geometry, CAD_EDGE_THRESHOLD);
        const visibleEdges = new THREE.LineSegments(
          edgeGeometry,
          new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 1 }),
        );
        const hiddenEdges = new THREE.LineSegments(
          edgeGeometry,
          new THREE.LineDashedMaterial({
            color: 0x94a3b8,
            dashSize: Math.max(radius * 0.035, 0.4),
            gapSize: Math.max(radius * 0.022, 0.25),
            depthFunc: THREE.GreaterDepth,
            // Never write depth: the dashed pass may only READ the solid's
            // depth buffer, otherwise it would occlude the solid edges that
            // follow it and turn visible lines into hidden ones.
            depthWrite: false,
          }),
        );
        hiddenEdges.computeLineDistances();
        // Rendering order is essential: fill first (writes depth), then the
        // dashed hidden edges (only where occluded), then the visible edges.
        mesh.renderOrder = 0;
        hiddenEdges.renderOrder = 1;
        visibleEdges.renderOrder = 2;
        scene.add(visibleEdges);
        scene.add(hiddenEdges);

        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0xffffff, 1);

        const cameras = {
          front: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, radius * 40),
          side: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, radius * 40),
          top: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, radius * 40),
          isometric: new THREE.PerspectiveCamera(30, 1, radius * 0.05, radius * 40),
        };

        const world: CadWorld = {
          three: THREE,
          renderer,
          scene,
          mesh,
          isoMaterial,
          orthoMaterial,
          visibleEdges,
          hiddenEdges,
          cameras,
          geometry: solid.geometry,
          radius,
        };
        worldRef.current = world;

        const resize = () => {
          const rect = container.getBoundingClientRect();
          const nextWidth = Math.max(Math.floor(rect.width), 1);
          const nextHeight = Math.max(Math.floor(rect.height), 1);
          renderer.setSize(nextWidth, nextHeight, false);
          renderBoard();
        };
        resize();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(container);
        } else {
          window.addEventListener("resize", resize);
        }

        setStatus("ready");
        if (!renderedOnceRef.current) {
          renderedOnceRef.current = true;
          try {
            renderBoard();
            canvas.toBlob((blob) => {
              if (!blob || disposed) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") onRenderedRef.current?.(reader.result);
              };
              reader.readAsDataURL(blob);
            }, "image/png");
          } catch {
            /* Canvas readback unavailable — history simply keeps the text entry. */
          }
        }
      } catch {
        if (!disposed) setStatus("unsupported");
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const world = worldRef.current;
      worldRef.current = null;
      if (world) {
        world.geometry.dispose();
        world.visibleEdges.geometry.dispose();
        (world.visibleEdges.material as ThreeTypes.Material).dispose();
        (world.hiddenEdges.material as ThreeTypes.Material).dispose();
        world.isoMaterial.dispose();
        world.orthoMaterial.dispose();
        world.renderer.dispose();
      }
    };
  }, [plan, renderBoard]);

  // Keep the latest onRendered without rebuilding the world.
  useEffect(() => {
    onRenderedRef.current = onRendered;
  }, [onRendered]);

  // Non-passive wheel zoom over the isometric panel (page must not scroll).
  useEffect(() => {
    const cell = isoCellRef.current;
    if (!cell) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      rotationRef.current.zoom = clamp(
        rotationRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08),
        0.45,
        3.2,
      );
      renderBoard();
    };
    cell.addEventListener("wheel", onWheel, { passive: false });
    return () => cell.removeEventListener("wheel", onWheel);
  }, [renderBoard]);

  const resetView = () => {
    rotationRef.current = { ...DEFAULT_ROTATION };
    setSpinning(false);
    renderBoard();
  };

  const onIsoPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      azimuth: rotationRef.current.azimuth,
      elevation: rotationRef.current.elevation,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture unsupported — drag still works without it. */
    }
  };

  const onIsoPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    rotationRef.current.azimuth = drag.azimuth - (event.clientX - drag.x) * 0.01;
    rotationRef.current.elevation = clamp(
      drag.elevation + (event.clientY - drag.y) * 0.01,
      -Math.PI / 2 + 0.08,
      Math.PI / 2 - 0.08,
    );
    setSpinning(true);
    renderBoard();
  };

  const onIsoPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* Nothing to release. */
    }
  };

  const triggerDownload = (href: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const partSlug = (plan.label ?? `part-${Math.round(plan.block.width)}`).slice(0, 40);

  const downloadBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      renderBoard();
      triggerDownload(canvas.toDataURL("image/png"), `qattan-engineering-${partSlug}.png`);
    } catch {
      /* Canvas readback unavailable (no WebGL) — nothing to download. */
    }
  };

  const downloadModel = () => {
    const world = worldRef.current;
    if (!world) return;
    try {
      const position = world.geometry.attributes.position;
      const positions: number[] = [];
      for (let index = 0; index < position.count; index += 1) {
        positions.push(position.getX(index), position.getY(index), position.getZ(index));
      }
      const index = world.geometry.index;
      const indices = index ? Array.from(index.array as ArrayLike<number>) : null;
      const obj = solidToObjText(positions, indices, partSlug);
      triggerDownload(
        `data:text/plain;charset=utf-8,${encodeURIComponent(obj)}`,
        `qattan-engineering-${partSlug}.obj`,
      );
    } catch {
      /* Export unavailable — ignore. */
    }
  };

  const ariaLabel = L
    ? `لوحة الرسم الهندسي: المسقط الرأسي والجانبي والأفقي والمنظور ثلاثي الأبعاد${
        plan.label ? ` — ${plan.label}` : ""
      }`
    : `Engineering CAD board: front elevation, side view, top plan and 3D isometric projection${
        plan.label ? ` — ${plan.label}` : ""
      }`;

  return (
    <div className="qattan-cad" ref={containerRef} dir={L ? "rtl" : "ltr"}>
      <div className="qattan-cad-stage">
        <canvas ref={canvasRef} className="qattan-cad-canvas" role="img" aria-label={ariaLabel} />
        <div className="qattan-cad-overlay">
          {ENGINEERING_VIEWS.map((view) => {
            const isIsometric = view === "isometric";
            return (
              <div
                key={view}
                ref={isIsometric ? isoCellRef : undefined}
                className={`qattan-cad-cell ${isIsometric ? "qattan-cad-cell-iso" : ""}`}
                data-view={view}
                onPointerDown={isIsometric ? onIsoPointerDown : undefined}
                onPointerMove={isIsometric ? onIsoPointerMove : undefined}
                onPointerUp={isIsometric ? onIsoPointerUp : undefined}
                onPointerCancel={isIsometric ? onIsoPointerUp : undefined}
              >
                <span className="qattan-cad-label">
                  {L ? ENGINEERING_VIEW_LABELS[view].ar : ENGINEERING_VIEW_LABELS[view].en}
                </span>
                <div className="qattan-cad-dims">
                  {dimensionChips[view].map((chip) => (
                    <span key={`${view}-${chip}`} className="qattan-cad-dim">
                      {chip}
                    </span>
                  ))}
                </div>
                {isIsometric && (
                  <span className={`qattan-cad-hint ${spinning ? "qattan-cad-hint-active" : ""}`}>
                    <RotateCcw size={13} aria-hidden="true" />
                    {L ? "اسحب للتدوير" : "Drag to rotate"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {status !== "ready" && (
          <div className="qattan-cad-status" role="status">
            {status === "loading" ? (
              <>
                <Box size={26} aria-hidden="true" />
                <p>{L ? "جارٍ بناء المجسم ثلاثي الأبعاد…" : "Building the 3D solid…"}</p>
              </>
            ) : (
              <p className="qattan-cad-fallback">
                {L
                  ? "المعاينة ثلاثية الأبعاد غير مدعومة على هذا الجهاز، لكن الهندسة المستخرجة جاهزة بالأسفل."
                  : "3D preview is not supported on this device, but the extracted geometry is listed below."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="qattan-cad-toolbar">
        <div className="qattan-cad-meta">
          <span className="qattan-cad-part">
            {plan.label ?? (L ? "المجسم الهندسي المستنتج" : "Deduced engineering solid")}
          </span>
          <span className="qattan-cad-count">
            {L
              ? `الأبعاد: ${formatNumber(plan.block.width)} × ${formatNumber(plan.block.height)} × ${formatNumber(plan.block.depth)}`
              : `Block: ${formatNumber(plan.block.width)} × ${formatNumber(plan.block.height)} × ${formatNumber(plan.block.depth)}`}
            {" · "}
            {L ? `${plan.cuts.length} عملية قطع` : `${plan.cuts.length} cut operations`}
          </span>
          {geometry.estimated && (
            <span className="qattan-cad-estimated">
              {L
                ? "⚠ الأبعاد تقديرية (لم تُقرأ من الرسم) — راجع المقاسات قبل الاستخدام"
                : "⚠ Dimensions estimated (not read from the drawing) — verify before use"}
            </span>
          )}
        </div>
        <div className="qattan-cad-actions">
          <button type="button" className="qattan-cad-action" onClick={resetView}>
            <RotateCcw size={15} aria-hidden="true" />
            {L ? "إعادة ضبط الدوران" : "Reset view"}
          </button>
          <button type="button" className="qattan-cad-action" onClick={downloadModel}>
            <FileBox size={15} aria-hidden="true" />
            {L ? "تنزيل المجسم OBJ" : "Download 3D model"}
          </button>
          <button
            type="button"
            className="qattan-cad-action qattan-cad-action-primary"
            onClick={downloadBoard}
          >
            <Download size={15} aria-hidden="true" />
            {L ? "تنزيل اللوحة PNG" : "Download board PNG"}
          </button>
        </div>
      </div>
    </div>
  );
}
