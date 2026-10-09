"use client";

import { useEffect, useRef, useState } from "react";
import { InlineSvg } from "./InlineSvg";
import type { ArchitectLocale } from "./architect-copy";

/** Interactive view of the exact OBJ supplied for download. No second geometry generator. */
export function SolidModelViewer({ obj, selectedFloorId, fallbackSvg, locale, showStructure }: {
  obj: string;
  selectedFloorId: string;
  fallbackSvg: string;
  locale: ArchitectLocale;
  showStructure: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    if (typeof window.WebGLRenderingContext === "undefined") {
      setStatus("fallback");
      return;
    }
    void Promise.all([
      import("three"),
      import("three/addons/loaders/OBJLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
    ]).then(([THREE, { OBJLoader }, { OrbitControls }]) => {
      if (cancelled || !host.isConnected) return;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0b171b");
      const camera = new THREE.PerspectiveCamera(46, 1, 0.02, 5000);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
      cleanup = () => {
        renderer.dispose();
        renderer.domElement.remove();
      };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", locale === "ar" ? "نموذج المبنى الثلاثي الأبعاد القابل للدوران" : "Rotatable 3D building model");
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";

      const model = new OBJLoader().parse(obj);
      const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x213940, transparent: true, opacity: 0.75 });
      const disposeModel = () => {
        model.traverse((item) => {
          if (item instanceof THREE.Mesh) {
            item.geometry.dispose();
            (item.material as typeof outlineMaterial).dispose();
          } else if (item instanceof THREE.LineSegments) {
            item.geometry.dispose();
          }
        });
        outlineMaterial.dispose();
      };
      cleanup = () => {
        disposeModel();
        renderer.dispose();
        renderer.domElement.remove();
      };
      model.traverse((item) => {
        if (!(item instanceof THREE.Mesh)) return;
        const structural = item.name.startsWith("struct-");
        if (structural && !showStructure) {
          item.visible = false;
          return;
        }
        const slab = item.name.endsWith("_slab");
        const stair = item.name.startsWith("stair-");
        const selected = structural || stair || item.name.startsWith(`${selectedFloorId}_`);
        const column = item.name.startsWith("struct-column-");
        const beam = item.name.startsWith("struct-beam-");
        item.material = new THREE.MeshStandardMaterial({
          color: column ? 0x9d82be : beam ? 0xd4a84d : stair ? 0x66c6b8 : slab ? 0xb49b62 : 0xe4e7df,
          metalness: 0.04,
          roughness: 0.78,
          side: THREE.DoubleSide,
          transparent: structural || !selected,
          opacity: structural ? 0.82 : selected ? 1 : 0.24,
          depthWrite: selected,
        });
        if (selected) {
          item.add(new THREE.LineSegments(new THREE.EdgesGeometry(item.geometry, 18), outlineMaterial));
        }
      });
      scene.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      if (bounds.isEmpty()) throw new Error("Empty building model");
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 1);
      camera.position.set(center.x + radius * 0.9, center.y - radius * 1.1, center.z + radius * 0.85);
      camera.lookAt(center);
      camera.near = Math.max(0.01, radius / 1000);
      camera.far = radius * 30;
      camera.updateProjectionMatrix();

      scene.add(new THREE.AmbientLight(0xffffff, 2));
      const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
      sun.position.set(center.x + radius, center.y - radius, center.z + radius * 2);
      scene.add(sun);
      const grid = new THREE.GridHelper(Math.max(size.x, size.y) * 1.2, 12, 0x416168, 0x294148);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(center.x, center.y, bounds.min.z - 0.04);
      scene.add(grid);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.enableDamping = false;
      controls.minDistance = radius * 0.25;
      controls.maxDistance = radius * 8;
      controls.maxPolarAngle = Math.PI * 0.95;
      const render = () => renderer.render(scene, camera);
      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        render();
      };
      controls.addEventListener("change", render);
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
      observer?.observe(host);
      if (!observer) window.addEventListener("resize", resize);
      controls.update();
      resize();
      setStatus("ready");
      cleanup = () => {
        observer?.disconnect();
        if (!observer) window.removeEventListener("resize", resize);
        controls.removeEventListener("change", render);
        controls.dispose();
        disposeModel();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => {
      cleanup?.();
      cleanup = undefined;
      if (!cancelled) setStatus("fallback");
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [obj, selectedFloorId, locale, showStructure]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#d4af37]/20 bg-[#0b171b]">
      <div ref={hostRef} className="h-[420px] w-full sm:h-[520px]" />
      {status === "ready" ? (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[#0b171b]/80 px-3 py-1.5 text-xs text-[#e7d394]">
          {locale === "ar" ? "اسحب للدوران · العجلة للتكبير · زر الفأرة الأيمن للتحريك" : "Drag to orbit · wheel to zoom · right drag to pan"}
        </p>
      ) : status === "fallback" ? (
        <div className="absolute inset-0 overflow-auto p-3">
          <p className="mb-2 text-xs text-slate-400">{locale === "ar" ? "العرض التفاعلي غير متاح في هذا المتصفح؛ هذه معاينة الطبقات." : "Interactive 3D is unavailable in this browser; showing floor layers."}</p>
          <InlineSvg source={fallbackSvg} label={locale === "ar" ? "معاينة طبقات المبنى ثلاثية الأبعاد" : "Illustrative 3D building floor stack"} />
        </div>
      ) : <p role="status" className="absolute inset-0 grid place-items-center text-sm text-slate-400">{locale === "ar" ? "جارٍ تحميل النموذج..." : "Loading model..."}</p>}
    </div>
  );
}
