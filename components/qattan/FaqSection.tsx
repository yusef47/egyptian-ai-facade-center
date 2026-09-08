"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Reveal } from "./Reveal";
import { useQattan } from "./QattanProviders";

export function FaqSection() {
  const { copy } = useQattan();
  const [open, setOpen] = useState(0);
  return (
    <section className="qattan-section qattan-faq-section">
      <div className="qattan-container qattan-faq-grid">
        <Reveal className="qattan-section-heading">
          <p className="qattan-eyebrow">{copy.faq.eyebrow}</p>
          <h2>{copy.faq.title}</h2>
        </Reveal>
        <div className="qattan-faq-list">
          {copy.faq.items.map((item, index) => (
            <div className="qattan-faq-item" key={item.question}>
              <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>
                <span>{item.question}</span><ChevronDown size={17} aria-hidden="true" className={open === index ? "qattan-faq-chevron-open" : ""} />
              </button>
              {open === index && <p>{item.answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
