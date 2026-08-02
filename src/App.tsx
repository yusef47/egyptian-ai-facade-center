import { useState, type ChangeEvent } from "react";
import { FacadeStudio } from "./components/FacadeStudio";
import { FooterStatus } from "./components/FooterStatus";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { NationalMetrics } from "./components/NationalMetrics";
import { SyndicateReport } from "./components/SyndicateReport";
import { compressImage } from "./lib/image";
import { downloadSyndicateReport } from "./lib/report";

const MAX_IMAGE_DATA_URL = 3_500_000;

export function App() {
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("جاهز — ارفع صورة الواجهة واكتب رؤيتك المعمارية.");
  const [search, setSearch] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus("يرجى اختيار ملف صورة صالح.");
      return;
    }
    try {
      const compressed = await compressImage(file);
      if (compressed.length > MAX_IMAGE_DATA_URL) {
        throw new Error("حجم الصورة بعد الضغط ما زال كبيراً. اختر صورة أصغر.");
      }
      setInputPreview(compressed);
      setImageDataUrl(compressed);
      setOutputImage(null);
      setCreatedAt(new Date().toISOString());
      setStatus("تم تحميل الواجهة. اكتب رؤيتك ثم أرسل طلب الترميم.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر تحميل الصورة.");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = "";
  };

  const handleRestore = async () => {
    if (!imageDataUrl) {
      setStatus("ارفع صورة الواجهة أولاً قبل بدء الترميم.");
      return;
    }
    if (prompt.trim().length < 3) {
      setStatus("اكتب وصفاً معمارياً قبل بدء الترميم.");
      return;
    }

    setIsGenerating(true);
    setOutputImage(null);
    setStatus("جاري تحليل الواجهة وإعادة تركيبها بالذكاء الاصطناعي...");
    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, prompt }),
      });
      const data = await response.json() as { imageDataUrl?: string; error?: string };
      if (!response.ok || !data.imageDataUrl) {
        throw new Error(data.error || "تعذر إكمال الترميم.");
      }
      setOutputImage(data.imageDataUrl);
      setCreatedAt((current) => current || new Date().toISOString());
      setStatus("اكتمل الترميم — الواجهة جاهزة للمراجعة الهندسية.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ أثناء الترميم.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadReport = () => {
    if (!prompt.trim() && !imageDataUrl && !outputImage) {
      setStatus("أنشئ جلسة ترميم أولاً حتى يمكن تصدير التقرير.");
      return;
    }
    downloadSyndicateReport({
      prompt,
      status,
      createdAt: createdAt || new Date().toISOString(),
      inputImageDataUrl: imageDataUrl,
      outputImageDataUrl: outputImage,
    });
    setStatus("تم تجهيز تقرير النقابة وتنزيله بنجاح.");
  };

  return (
    <div className="app-shell" dir="rtl">
      <div className="ambient-glow glow-one" aria-hidden="true" />
      <div className="ambient-glow glow-two" aria-hidden="true" />
      <div className="architectural-grid" aria-hidden="true" />
      <Header onSearch={setSearch} />
      <main>
        <Hero />
        <NationalMetrics />
        <FacadeStudio
          inputPreview={inputPreview}
          outputImage={outputImage}
          prompt={prompt}
          isGenerating={isGenerating}
          status={search ? `نتيجة البحث عن: ${search}` : status}
          onPromptChange={setPrompt}
          onFileChange={handleFileChange}
          onFileDrop={(file) => void handleFile(file)}
          onRestore={() => void handleRestore()}
        />
        <SyndicateReport
          prompt={prompt}
          status={status}
          inputImageDataUrl={imageDataUrl}
          outputImageDataUrl={outputImage}
          onDownload={handleDownloadReport}
        />
      </main>
      <FooterStatus />
    </div>
  );
}
