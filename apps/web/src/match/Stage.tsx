import { type ReactNode, useLayoutEffect, useState } from "react";
import en from "../strings/en.json";

export const STAGE_WIDTH = 1520;
export const STAGE_HEIGHT = 720;

/** Uniform scale that fits the logical stage into the window, letterboxed (ADR-0006). */
export function fitScale(width: number, height: number): number {
  return Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
}

/** The Match screen's fixed 19:9 stage, laid out at 1520×720 and scaled to fit. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const update = () => setScale(fitScale(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div className="stage-viewport">
      <div className="rotate-notice" role="status" data-testid="rotate-notice">
        <p>{en.rotateDevice}</p>
      </div>
      <div
        className="stage"
        data-testid="stage"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
