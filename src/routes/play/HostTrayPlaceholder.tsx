import { useEffect, useRef } from "react";

/** Stands in for the dealer tray until #7 builds it (see PlayScreen's renderHostTray). */
export function HostTrayPlaceholder({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="host-tray-title" onClose={onClose}>
      <h2 id="host-tray-title">Dealer tray</h2>
      <p className="muted">The Bank, Awards, New Pot, Corrections and the Activity log are coming soon.</p>
      <button type="button" className="btn btn--wood btn--block" autoFocus onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
