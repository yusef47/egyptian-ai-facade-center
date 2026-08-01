import { useState } from "react";

type WorkspaceProps = {
  inputPreview: string | null;
  outputImage: string | null;
  prompt: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onUploadClick: () => void;
  onRestore: () => void;
  selectedStyle: string;
  onStyleChange?: (style: string) => void;
};

const styles = ["طراز هشمي", "مشربيات خشبية", "طراز خديوي", "طراز فرعوني"];

function PalacePlaceholder() {
  return (
    <div className="palace-placeholder" data-testid="restored-placeholder" aria-hidden="true">
      <div className="placeholder-sky" />
      <div className="placeholder-moon" />
      <div className="palace-glow" />
      <div className="palace-building">
        <div className="palace-dome"><i /></div>
        <div className="palace-roof" />
        <div className="palace-facade">
          {Array.from({ length: 15 }, (_, index) => (
            <span className="palace-window" key={index}><i /></span>
          ))}
        </div>
        <div className="palace-entrance"><i /></div>
        <div className="palace-steps" />
      </div>
      <div className="palace-palms palm-one"><i /><b /><em /></div>
      <div className="palace-palms palm-two"><i /><b /><em /></div>
      <div className="palace-ground" />
    </div>
  );
}

export function Workspace({
  inputPreview,
  outputImage,
  prompt,
  isGenerating,
  onPromptChange,
  onUploadClick,
  onRestore,
  selectedStyle,
  onStyleChange,
}: WorkspaceProps) {
  const [splitPosition, setSplitPosition] = useState(50);

  const handleStyleChange = (style: string) => {
    onStyleChange?.(selectedStyle === style ? "" : style);
  };

  return (
    <section className="workspace-section" id="workspace" dir="rtl">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">01 · الاستوديو البصري الملكي</span>
          <h1>تحوّل الواجهة أمام عينيك</h1>
        </div>
        <div className="heading-signal">
          <span className="signal-dot" />
          <span>محرك Gemini · مباشر</span>
        </div>
      </div>

      <div className="transformation-shell glass-panel" role="region" aria-label="لوحة التحول المعماري">
        <div className="canvas-toolbar">
          <span className="canvas-index">EG · 111.1</span>
          <span className="canvas-hint">اسحب الخط الذهبي للمقارنة</span>
        </div>

        <div className="transformation-canvas">
          <div className="transformation-layer restored-layer">
            {outputImage ? (
              <img src={outputImage} alt="الواجهة بعد الترميم الملكي" />
            ) : (
              <PalacePlaceholder />
            )}
            <div className="layer-shade restored-shade" />
            <div className="layer-label restored-label"><span>✦</span> الترميم الملكي</div>
          </div>

          <div
            className="transformation-layer original-layer"
            style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
          >
            {inputPreview ? (
              <img src={inputPreview} alt="صورة الواجهة الأصلية" />
            ) : (
              <div className="original-placeholder">
                <div className="brick-grid" />
                <div className="original-placeholder-copy">
                  <span className="upload-glyph">↑</span>
                  <strong>ارفع صورة الواجهة الأصلية</strong>
                  <small>JPG · PNG · WEBP</small>
                </div>
              </div>
            )}
            <div className="layer-shade original-shade" />
            <div className="layer-label original-label">الواجهة الأصلية</div>
          </div>

          <div className="comparison-divider" style={{ left: `${splitPosition}%` }} aria-hidden="true">
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

        <label className="comparison-control">
          <span className="sr-only">مقارنة الواجهة الأصلية والترميم الملكي</span>
          <input
            aria-label="مقارنة الواجهة الأصلية والترميم الملكي"
            type="range"
            min="0"
            max="100"
            value={splitPosition}
            onChange={(event) => setSplitPosition(Number(event.target.value))}
          />
        </label>

        <div className="canvas-caption">
          <span><i className="caption-dot original-dot" /> المصدر · طوب أحمر وخرسانة</span>
          <span className="canvas-caption-center">اضغط واسحب للمشاهدة</span>
          <span><i className="caption-dot restored-dot" /> الرؤية الملكية · حجر هشمي</span>
        </div>
      </div>

      <div className="floating-control-dock glass-panel">
        <div className="dock-upload">
          <button className="upload-trigger" type="button" onClick={onUploadClick} disabled={isGenerating}>
            <span className="upload-trigger-icon">↥</span>
            <span><strong>رفع صورة الواجهة</strong><small>{inputPreview ? "تم التحميل · تغيير" : "صورة أصلية · JPG أو PNG"}</small></span>
          </button>
        </div>
        <div className="dock-divider" />
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
        <div className="dock-divider dock-divider-mobile" />
        <div className="dock-styles" aria-label="اختيار النمط المعماري">
          {styles.map((style) => (
            <button
              className={`style-chip ${selectedStyle === style ? "selected" : ""}`}
              key={style}
              type="button"
              aria-pressed={selectedStyle === style}
              onClick={() => handleStyleChange(style)}
              disabled={isGenerating}
            >
              <span>✦</span>{style}
            </button>
          ))}
        </div>
        <button className="royal-action" type="button" onClick={onRestore} disabled={isGenerating}>
          <span className="royal-action-star">✦</span>
          <span>{isGenerating ? "جاري الترميم الملكي..." : "بدء الترميم المعماري الملكي"}</span>
          <span className="royal-action-arrow">←</span>
        </button>
      </div>
    </section>
  );
}
