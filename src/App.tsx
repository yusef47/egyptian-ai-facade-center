import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FooterStatus } from "./components/FooterStatus";
import { Header } from "./components/Header";
import { HeritageGallery } from "./components/HeritageGallery";
import { Workspace } from "./components/Workspace";
import { compressImage } from "./lib/image";

const MAX_IMAGE_DATA_URL = 3_500_000;

type RestoreRequestBody = {
  imageDataUrl: string;
  prompt: string;
};

export function buildRestoreRequestBody(
  imageDataUrl: string,
  prompt: string,
  selectedStyle = "",
): RestoreRequestBody {
  const styleInstruction = selectedStyle
    ? `\nArchitectural style direction: ${selectedStyle}.`
    : "";
  return { imageDataUrl, prompt: `${prompt.trim()}${styleInstruction}` };
}

function Hero() {
  return (
    <section className="hero-section" id="top" aria-labelledby="hero-title" dir="rtl">
      <div className="hero-copy">
        <span className="hero-kicker"><i /> منصة الإحياء المعماري · V112.0</span>
        <h1 id="hero-title">المنصة القومية لإعادة إحياء الهوية المعمارية المصرية بالذكاء الاصطناعي</h1>
        <p>نحوّل الواجهات المنسية إلى مستقبل بصري يحترم ذاكرة المكان، بلمسة من الذكاء الاصطناعي ودقة العمارة المصرية.</p>
        <a className="hero-cta" href="#studio"><span>اكتشف الاستوديو</span><b>↓</b></a>
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit-ring orbit-ring-one" />
        <div className="orbit-ring orbit-ring-two" />
        <div className="hero-monogram">م<br /><span>AI</span></div>
        <span className="orbit-note orbit-note-top">RE-IMAGINE / 01</span>
        <span className="orbit-note orbit-note-bottom">CAIRO · EGYPT</span>
      </div>
      <div className="hero-metrics" aria-label="مؤشرات المنصة">
        <div><strong>⚡ 3.0s</strong><span>Speed</span></div>
        <div><strong>🏛️ 8K</strong><span>Restoration</span></div>
        <div><strong>🇪🇬 Heritage</strong><span>Hashami &amp; Khedivial</span></div>
      </div>
    </section>
  );
}

export function App() {
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("جاهز — ارفع صورة الواجهة واكتب رؤيتك المعمارية.");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      if (compressed.length > MAX_IMAGE_DATA_URL) {
        throw new Error("حجم الصورة بعد الضغط ما زال كبيراً. اختر صورة أصغر.");
      }
      setInputPreview(compressed);
      setImageDataUrl(compressed);
      setOutputImage(null);
      setStatus("تم تحميل الواجهة. اختر الطراز واكتب رؤيتك ثم ابدأ الترميم.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر تحميل الصورة.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRestore = async () => {
    if (!imageDataUrl) {
      setStatus("يرجى رفع صورة الواجهة الأصلية أولاً.");
      return;
    }
    if (prompt.trim().length < 3) {
      setStatus("اكتب رؤيتك المعمارية قبل بدء الترميم.");
      return;
    }
    setIsGenerating(true);
    setOutputImage(null);
    setStatus("جاري تحليل الكتلة والمواد وإعادة تركيب الواجهة الملكية...");
    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRestoreRequestBody(imageDataUrl, prompt, selectedStyle)),
      });
      const data = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !data.imageUrl) throw new Error(data.error || "تعذر إكمال الترميم.");
      setOutputImage(data.imageUrl);
      setStatus("اكتمل الترميم الملكي — الواجهة جاهزة للمراجعة.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ أثناء الترميم.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-shell" id="app">
      <div className="ambient-glow glow-one" />
      <div className="ambient-glow glow-two" />
      <Header />
      <main className="main-content">
        <Hero />
        <Workspace
          inputPreview={inputPreview}
          outputImage={outputImage}
          prompt={prompt}
          isGenerating={isGenerating}
          selectedStyle={selectedStyle}
          onPromptChange={setPrompt}
          onStyleChange={setSelectedStyle}
          onUploadClick={() => fileInputRef.current?.click()}
          onRestore={handleRestore}
        />
        <p className="workspace-status" role="status" aria-live="polite">{status}</p>
        <HeritageGallery />
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
      </main>
      <FooterStatus />
    </div>
  );
}
