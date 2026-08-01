import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ArchitectChat, type ChatMessage } from "./components/ArchitectChat";
import { FooterStatus } from "./components/FooterStatus";
import { Header } from "./components/Header";
import { Workspace } from "./components/Workspace";
import { compressImage } from "./lib/image";

const MAX_IMAGE_DATA_URL = 3_500_000;

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    text: "أهلاً بك في استوديو الترميم المعماري. ارفع صورة الواجهة واكتب رؤيتك، وسأساعدك في تحويلها إلى تكوين مصري معاصر يحافظ على روح المكان.",
  },
  {
    id: 2,
    role: "user",
    text: "أريد واجهة خديوية هادئة مع حجر هشمي وإضاءة ليلية دافئة.",
  },
  {
    id: 3,
    role: "assistant",
    text: "اختيار ممتاز. سأحافظ على نسب الفتحات والكتلة الأصلية، مع إيقاع أفقي واضح، مشربيات من خشب الجوز، وفوانيس نحاسية بدرجة 2700K.",
  },
];

export function App() {
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("جاهز — ارفع صورة واكتب وصف التصميم ثم ابدأ الترميم.");
  const [chatDraft, setChatDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleMessages = useMemo(() => {
    if (!search.trim()) return messages;
    return messages.filter((message) => message.text.includes(search.trim()));
  }, [messages, search]);

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
      setStatus("تم تحميل الواجهة. اكتب رؤيتك ثم ابدأ الترميم.");
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
      setStatus("اكتب وصفاً معمارياً قبل بدء الترميم.");
      return;
    }

    setIsGenerating(true);
    setOutputImage(null);
    setStatus("جاري تحليل الكتلة والمواد وإعادة تركيب الواجهة...");
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
      setStatus("اكتمل الترميم — الواجهة جاهزة للمراجعة المعمارية.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ أثناء الترميم.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChatSend = () => {
    const text = chatDraft.trim();
    if (!text) return;
    const userMessage: ChatMessage = { id: Date.now(), role: "user", text };
    const assistantMessage: ChatMessage = {
      id: Date.now() + 1,
      role: "assistant",
      text: "سأضع هذه الرؤية في الاعتبار: الحفاظ على التكوين الأصلي أولاً، ثم ضبط المواد والإضاءة بما يخدم هوية الواجهة المصرية.",
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setChatDraft("");
  };

  return (
    <div className="app-shell">
      <div className="ambient-glow glow-one" />
      <div className="ambient-glow glow-two" />
      <Header onSearch={setSearch} />
      <main className="main-content">
        <div className="hero-intro" dir="rtl">
          <div>
            <span className="hero-label">منصة الترميم الرقمي · 2026</span>
            <h2>نمنح الواجهات المصرية<br /><em>مستقبلاً يليق بتاريخها.</em></h2>
          </div>
          <p>استوديو ذكاء اصطناعي بصري يحوّل صورة الواجهة الحالية إلى تصور معماري قابل للتنفيذ، مع الحفاظ على روح القاهرة وتفاصيلها.</p>
        </div>
        <Workspace
          inputPreview={inputPreview}
          outputImage={outputImage}
          prompt={prompt}
          isGenerating={isGenerating}
          onPromptChange={setPrompt}
          onUploadClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileChange}
          onRestore={handleRestore}
        />
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
        <ArchitectChat
          messages={visibleMessages}
          draft={chatDraft}
          onDraftChange={setChatDraft}
          onSend={handleChatSend}
        />
      </main>
      <FooterStatus />
    </div>
  );
}
