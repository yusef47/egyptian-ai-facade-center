import { useMemo, useState } from "react";

const palaceImage = "https://upload.wikimedia.org/wikipedia/commons/4/4b/Mohamed_Ali%27s_Palace%2C_Manial%2C_Cairo_Egypt.jpg";
const attributionUrl = "https://commons.wikimedia.org/wiki/File:Mohamed_Ali%27s_Palace,_Manial,_Cairo_Egypt.jpg";

const works = [
  {
    title: "Red Brick → Hashami Palace",
    meta: "دراسة مفهوم · ترميم هشمي خديوي",
    category: "واجهات",
    before: "red-brick",
    image: palaceImage,
    tag: "01",
  },
  {
    title: "Streetscape → Heritage Alleyway",
    meta: "دراسة مفهوم · إحياء المشهد العمراني",
    category: "شوارع",
    before: "streetscape",
    image: palaceImage,
    tag: "02",
  },
  {
    title: "قصر مانيل · الواجهة الملكية",
    meta: "مرجع تصويري · القاهرة",
    category: "واجهات",
    before: "reference",
    image: palaceImage,
    tag: "03",
  },
  {
    title: "قصر مانيل · تفاصيل العمارة",
    meta: "مرجع تصويري · زخارف ونسب تاريخية",
    category: "تفاصيل",
    before: "reference",
    image: palaceImage,
    tag: "04",
  },
];

const filters = ["الكل", "واجهات", "شوارع", "تفاصيل"];

export function HeritageGallery() {
  const [filter, setFilter] = useState("الكل");
  const visibleWorks = useMemo(
    () => filter === "الكل" ? works : works.filter((work) => work.category === filter),
    [filter],
  );

  return (
    <section className="gallery-section" id="gallery" aria-label="معرض ترميمات التراث" dir="rtl">
      <div className="section-intro-row gallery-intro">
        <div>
          <span className="eyebrow">03 · أرشيف الإحياء</span>
          <h2>روائع <em>استعادت حضورها</em></h2>
        </div>
        <p>دراسات مفهوم تربط الواجهة الحالية برؤية مصرية جديدة، مع صور مرجعية موثقة من قصر محمد علي بمانيل.</p>
      </div>
      <div className="gallery-toolbar">
        <span className="gallery-count">{String(visibleWorks.length).padStart(2, "0")} دراسات مختارة</span>
        <div className="gallery-filters" role="group" aria-label="تصفية مشاريع التراث">
          {filters.map((item) => (
            <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="gallery-grid">
        {visibleWorks.map((work) => (
          <article className={`gallery-card gallery-card-${work.tag}`} key={work.title}>
            <div className="gallery-image-wrap">
              {work.before === "reference" ? (
                <img className="image-contain" src={work.image} alt={work.title} loading="lazy" />
              ) : (
                <div className="gallery-before-after">
                  <div className={`gallery-before ${work.before}`}><span>BEFORE</span></div>
                  <div className="gallery-after">
                    <img className="image-contain" src={work.image} alt={`${work.title} photographic reference`} loading="lazy" />
                    <span>REFERENCE</span>
                  </div>
                </div>
              )}
              <span className="gallery-index">{work.tag}</span>
              <span className="gallery-overlay-label">CONCEPT STUDY</span>
            </div>
            <div className="gallery-card-copy">
              <div><h3>{work.title}</h3><p>{work.meta}</p></div>
              <span className="gallery-arrow" aria-hidden="true">↗</span>
            </div>
          </article>
        ))}
      </div>
      <p className="gallery-attribution">
        الصور المرجعية: <a href={attributionUrl} target="_blank" rel="noreferrer">Wikimedia Commons · قصر محمد علي بمانيل</a> · Noura Adel · CC BY-SA 4.0
      </p>
    </section>
  );
}
