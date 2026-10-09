"use client";

import { useEffect, useRef, useState } from "react";

export function BlenderLabViewer({ glbBase64, showRoof = true }: { glbBase64: string | null; showRoof?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<import("three").Object3D | null>(null);
  const cameraStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(null);
  const showRoofRef = useRef(showRoof);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    showRoofRef.current = showRoof;
    modelRef.current?.traverse((object) => {
      if (object.name.startsWith("Roof")) object.visible = showRoof;
    });
  }, [showRoof]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !glbBase64) return;
    setError(null);
    let cancelled = false;
    let cleanup = () => {};
    void Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
    ]).then(([THREE, { GLTFLoader }, { OrbitControls }]) => {
      if (cancelled || !host.isConnected) return;
      const bytes = Uint8Array.from(atob(glbBase64), (char) => char.charCodeAt(0));
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0a1116");
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 1.3));
      const sun = new THREE.DirectionalLight(0xffffff, 2);
      sun.position.set(20, 30, 15);
      scene.add(sun);
      let model: import("three").Object3D | null = null;
      let grid: import("three").GridHelper | null = null;
      let frame = 0;
      const resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const render = () => {
        frame = requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
      };
      render();
      cleanup = () => {
        cameraStateRef.current = { position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] };
        modelRef.current = null;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        grid?.geometry.dispose();
        if (grid) {
          const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
          materials.forEach((material) => material.dispose());
        }
        model?.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
      new GLTFLoader().parse(bytes.buffer, "", (gltf) => {
        if (cancelled) return;
        model = gltf.scene;
        modelRef.current = model;
        model.traverse((object) => { if (object.name.startsWith("Roof")) object.visible = showRoofRef.current; });
        scene.add(model);
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) { setError("النموذج الناتج فارغ"); return; }
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1);
        grid = new THREE.GridHelper(Math.max(radius * 5, 10), 20, 0x7b8e99, 0x344751);
        grid.position.y = box.min.y - 0.02;
        scene.add(grid);
        const saved = cameraStateRef.current;
        if (saved) camera.position.fromArray(saved.position);
        else camera.position.set(center.x + radius * 2.2, center.y + radius * 1.8, center.z + radius * 2.2);
        camera.lookAt(center);
        camera.near = Math.max(radius / 1000, 0.01);
        camera.far = radius * 30;
        camera.updateProjectionMatrix();
        if (saved) controls.target.fromArray(saved.target);
        else controls.target.copy(center);
        controls.update();
      }, () => setError("تعذر فتح ملف GLB"));
    }).catch(() => setError("العرض الثلاثي الأبعاد غير متاح في هذا المتصفح"));
    return () => { cancelled = true; cleanup(); };
  }, [glbBase64]);

  return <div className="relative h-[min(70vh,720px)] min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1116]">
    <div ref={hostRef} className="absolute inset-0 h-full w-full [&>canvas]:block" />
    {!glbBase64 && <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-slate-400">النموذج هيظهر هنا بعد أول طلب</div>}
    {error && <p role="alert" className="absolute bottom-4 right-4 rounded-lg bg-rose-950 px-3 py-2 text-sm text-rose-200">{error}</p>}
  </div>;
}
