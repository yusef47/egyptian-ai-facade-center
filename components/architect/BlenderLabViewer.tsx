"use client";

import { useEffect, useRef, useState } from "react";

export function BlenderLabViewer({ glbBase64 }: { glbBase64: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !glbBase64) return;
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
      scene.add(new THREE.AmbientLight(0xffffff, 2));
      const sun = new THREE.DirectionalLight(0xffffff, 2.8);
      sun.position.set(20, 30, 15);
      scene.add(sun);
      let model: import("three").Object3D | null = null;
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
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
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
        scene.add(model);
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) { setError("النموذج الناتج فارغ"); return; }
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1);
        camera.position.set(center.x + radius, center.y + radius * 0.9, center.z + radius);
        camera.lookAt(center);
        camera.near = Math.max(radius / 1000, 0.01);
        camera.far = radius * 30;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
      }, () => setError("تعذر فتح ملف GLB"));
    }).catch(() => setError("العرض الثلاثي الأبعاد غير متاح في هذا المتصفح"));
    return () => { cancelled = true; cleanup(); };
  }, [glbBase64]);

  return <div className="relative h-full min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1116]">
    <div ref={hostRef} className="h-full min-h-[430px] w-full [&>canvas]:block" />
    {!glbBase64 && <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-slate-400">النموذج هيظهر هنا بعد أول طلب</div>}
    {error && <p role="alert" className="absolute bottom-4 right-4 rounded-lg bg-rose-950 px-3 py-2 text-sm text-rose-200">{error}</p>}
  </div>;
}
