import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FooterStatus } from "./components/FooterStatus";
import { Header } from "./components/Header";
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
  return {
    imageDataUrl,
    prompt: `${prompt.trim()}${styleInstruction}`,
  };
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
      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || "تعذر إكمال الترميم.");
      }
      setOutputImage(data.imageUrl);
      setStatus("اكتمل الترميم الملكي — الواجهة جاهزة للمراجعة.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ أثناء الترميم.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="ambient-glow glow-one" />
      <div className="ambient-glow glow-two" />
      <Header />
      <main className="main-content">
        <div className="hero-intro" dir="rtl">
          <div>
            <span className="hero-label">المركز المصري للذكاء الاصطناعي · V111.1</span>
            <h2>ترميم بصري<br /><em>يليق بتاريخ القاهرة.</em></h2>
          </div>
          <p>حوّل صورة واجهتك الحالية إلى رؤية معمارية ملكية، مع مقارنة حيّة تحافظ على النسب وتكشف التفاصيل الجديدة.</p>
        </div>
        <Workspace
          inputPreview={inputPreview}
          outputImage={outputImage}
          prompt={prompt}
          isGenerating={isGenerating}
          onPromptChange={setPrompt}
          selectedStyle={selectedStyle}
          onStyleChange={setSelectedStyle}
          onUploadClick={() => fileInputRef.current?.click()}
          onRestore={handleRestore}
        />
        <p className="workspace-status" role="status" aria-live="polite">{status}</p>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
      </main>
      <FooterStatus />
    </div>
  );
}
