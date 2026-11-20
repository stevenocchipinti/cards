import { useId, type ReactNode } from "react";
import { useModal } from "./useModal.ts";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A native modal confirm for actions that can't be reversed. The safe choice has focus. */
export function ConfirmDialog({ title, children, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  const ref = useModal();
  const titleId = useId();
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onCancel}>
      <h2 id={titleId}>{title}</h2>
      <div className="muted">{children}</div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="btn btn--wood btn--block" autoFocus disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  );
}
