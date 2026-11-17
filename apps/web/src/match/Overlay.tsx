import { type ReactNode, useId, useRef } from "react";
import copy from "../strings/en.json";
import { useDialogFocus } from "./useDialogFocus";

/** An in-page dialog (no browser dialogs). Esc or the close button dismisses it. */
export function Overlay({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: ReactNode;
  onClose?: () => void;
  /** Room for a full ten-card hand of tiles in one line. */
  wide?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, onClose);
  return (
    <div className="overlay-backdrop">
      <div
        className={wide ? "overlay wide" : "overlay"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2 id={id}>{title}</h2>
          {onClose ? (
            <button type="button" onClick={onClose}>
              {copy.close}
            </button>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
