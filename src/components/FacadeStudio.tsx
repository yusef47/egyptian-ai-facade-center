import { useRef, type ChangeEvent, type DragEvent } from "react";

type FacadeStudioProps = {
  inputPreview: string | null;
  outputImage: string | null;
  prompt: string;
  isGenerating: boolean;
  status: string;
  onPromptChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File) => void;
  onRestore: () => void;
};

export function FacadeStudio({
  inputPreview,
  outputImage,
  prompt,
  isGenerating,
  status,
  onPromptChange,
  onFileChange,
  onFileDrop,
  onRestore,
}: FacadeStudioProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) onFileDrop(file);
  };

  return (
    <section className="studio-section" id="studio" dir="rtl" aria-labelledby="studio-title">
      <div className="section-heading studio-heading">
        <div>
          <span className="section-overline">02 · مختبر الواجهة</span>
          <h2 id="studio-title">استوديو <em>الترميم الذكي</em></h2>
        </div>
        <div className="studio-live"><span /> متصل بمحرك التوليد</div>
      </div>

      <div className="studio-shell glass-panel">
        <div className="studio-toolbar">
          <div className="studio-toolbar-title"><span className="toolbar-pulse" /> جلسة ترميم جديدة</div>
          <span className="studio-model">GEMINI 3.1 · IMAGE ENGINE</span>
        </div>
        <div className="studio-grid">
          <div className="studio-input-column">
            <div className="studio-label-row">
              <label htmlFor="facade-file-input">الواجهة الأصلية</label>
              <span>01 / INPUT</span>
            </div>
            <div
              className={`dropzone ${inputPreview ? "has-preview" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="رفع صورة الواجهة الأصلية"
            >
              {inputPreview ? (
                <img src={inputPreview} alt="الواجهة الأصلية" />
              ) : (
                <div className="dropzone-empty">
                  <span className="upload-ring" aria-hidden="true">↑</span>
                  <strong>اسحب صورة الواجهة هنا</strong>
                  <span>أو اضغط لاختيار ملف من جهازك</span>
                  <small>JPG · PNG · WEBP / حتى 10 ميجابايت</small>
                </div>
              )}
              <span className="dropzone-corner corner-a" aria-hidden="true" />
              <span className="dropzone-corner corner-b" aria-hidden="true" />
            </div>
          </div>

          <div className="studio-divider" aria-hidden="true"><span>→</span></div>

          <div className="studio-output-column">
            <div className="studio-label-row">
              <span>التصور المعماري المعاد</span>
              <span>02 / OUTPUT</span>
            </div>
            <div className={`output-canvas ${outputImage ? "has-output" : ""}`}>
              {outputImage ? (
                <img src={outputImage} alt="الواجهة بعد الترميم" />
              ) : isGenerating ? (
                <div className="output-loading"><span className="loading-orbit" /><strong>جاري إحياء الواجهة...</strong><small>تحليل النسب · المواد · الإضاءة</small></div>
              ) : (
                <div className="output-empty"><span className="output-star">✦</span><strong>ستظهر النتيجة هنا</strong><small>صورة ترميمية بدقة 8K</small></div>
              )}
              <span className="output-stamp">8K<br /><small>RESTORE</small></span>
            </div>
          </div>
        </div>

        <div className="studio-controls">
          <div className="prompt-field">
            <label htmlFor="design-prompt">رؤيتك المعمارية</label>
            <textarea
              id="design-prompt"
              aria-label="الوصف المعماري"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="اكتب رؤيتك: طراز خديوي، حجر هشمي، مشربيات خشبية، إضاءة ليلية..."
              rows={3}
            />
          </div>
          <button className="restore-button" type="button" aria-label="إرسال 🚀" onClick={onRestore} disabled={isGenerating}>
            <span>{isGenerating ? "جاري الإرسال..." : "إرسال 🚀"}</span>
            <small>{isGenerating ? "يتم بناء التصور" : "ابدأ الترميم الذكي"}</small>
          </button>
        </div>
        <p className="studio-status" role="status" aria-live="polite">{status}</p>
        <input
          ref={fileInputRef}
          id="facade-file-input"
          data-testid="facade-file-input"
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileChange}
        />
      </div>
    </section>
  );
}
