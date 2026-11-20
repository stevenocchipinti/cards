import { useEffect, useRef } from "react";

/**
 * A ref for a native <dialog> that is open as a modal while `open` is true. The browser
 * gives it the inert page, focus containment, Esc and focus return.
 */
export function useModal(open = true) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}
