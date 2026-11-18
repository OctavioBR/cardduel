import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import en from "../strings/en.json";

/** The reference layout, 19:9 (ADR-0006): the stage is never shorter than this. */
export const STAGE_WIDTH = 1520;
export const STAGE_HEIGHT = 720;
/** The stage takes the window's shape between these; outside them it letterboxes. */
export const MIN_ASPECT = 16 / 11;
export const MAX_ASPECT = 20 / 9;
/** Narrowest logical width: a full starting hand still fits without scrolling. */
const MIN_WIDTH = 1360;

export interface StageSize {
  width: number;
  height: number;
  scale: number;
}

/**
 * Logical stage size for a window, and the uniform scale that fits it (ADR-0006).
 * Wider than 19:9 the stage keeps its 720 height and gains width; squarer than 19:9 it keeps
 * roughly the reference area, trading width for height, so the board grows taller rather than
 * cards shrinking.
 */
export function stageSize(windowWidth: number, windowHeight: number): StageSize {
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, windowWidth / windowHeight));
  let width: number;
  let height: number;
  if (aspect >= STAGE_WIDTH / STAGE_HEIGHT) {
    height = STAGE_HEIGHT;
    width = STAGE_HEIGHT * aspect;
  } else {
    width = Math.max(MIN_WIDTH, Math.sqrt(STAGE_WIDTH * STAGE_HEIGHT * aspect));
    height = width / aspect;
  }
  const scale = Math.min(windowWidth / width, windowHeight / height);
  return { width, height, scale };
}

/**
 * The Match screen's stage: laid out at a logical size near 1520×720 and scaled to fit the area
 * inside the side safe areas (notch or Dynamic Island in landscape).
 */
export function Stage({ children }: { children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StageSize>({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    scale: 1,
  });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize(stageSize(width, height));
    };
    update();
    // Fires when the area itself changes: window resizes, rotation, browser toolbars collapsing.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div className="stage-viewport">
        <div className="rotate-notice" role="status" data-testid="rotate-notice">
          <p>{en.rotateDevice}</p>
        </div>
        <div className="stage-area" ref={area}>
          <div
            className="stage"
            data-testid="stage"
            style={{
              width: size.width,
              height: size.height,
              transform: `translate(-50%, -50%) scale(${size.scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {/* Scroll room on touch screens in landscape: a swipe on the board lets the mobile browser
          collapse its toolbars, and the stage grows into the freed height. */}
      <div className="stage-scroll-room" aria-hidden="true" />
    </>
  );
}
