"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { type PointerEvent, type ReactNode } from "react";

type TiltCardProps = {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  /** Static base rotation composed with the interactive tilt. */
  baseRotate?: number;
};

/**
 * Interactive 3D perspective tilt wrapper. The card rotates toward the
 * cursor (rotateX/rotateY, 1000px perspective) with a glossy specular
 * glare that tracks the pointer. Disabled for reduced-motion users.
 */
export function TiltCard({ children, className, maxTilt = 10, baseRotate }: TiltCardProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const hoverAmount = useMotionValue(0);

  const springX = useSpring(pointerX, { stiffness: 180, damping: 20 });
  const springY = useSpring(pointerY, { stiffness: 180, damping: 20 });
  const springHover = useSpring(hoverAmount, { stiffness: 200, damping: 24 });

  const rotateX = useTransform(springY, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-maxTilt, maxTilt]);
  const glareX = useTransform(springX, [-0.5, 0.5], ["12%", "88%"]);
  const glareY = useTransform(springY, [-0.5, 0.5], ["12%", "88%"]);
  const glareOpacity = useTransform(springHover, [0, 1], [0, 0.6]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerEnter = () => hoverAmount.set(1);
  const handlePointerLeave = () => {
    hoverAmount.set(0);
    pointerX.set(0);
    pointerY.set(0);
  };

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={`qattan-tilt${className ? ` ${className}` : ""}`}
      style={{
        rotateX,
        rotateY,
        ...(baseRotate !== undefined ? { rotate: baseRotate } : {}),
        transformPerspective: 1000,
      }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      <motion.span
        className="qattan-tilt-glare"
        aria-hidden="true"
        style={{ left: glareX, top: glareY, opacity: glareOpacity }}
      />
    </motion.div>
  );
}

export default TiltCard;
