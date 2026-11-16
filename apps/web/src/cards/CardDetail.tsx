import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDialogFocus } from "../match/useDialogFocus";
import copy from "../strings/en.json";
import { formatCopy } from "../strings/format";
import { Card } from "./Card";
import { cardName, cardText } from "./strings";

/** Hover delay before Card Detail opens on desktop. */
export const HOVER_DELAY_MS = 450;
/** Press duration that opens Card Detail on touch. */
export const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;

interface Opened {
  cardId: string;
  strength?: number | undefined;
  via: "hover" | "press" | "key";
}

interface CardDetailApi {
  open: (o: Opened) => void;
  close: () => void;
  /** True right after a long-press, so a drag must not start. */
  pressActive: () => boolean;
  hovered: (cardId: string, strength: number | undefined) => void;
  unhovered: () => void;
}

const Ctx = createContext<CardDetailApi | null>(null);

/**
 * Card Detail (GLOSSARY.md): the enlarged card with full ability text. Wrap a screen in this
 * provider; every Card inside opens it on hover (desktop), long-press (touch) or the "I" key.
 */
export function CardDetailProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpened(null), []);
  useDialogFocus(dialogRef, !!opened && opened.via !== "hover", close);
  const api = useMemo<CardDetailApi>(
    () => ({
      open: (o) => {
        if (o.via === "press") press.current = true;
        setOpened(o);
      },
      close,
      pressActive: () => press.current,
      hovered: (cardId, strength) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(
          () => setOpened({ cardId, strength, via: "hover" }),
          HOVER_DELAY_MS,
        );
      },
      unhovered: () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setOpened((o) => (o?.via === "hover" ? null : o));
      },
    }),
    [close],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpened(null);
        return;
      }
      if ((e.key === "i" || e.key === "I") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        const card =
          active?.closest<HTMLElement>("[data-card-id]") ??
          active?.querySelector<HTMLElement>("[data-card-id]");
        const id = card?.dataset.cardId;
        if (id) setOpened({ cardId: id, via: "key" });
      }
    };
    const onUp = () => {
      // A long-press ends when the finger lifts; the click it causes is swallowed below.
      if (!press.current) return;
      const swallow = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => {
        window.removeEventListener("click", swallow, { capture: true });
        press.current = false;
      }, 400);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {opened ? (
        <div
          className="card-detail"
          ref={dialogRef}
          tabIndex={-1}
          aria-modal={opened.via !== "hover" ? true : undefined}
          data-via={opened.via}
          role="dialog"
          aria-label={formatCopy(copy.cardDetail, { p0: cardName(opened.cardId) })}
          data-testid="card-detail"
        >
          <Card cardId={opened.cardId} size="detail" strength={opened.strength} noDetail />
          <p className="card-detail-text">{cardText(opened.cardId)}</p>
          {opened.via !== "hover" ? (
            <button type="button" onClick={close}>
              {copy.close}
            </button>
          ) : null}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

/** For drag: a long-press opened Card Detail, so this press must not start a drag. */
export function useCardDetailPress(): () => boolean {
  const api = useContext(Ctx);
  return api ? api.pressActive : () => false;
}

/** Pointer handlers a Card attaches to open Card Detail. Empty outside a provider. */
export function useCardDetailTrigger(cardId: string, strength: number | undefined) {
  const api = useContext(Ctx);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!api) return {};
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") api.hovered(cardId, strength);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") api.unhovered();
      cancel();
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => api.open({ cardId, strength, via: "press" }), LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
