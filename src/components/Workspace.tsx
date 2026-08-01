import type { ChangeEvent } from "react";

type WorkspaceProps = {
  inputPreview: string | null;
  outputImage: string | null;
  prompt: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onUploadClick: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRestore: () => void;
};

const badges = [
  "النمط الكلاسيكي الخديوي",
  "حجر هشمي",
  "إضاءة ليلية",
  "جودة 8K",
];

export function Workspace({
  inputPreview,
  outputImage,
  prompt,
  isGenerating,
  onPromptChange,
  onUploadClick,
  onFileChange,
  onRestore,
}: WorkspaceProps) {
  return (
    <section className="workspace-section" id="workspace">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">01 · تحليل بصري مباشر</span>
          <h1>المدخلات: الواجهة الحالية <span>📥</span></h1>
        </div>
        <div className="section-accent-line" />
        <div className="heading-meta">معالجة آمنة · 4K → 8K</div>
      </div>

      <div className="workspace-grid">
        <article className="facade-card input-card glass-panel">
          <div className="card-topline">
            <span className="card-kicker">المصدر الأصلي</span>
            <span className="card-index">A / 01</span>
          </div>
          <div className={`image-stage ${inputPreview ? "has-image" : ""}`}>
            {inputPreview ? (
              <img src={inputPreview} alt="صورة الواجهة الأصلية" />
            ) : (
              <button className="dropzone-button" onClick={onUploadClick}>
                <span className="upload-glyph">↑</span>
                <strong>ارفع صورة الواجهة</strong>
                <small>لم يتم رفع صورة بعد · JPG أو PNG · حتى 10 ميجابايت</small>
              </button>
            )}
            <div className="stage-corner top-right" />
            <div className="stage-corner bottom-left" />
          </div>
          <div className="image-caption">
            <span className="caption-dot" />
            <span>الواجهة الأصلية للطوب الأحمر والخرسانة</span>
          </div>
        </article>

        <article className="facade-card output-card glass-panel">
          <h2 className="output-card-title">
            <span>المخرجات: الترميم المعماري المعتمد على الذكاء الاصطناعي (8K)</span>
            <span aria-hidden="true"> ✨</span>
          </h2>
          <div className="card-topline">
            <span className="card-kicker gold-text">الناتج المعماري</span>
            <span className="card-index">B / 02</span>
          </div>
          <div className={`image-stage output-stage ${outputImage ? "has-image" : ""}`}>
            {outputImage ? (
              <img src={outputImage} alt="الواجهة المعمارية بعد الترميم" />
            ) : (
              <div className="empty-output">
                {isGenerating ? (
                  <>
                    <span className="generation-orbit" />
                    <strong>جاري تركيب الواجهة...</strong>
                    <small>Gemini 3.1 · تحليل المواد والكتلة</small>
                  </>
                ) : (
                  <>
                    <span className="output-mark">✦</span>
                    <strong>ستظهر الواجهة المعمارية هنا</strong>
                    <small>ابدأ الترميم لمشاهدة النتيجة</small>
                  </>
                )}
              </div>
            )}
            <div className="stage-corner top-left" />
            <div className="stage-corner bottom-right" />
          </div>
          <div className="image-caption output-caption">
            <span className="caption-dot gold-dot" />
            <span>Khedivial Cairo Heritage building</span>
            <span className="resolution-mark">8K</span>
          </div>
        </article>
      </div>

      <div className="workspace-toolbar glass-panel" dir="rtl">
        <div className="toolbar-actions">
          <button className="button button-primary" onClick={onRestore} disabled={isGenerating}>
            {isGenerating ? "جاري الترميم..." : "بدء الترميم ✨"}
          </button>
          <button className="button button-secondary" onClick={onUploadClick} disabled={isGenerating}>
            رفع الصورة 📤
          </button>
        </div>
        <div className="style-badges" aria-label="إعدادات الترميم">
          {badges.map((badge) => <span className="style-badge" key={badge}>{badge}</span>)}
        </div>
        <div className="prompt-row">
          <label htmlFor="design-prompt">التوجيه المعماري</label>
          <textarea
            id="design-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="اكتب وصف التصميم الذي تتخيله..."
            rows={2}
          />
        </div>
      </div>
    </section>
  );
}
