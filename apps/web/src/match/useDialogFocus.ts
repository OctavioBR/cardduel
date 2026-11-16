import { type RefObject, useEffect, useRef } from "react";

const dialogs: HTMLElement[] = [];
const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Modal focus containment, background isolation and focus restoration, including nested dialogs. */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  active = true,
  onClose?: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(dialog);
    const isolated: [HTMLElement, boolean][] = [];
    let ancestor: HTMLElement = dialog;
    while (ancestor.parentElement && ancestor.parentElement !== document.body) {
      for (const sibling of ancestor.parentElement.children) {
        if (
          sibling !== ancestor &&
          sibling instanceof HTMLElement &&
          !sibling.matches(".seat-toggle")
        ) {
          // The development-only Seat switch controls the other player, outside the product UI.
          isolated.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      ancestor = ancestor.parentElement;
    }
    const controls = () =>
      [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0 && !el.closest("[inert]"),
      );
    if (!dialog.contains(document.activeElement)) (controls()[0] ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === "Escape" && close.current) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (
        !items.length ||
        (event.shiftKey ? index <= 0 : index === items.length - 1 || index === -1)
      ) {
        event.preventDefault();
        (items[event.shiftKey ? items.length - 1 : 0] ?? dialog).focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node))
        (controls()[0] ?? dialog).focus();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("focusin", onFocus);
    return () => {
      dialogs.splice(dialogs.indexOf(dialog), 1);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("focusin", onFocus);
      for (const [sibling, inert] of isolated) sibling.inert = inert;
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, active]);
}
