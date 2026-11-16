import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

/** Screen pixels a press must move before it becomes a drag; anything less is a tap. */
export const DRAG_THRESHOLD = 8;

export interface DragState {
  uid: number;
  /** Ghost position in stage pixels (the stage is CSS-scaled, ADR-0006). */
  x: number;
  y: number;
}

/** The drop target key under a screen point, if any. */
export function targetKeyAt(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest<HTMLElement>("[data-target-key]")?.dataset.targetKey ?? null;
}

/**
 * Drag on pointer events, for mouse, touch and pen, inside the scaled stage. HTML5 drag and
 * drop has no touch support and dnd-kit struggles with a transformed container, so hit
 * testing is done with elementFromPoint on screen coordinates (ADR-0006).
 */
export function useCardDrag(opts: {
  boardRef: RefObject<HTMLElement | null>;
  onStart: (uid: number) => void;
  onOver: (key: string | null) => void;
  onDrop: (key: string | null) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const handlers = useRef(opts);
  handlers.current = opts;
  const suppressClick = useRef(false);
  const session = useRef<{
    uid: number;
    startX: number;
    startY: number;
    active: boolean;
    over: string | null;
  } | null>(null);

  const toStage = (clientX: number, clientY: number) => {
    const board = opts.boardRef.current;
    if (!board) return { x: clientX, y: clientY };
    const rect = board.getBoundingClientRect();
    const scale = rect.width / board.offsetWidth || 1;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      if (!s.active) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return;
        s.active = true;
        handlers.current.onStart(s.uid);
      }
      e.preventDefault();
      setDrag({ uid: s.uid, ...toStage(e.clientX, e.clientY) });
      const over = targetKeyAt(e.clientX, e.clientY);
      if (over !== s.over) {
        s.over = over;
        handlers.current.onOver(over);
      }
    };
    const end = (e: PointerEvent) => {
      const s = session.current;
      session.current = null;
      if (!s?.active) return;
      suppressClick.current = true;
      setDrag(null);
      handlers.current.onDrop(
        e.type === "pointercancel" ? null : targetKeyAt(e.clientX, e.clientY),
      );
      // The click that follows a drag is swallowed once.
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  });

  return {
    drag,
    /** Pointer-down handler for a draggable hand card. */
    start: (uid: number) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      session.current = { uid, startX: e.clientX, startY: e.clientY, active: false, over: null };
    },
    /** True while the click after a drag should be ignored. */
    shouldIgnoreClick: () => suppressClick.current,
  };
}
