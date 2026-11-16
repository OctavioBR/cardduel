import { type ReactNode, useEffect, useId, useRef } from "react";

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
  useEffect(() => {
    // Keep focus inside the dialog, but do not steal it from an autofocused control.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
