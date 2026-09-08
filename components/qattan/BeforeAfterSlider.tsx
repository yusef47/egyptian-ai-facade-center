"use client";

import { useState } from "react";

type BeforeAfterSliderProps = {
  beforeLabel: string;
  afterLabel: string;
  beforeSrc?: string;
  afterSrc?: string;
};

export default function BeforeAfterSlider({ beforeLabel, afterLabel, beforeSrc, afterSrc }: BeforeAfterSliderProps) {
  const [value, setValue] = useState(50);
  const updateFromKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const current = Number(event.currentTarget.value);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setValue(Math.min(100, current + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setValue(Math.max(0, current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setValue(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setValue(100);
    }
  };

  return (
    <div className="qattan-comparison" data-before-after="true">
      <div className="qattan-comparison-canvas" aria-hidden="true">
        <div className="qattan-architecture-scene qattan-scene-before">
          <div className="qattan-scene-sky" />
          <div className="qattan-scene-ground" />
          <div className="qattan-building qattan-building-wire">
            <span /><span /><span /><span /><span /><span />
          </div>
        </div>
        <div className="qattan-architecture-scene qattan-scene-after" style={{ clipPath: `inset(0 0 0 ${value}%)` }}>
          <div className="qattan-scene-sky" />
          <div className="qattan-scene-ground" />
          <div className="qattan-building qattan-building-render">
            <span /><span /><span /><span /><span /><span />
          </div>
        </div>
        {beforeSrc ? <img className="qattan-comparison-source qattan-comparison-before-image" src={beforeSrc} alt="" /> : null}
        {afterSrc ? <img className="qattan-comparison-source qattan-comparison-after-image" src={afterSrc} alt="" style={{ clipPath: `inset(0 0 0 ${value}%)` }} /> : null}
        <span className="qattan-comparison-label qattan-comparison-label-before">{beforeLabel}</span>
        <span className="qattan-comparison-label qattan-comparison-label-after">{afterLabel}</span>
        <span className="qattan-comparison-handle" style={{ left: `${value}%` }} />
      </div>
      <label className="qattan-comparison-control">
        <span className="qattan-sr-only">{`${beforeLabel} / ${afterLabel}`}</span>
        <input
          type="range"
          role="slider"
          min="0"
          max="100"
          step="1"
          value={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          onChange={(event) => setValue(Number(event.target.value))}
          onKeyDown={updateFromKey}
        />
      </label>
    </div>
  );
}
