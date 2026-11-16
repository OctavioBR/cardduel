import { type ReactNode, useId, useRef } from "react";

import { useDialogFocus } from "./useDialogFocus";

/** An in-page dialog (no browser dialogs). Esc or the close button dismisses it. */
export function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, onClose);
  return (
    <div className="overlay-backdrop">
      <div
        className="overlay"
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
              Close
            </button>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
