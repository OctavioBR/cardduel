import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useCardDetailPress } from "../cards/CardDetail";

export type DropZone = "pool" | "deck";
const THRESHOLD = 8;

/**
 * Drag a card tile between the pool and the Deck, on pointer events (mouse, touch, pen).
 * A press without movement stays a click.
 */
export function useTileDrag(onDrop: (cardId: string, from: DropZone, to: DropZone) => void) {
  const [ghost, setGhost] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const session = useRef<{
    cardId: string;
    from: DropZone;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const suppress = useRef(false);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const longPress = useCardDetailPress();

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return;
        if (longPress()) {
          session.current = null;
          return;
        }
        s.active = true;
      }
      e.preventDefault();
      setGhost({ cardId: s.cardId, x: e.clientX, y: e.clientY });
    };
    const end = (e: PointerEvent) => {
      const s = session.current;
      session.current = null;
      if (!s?.active) return;
      setGhost(null);
      suppress.current = true;
      setTimeout(() => {
        suppress.current = false;
      }, 0);
      if (e.type === "pointercancel") return;
      const zone = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-drop-zone]")?.dataset.dropZone as DropZone | undefined;
      if (zone && zone !== s.from) drop.current(s.cardId, s.from, zone);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [longPress]);

  return {
    ghost,
    start: (cardId: string, from: DropZone) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      session.current = { cardId, from, x: e.clientX, y: e.clientY, active: false };
    },
    ignoreClick: () => suppress.current,
  };
}
