import { useRef, useState } from "react";
import type { PointerEvent } from "react";

export type WorkspaceProps = {
  inputPreview: string | null;
  outputImage: string | null;
  prompt: string;
  isGenerating: boolean;
  selectedStyle: string;
  onPromptChange: (value: string) => void;
  onUploadClick: () => void;
  onRestore: () => void;
  onStyleChange?: (style: string) => void;
};

const styles = [
  ["🏛️", "طراز خديوي"],
  ["🪵", "مشربيات خشبية"],
  ["🪨", "حجر هشمي"],
  ["🛕", "طراز فرعوني"],
] as const;

const DEMO_RESTORED_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/4/4b/Mohamed_Ali%27s_Palace%2C_Manial%2C_Cairo_Egypt.jpg";

function OriginalPlaceholder() {
  return (
    <div className="original-placeholder">
      <div className="brick-grid" />
      <div className="original-placeholder-copy">
        <span className="upload-glyph">↥</span>
        <strong>ارفع صورة الواجهة الأصلية</strong>
        <small>JPG · PNG · WEBP · بدون قص</small>
      </div>
    </div>
  );
}

function ImageLayer({
  image,
  alt,
  original,
}: {
  image: string | null;
  alt: string;
  original?: boolean;
}) {
  return image ? (
    <img
      className="studio-image image-contain"
      data-testid={original ? "original-image" : "restored-demo-image"}
      src={image}
      alt={alt}
      draggable={false}
    />
  ) : (
    <OriginalPlaceholder />
  );
}

export function Workspace({
  inputPreview,
  outputImage,
  prompt,
  isGenerating,
  selectedStyle,
  onPromptChange,
  onUploadClick,
  onRestore,
  onStyleChange,
}: WorkspaceProps) {
  const [splitPosition, setSplitPosition] = useState(50);
  const [viewMode, setViewMode] = useState<"slider" | "side-by-side">("slider");
  const dragPointerId = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const restoredImage = outputImage || DEMO_RESTORED_IMAGE;

  const updateSplitFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const next = Math.round(((clientX - bounds.left) / bounds.width) * 100);
    setSplitPosition(Math.max(0, Math.min(100, next)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragPointerId.current = event.pointerId;
    event.currentTarget.focus();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    updateSplitFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current === event.pointerId) {
      updateSplitFromClientX(event.clientX);
    }
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current === event.pointerId) {
      dragPointerId.current = null;
      if (typeof event.currentTarget.releasePointerCapture === "function") {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  return (
    <section className="studio-section" id="studio" aria-label="استوديو الذكاء الاصطناعي" dir="rtl">
      <div className="section-intro-row">
        <div>
          <span className="eyebrow">02 · مختبر الإحياء المعماري</span>
          <h2>استوديو الواجهة <em>الملكية</em></h2>
        </div>
        <div className="studio-status"><span /> Gemini Vision · جاهز للتحويل</div>
      </div>

      <div className="studio-shell glass-panel">
        <div className="studio-topbar">
          <span className="studio-code">EGYPT / 112.1</span>
          <div className="view-toggle" role="group" aria-label="طريقة عرض الصور">
            <button
              type="button"
              className={viewMode === "slider" ? "active" : ""}
              onClick={() => setViewMode("slider")}
            >مقارنة بالسلايدر</button>
            <button
              type="button"
              className={viewMode === "side-by-side" ? "active" : ""}
              onClick={() => setViewMode("side-by-side")}
            >عرض الصورتين كلياً</button>
          </div>
          <span className="studio-note">100% full frame · لا قص ولا تكبير</span>
        </div>

        <div
          ref={canvasRef}
          className={`transformation-canvas ${viewMode === "side-by-side" ? "side-by-side" : ""}`}
          data-testid="transformation-canvas"
        >
          <div className="transformation-layer restored-layer">
            <ImageLayer image={restoredImage} alt="قصر محمد علي بمانيل — الرؤية المعمارية الملكية" />
            <div className="layer-shade restored-shade" />
            <div className="layer-label restored-label"><span>✦</span> {outputImage ? "الترميم الملكي · 8K" : "مرجع تصويري · قصر مانيل"}</div>
          </div>

          <div
            className="transformation-layer original-layer"
            style={{ clipPath: viewMode === "slider" ? `inset(0 ${100 - splitPosition}% 0 0)` : "none" }}
          >
            <ImageLayer image={inputPreview} alt="صورة الواجهة الأصلية" original />
            <div className="layer-shade original-shade" />
            <div className="layer-label original-label">الواجهة الأصلية</div>
          </div>

          <div
            className="comparison-divider"
            role="slider"
            aria-label="سحب للمقارنة بين الواجهتين"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={splitPosition}
            tabIndex={0}
            style={{ left: `${splitPosition}%` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setSplitPosition((value) => Math.max(0, value - 5));
              if (event.key === "ArrowRight") setSplitPosition((value) => Math.min(100, value + 5));
            }}
          >
            <span className="divider-handle"><i /><i /><i /></span>
          </div>
          <span className="canvas-corner canvas-corner-tr" />
          <span className="canvas-corner canvas-corner-bl" />
          {isGenerating && (
            <div className="generation-overlay" role="status" aria-live="polite">
              <span className="generation-orbit" />
              <strong>جاري بناء الترميم الملكي</strong>
              <small>تحليل الكتلة · المواد · الضوء</small>
            </div>
          )}
        </div>

        <div className="canvas-caption">
          <span><i className="caption-dot original-dot" /> المصدر · الواجهة الحالية</span>
          <span className="canvas-caption-center">{viewMode === "slider" ? "اسحب الخط الذهبي للمقارنة" : "عرض كامل للصورتين"}</span>
          <span><i className="caption-dot restored-dot" /> {outputImage ? "الرؤية الملكية · 8K" : "مرجع تصويري · قصر مانيل"}</span>
        </div>

        <div className="floating-control-dock">
          <button className="upload-trigger" type="button" onClick={onUploadClick} disabled={isGenerating}>
            <span className="upload-trigger-icon">↥</span>
            <span><strong>رفع صورة الواجهة</strong><small>{inputPreview ? "تم التحميل · تغيير" : "صورة أصلية · JPG أو PNG"}</small></span>
          </button>
          <div className="dock-prompt">
            <label htmlFor="design-prompt">رؤيتك المعمارية</label>
            <textarea
              id="design-prompt"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="اكتب رؤيتك المعمارية..."
              rows={1}
            />
          </div>
          <div className="dock-styles" aria-label="اختيار النمط المعماري">
            {styles.map(([icon, style]) => (
              <button
                className={`style-chip ${selectedStyle === style ? "selected" : ""}`}
                key={style}
                type="button"
                aria-pressed={selectedStyle === style}
                onClick={() => onStyleChange?.(selectedStyle === style ? "" : style)}
                disabled={isGenerating}
              >
                <span>{icon}</span>{style}
              </button>
            ))}
          </div>
          <button className="royal-action" type="button" onClick={onRestore} disabled={isGenerating}>
            <span className="royal-action-star">✦</span>
            <span>{isGenerating ? "جاري الترميم الملكي..." : "بدء الترميم المعماري الملكي"}</span>
            <span className="royal-action-arrow">←</span>
          </button>
        </div>
      </div>
    </section>
  );
}
