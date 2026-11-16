import type { MatchEvent, Seat } from "@card-duel/engine";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type AnimationStep, planAnimations, STEP_MS } from "./animation-plan";

interface Snapshot {
  /** Board-space rect (stage pixels) and markup of each card on screen, by uid. */
  rects: Map<number, { x: number; y: number; w: number; h: number; html: string }>;
}

export interface EventBatch {
  seq: number;
  events: MatchEvent[];
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Plays an animation queue for each batch of events (#38): FLIP and the Web Animations API
 * on DOM elements, one step after another. The board already shows the new view, so when
 * the queue ends (or is skipped) the board matches the view exactly.
 */
export function useEventAnimations(
  boardRef: RefObject<HTMLElement | null>,
  batch: EventBatch | undefined,
  seat: Seat,
) {
  const [animating, setAnimating] = useState(false);
  const snapshot = useRef<Snapshot>({ rects: new Map() });
  const running = useRef<Animation[]>([]);
  const clones = useRef<HTMLElement[]>([]);
  const lastSeq = useRef<number | undefined>(undefined);

  const finishAll = useCallback(() => {
    for (const a of running.current) a.finish();
    running.current = [];
    for (const c of clones.current) c.remove();
    clones.current = [];
    setAnimating(false);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (preference.matches) finishAll();
    };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, [finishAll]);

  // After every render: play new events against the previous snapshot, then take a new one.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const scale = board.getBoundingClientRect().width / board.offsetWidth || 1;
    const origin = board.getBoundingClientRect();
    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - origin.left) / scale,
        y: (r.top - origin.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      };
    };

    if (batch && batch.seq !== lastSeq.current && batch.events.length > 0) {
      lastSeq.current = batch.seq;
      for (const a of running.current) a.finish();
      for (const c of clones.current) c.remove();
      const steps = planAnimations(batch.events, seat);
      const anims = play(board, steps, snapshot.current, rectOf, reducedMotion(), clones.current);
      running.current = anims;
      if (anims.length > 0) {
        setAnimating(true);
        Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
          if (running.current === anims) finishAll();
        });
      }
    } else if (batch) {
      lastSeq.current = batch.seq;
    }

    const rects = new Map<number, { x: number; y: number; w: number; h: number; html: string }>();
    for (const el of board.querySelectorAll<HTMLElement>("[data-anim-uid]")) {
      rects.set(Number(el.dataset.animUid), { ...rectOf(el), html: el.outerHTML });
    }
    snapshot.current = { rects };
  });

  return { animating, skip: finishAll };
}

function play(
  board: HTMLElement,
  steps: AnimationStep[],
  before: Snapshot,
  rectOf: (el: Element) => { x: number; y: number; w: number; h: number },
  reduced: boolean,
  clones: HTMLElement[],
): Animation[] {
  const anims: Animation[] = [];
  const layer = board.querySelector<HTMLElement>(".anim-layer");
  const find = (uid: number) => board.querySelector<HTMLElement>(`[data-anim-uid="${uid}"]`);
  const anchor = (selector: string) => {
    const el = board.querySelector(selector);
    return el ? rectOf(el) : null;
  };
  const timing = (i: number): KeyframeAnimationOptions => ({
    duration: STEP_MS,
    delay: i * STEP_MS,
    easing: "cubic-bezier(.2,.7,.2,1)",
    fill: "backwards",
  });
  const fadeIn: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
  const flipFrom = (
    el: HTMLElement,
    from: { x: number; y: number; w: number; h: number } | null,
  ): Keyframe[] => {
    if (reduced || !from) return fadeIn;
    const to = rectOf(el);
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    return [
      { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, opacity: 0.6 },
      { transform: "none", opacity: 1 },
    ];
  };

  steps.forEach((step, i) => {
    switch (step.kind) {
      case "enter":
      case "move":
      case "drawn": {
        for (const uid of step.uids) {
          const el = find(uid);
          if (!el) continue;
          const old = before.rects.get(uid);
          const from =
            step.kind === "move"
              ? (old ?? null)
              : step.kind === "drawn"
                ? anchor('[aria-label^="Your deck"]')
                : step.from === "yourHand"
                  ? (old ?? anchor(".hand"))
                  : step.from === "opponentHand"
                    ? anchor('[data-testid="panel-opponent"]')
                    : step.from === "deck"
                      ? anchor('[aria-label^="Your deck"]')
                      : null;
          anims.push(el.animate(flipFrom(el, from), timing(i)));
        }
        if (step.kind === "drawn" && step.seat === "opponent") {
          const panel = board.querySelector<HTMLElement>('[data-testid="panel-opponent"]');
          if (panel) anims.push(panel.animate([{ opacity: 0.6 }, { opacity: 1 }], timing(i)));
        }
        break;
      }
      case "leave": {
        if (!layer) break;
        for (const uid of step.uids) {
          const old = before.rects.get(uid);
          if (!old || find(uid)) continue;
          const clone = document.createElement("div");
          clone.className = `anim-clone ${step.style}`;
          clone.style.cssText = `left:${old.x}px;top:${old.y}px;width:${old.w}px;height:${old.h}px`;
          clone.innerHTML = old.html;
          layer.appendChild(clone);
          clones.push(clone);
          const frames: Keyframe[] = reduced
            ? [{ opacity: 1 }, { opacity: 0 }]
            : step.style === "destroyed"
              ? [
                  { opacity: 1, filter: "none" },
                  {
                    opacity: 1,
                    filter: "brightness(1.6) sepia(1) hue-rotate(-30deg)",
                    transform: "scale(1.08)",
                  },
                  { opacity: 0, transform: "scale(0.6)" },
                ]
              : [{ opacity: 1 }, { opacity: 0, transform: "translateY(12px)" }];
          anims.push(clone.animate(frames, { ...timing(i), fill: "both" }));
        }
        break;
      }
      case "strength":
        for (const change of step.changes) {
          const el = find(change.uid)?.querySelector<HTMLElement>(".cd-strength");
          if (!el) continue;
          anims.push(
            el.animate(
              reduced
                ? [{ opacity: 0.3 }, { opacity: 1 }]
                : [{ transform: "scale(1.6)" }, { transform: "scale(1)" }],
              timing(i),
            ),
          );
        }
        break;
      case "weather": {
        for (const el of board.querySelectorAll<HTMLElement>(".board-row")) {
          anims.push(el.animate([{ opacity: 0.55 }, { opacity: 1 }], timing(i)));
        }
        break;
      }
      case "round": {
        if (!layer) break;
        const banner = document.createElement("div");
        banner.className = "anim-round";
        banner.textContent = step.text;
        layer.appendChild(banner);
        clones.push(banner);
        anims.push(
          banner.animate(
            [
              { opacity: 0 },
              { opacity: 1, offset: 0.2 },
              { opacity: 1, offset: 0.8 },
              { opacity: 0 },
            ],
            {
              duration: STEP_MS * 3,
              delay: i * STEP_MS,
              fill: "both",
            },
          ),
        );
        break;
      }
    }
  });
  return anims;
}
