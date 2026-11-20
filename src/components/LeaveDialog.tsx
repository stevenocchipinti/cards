import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getDeviceId } from "../lib/device.ts";
import { errorMessage } from "../lib/errors.ts";
import { seatedPlayers, type RoomView } from "../routes/room/types.ts";
import { Avatar } from "./Avatar.tsx";

type Props = {
  view: RoomView;
  open: boolean;
  onClose: () => void;
};

/**
 * Leave (GLOSSARY.md) is deliberate and final, so it's confirmed. The Host must also choose
 * to hand the role to someone else or End the Room for everyone. Afterwards, back to Home.
 */
export function LeaveDialog({ view, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const leaveRoom = useMutation(api.rooms.leaveRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = seatedPlayers(view).filter((p) => p._id !== view.me._id);
  const chipsNote =
    view.room.stage === "inPlay" && view.me.chips > 0
      ? ` Your ${view.me.chips.toLocaleString()} Chips go back to the Bank.`
      : "";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function leave(args: { handOverTo?: Id<"players">; endRoom?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveRoom({ deviceId: getDeviceId(), roomId: view.room._id, ...args });
      await navigate({ to: "/", replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="leave-title" onClose={onClose}>
      <h2 id="leave-title">Leave the Room?</h2>
      {view.isHost ? (
        <>
          <p className="muted">
            You're the Host. Hand the Room to someone else, or End it for everyone.{chipsNote}
          </p>
          {others.length > 0 && (
            <ul className="choice-list" aria-label="Hand over to">
              {others.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    className="choice"
                    disabled={busy}
                    onClick={() => void leave({ handOverTo: p._id })}
                  >
                    <Avatar name={p.name} color={p.color} size={40} />
                    <span>Hand over to {p.name} and Leave</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={() => void leave({ endRoom: true })}>
            End the Room for everyone
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            If you join again you'll be a new Player with no Chips.{chipsNote}
          </p>
          <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={() => void leave({})}>
            Leave
          </button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn btn--wood btn--block" autoFocus onClick={onClose} disabled={busy}>
        Stay
      </button>
    </dialog>
  );
}
