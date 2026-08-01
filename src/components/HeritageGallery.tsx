import { useEffect, useMemo, useState } from "react";

const galleryItems = [
  {
    title: "Red Brick → Hashami Palace",
    meta: "دراسة مفهوم · ترميم هشمي خديوي",
    category: "واجهات",
    before: "red-brick",
    image: "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=1200&q=80",
    tag: "01",
  },
  {
    title: "Streetscape → Heritage Alleyway",
    meta: "دراسة مفهوم · إحياء المشهد العمراني",
    category: "شوارع",
    before: "streetscape",
    image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    tag: "02",
  },
  {
    title: "قصر مانيل - الواجهة الملكية",
    meta: "مرجع تصويري · القاهرة",
    category: "واجهات",
    before: "reference",
    image: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
    tag: "03",
  },
  {
    title: "تفاصيل العمارة الخديوية",
    meta: "مرجع تصويري · زخارف ونسب تاريخية",
    category: "تفاصيل",
    before: "reference",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    tag: "04",
  },
] as const;

const filters = ["الكل", "واجهات", "شوارع", "تفاصيل"];
const fallbackImage = galleryItems[2].image;
const inlinePlaceholder = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#28384a"/><stop offset="1" stop-color="#9a7449"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><path d="M140 610h920V350H140zM220 350V230h160v120m80 0V170h180v180m100 0V230h160v120" fill="none" stroke="#f0ce83" stroke-width="14"/><path d="M100 650h1000" stroke="#f0ce83" stroke-width="12"/><text x="600" y="735" fill="#f3eee2" font-family="sans-serif" font-size="34" text-anchor="middle">HERITAGE REFERENCE</text></svg>`,
)}`;

type FallbackImageProps = {
  src: string;
  alt: string;
  testId: string;
};

function FallbackImage({ src, alt, testId }: FallbackImageProps) {
  const [imageSrc, setImageSrc] = useState(src);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    setImageSrc(src);
    setFallbackAttempted(false);
  }, [src]);

  return (
    <img
      className="gallery-image w-full h-52 object-cover rounded-t-xl"
      data-testid={testId}
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (!fallbackAttempted) {
          setFallbackAttempted(true);
          setImageSrc(fallbackImage);
        } else {
          setImageSrc(inlinePlaceholder);
        }
      }}
    />
  );
}

export function HeritageGallery() {
  const [filter, setFilter] = useState("الكل");
  const visibleItems = useMemo(
    () => filter === "الكل" ? galleryItems : galleryItems.filter((item) => item.category === filter),
    [filter],
  );

  return (
    <section className="gallery-section" id="gallery" aria-label="معرض ترميمات التراث" dir="rtl">
      <div className="section-intro-row gallery-intro">
        <div>
          <span className="eyebrow">03 · أرشيف الإحياء</span>
          <h2>روائع <em>استعادت حضورها</em></h2>
        </div>
        <p>دراسات مفهوم تربط الواجهة الحالية برؤية مصرية جديدة، مع صور معمارية عالية الدقة من Unsplash.</p>
      </div>
      <div className="gallery-toolbar">
        <span className="gallery-count">{String(visibleItems.length).padStart(2, "0")} دراسات مختارة</span>
        <div className="gallery-filters" role="group" aria-label="تصفية مشاريع التراث">
          {filters.map((item) => (
            <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="gallery-grid">
        {visibleItems.map((item) => (
          <article className={`gallery-card gallery-card-${item.tag}`} key={item.title}>
            <div className="gallery-image-wrap">
              {item.before === "reference" ? (
                <FallbackImage src={item.image} alt={item.title} testId={`gallery-image-${item.tag}`} />
              ) : (
                <div className="gallery-before-after">
                  <div className={`gallery-before ${item.before}`}><span>BEFORE</span></div>
                  <div className="gallery-after">
                    <FallbackImage src={item.image} alt={`${item.title} photographic reference`} testId={`gallery-image-${item.tag}`} />
                    <span>REFERENCE</span>
                  </div>
                </div>
              )}
              <span className="gallery-index">{item.tag}</span>
              <span className="gallery-overlay-label">HIGH-RES STUDY</span>
            </div>
            <div className="gallery-card-copy">
              <div><h3>{item.title}</h3><p>{item.meta}</p></div>
              <span className="gallery-arrow" aria-hidden="true">↗</span>
            </div>
          </article>
        ))}
      </div>
      <p className="gallery-attribution">
        الصور التجريبية: <a href="https://unsplash.com" target="_blank" rel="noreferrer">Unsplash</a> · fallback بصري مضمّن عند تعذر تحميل أي صورة
      </p>
    </section>
  );
}
