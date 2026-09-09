"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type BeforeAfterSliderProps = {
  beforeLabel: string;
  afterLabel: string;
  beforeSrc?: string;
  afterSrc?: string;
};

const SCAN_DURATION_MS = 5200;

/**
 * Plays an automatic two-pass laser sweep on mount (0→100→0→50) so the
 * transformation demos itself before the user drags. The scan starts
 * only after mount (in an effect) so server and client render the same
 * initial HTML, and any pointer or keyboard interaction cancels it.
 */
function useAutoScan(enabled: boolean) {
  const [value, setValue] = useState(50);
  const [scanning, setScanning] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    if (enabled) setScanning(true);
  }, [enabled]);

  useEffect(() => {
    if (!scanning) return undefined;
    let start = 0;
    const tick = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / SCAN_DURATION_MS, 1);
      let position: number;
      if (progress < 0.35) {
        position = (progress / 0.35) * 100;
      } else if (progress < 0.7) {
        position = 100 - ((progress - 0.35) / 0.35) * 100;
      } else {
        position = ((progress - 0.7) / 0.3) * 50;
      }
      setValue(position);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setValue(50);
        setScanning(false);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [scanning]);

  const cancel = () => setScanning(false);
  return { value, setValue, scanning, cancel };
}

export default function BeforeAfterSlider({ beforeLabel, afterLabel, beforeSrc, afterSrc }: BeforeAfterSliderProps) {
  const reduceMotion = (useReducedMotion() ?? false) || typeof requestAnimationFrame === "undefined";
  const { value, setValue, scanning, cancel } = useAutoScan(!reduceMotion);

  const updateFromKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    cancel();
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
        {scanning && <span className="qattan-laser-scan" style={{ left: `${value}%` }} />}
        {/* Vector fallback scenes render only when no real imagery is provided. */}
        {!beforeSrc && !afterSrc && (
          <>
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
          </>
        )}
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
          aria-valuenow={Math.round(value)}
          onChange={(event) => {
            cancel();
            setValue(Number(event.target.value));
          }}
          onKeyDown={updateFromKey}
          onPointerDown={cancel}
        />
      </label>
    </div>
  );
}
