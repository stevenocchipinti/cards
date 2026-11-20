import { useMutation, useQuery } from "convex/react";
import { useId } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { activityText } from "../../../lib/activityText.ts";
import { getDeviceId } from "../../../lib/device.ts";
import { activityNote, activityNumbers, reverseCheck } from "../../../lib/hostTray.ts";
import type { RoomView } from "../../room/types.ts";
import { useModal } from "./useModal.ts";
import { useRun } from "./useRun.ts";

/** api.chips.activity's most; enough for one sitting in v1. */
const LOG_LIMIT = 200;

/**
 * The Host's full Activity, newest first and numbered, with Reverse on each entry
 * (docs/PRD.md › Host powers). A Reversal is a new entry, so it can be reversed in turn.
 */
export function ActivityLog({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const ref = useModal();
  const titleId = useId();
  const entries = useQuery(api.chips.activity, { deviceId: getDeviceId(), roomId: view.room._id, limit: LOG_LIMIT });
  const reverse = useMutation(api.chips.reverse);
  const { busy, error, run } = useRun();
  // Names, not "You": it reads as a record of the table.
  const names = {
    players: new Map(view.players.map((p) => [p._id as string, p.name])),
    pots: new Map(view.pots.map((p) => [p._id as string, p.name])),
  };
  const numbers = activityNumbers(entries ?? []);

  function doReverse(transferId: Id<"transfers">) {
    void run(() => reverse({ deviceId: getDeviceId(), roomId: view.room._id, transferId }));
  }

  return (
    <dialog ref={ref} className="log" aria-labelledby={titleId} onClose={onClose}>
      <header className="log__head">
        <h2 id={titleId} className="log__title">
          ACTIVITY
        </h2>
        <button type="button" className="round-btn" aria-label="Close Activity" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="log__hint">Newest first. Reversing adds a new entry, which can itself be reversed.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {entries === undefined ? (
        <p className="log__hint" role="status">
          Loading…
        </p>
      ) : entries.length === 0 ? (
        <p className="log__hint">Nothing has moved yet.</p>
      ) : (
        <ol className="log__list">
          {entries.map((e) => {
            const n = numbers.get(e._id)!;
            const check = reverseCheck(e, view);
            const note = [activityNote(e, numbers), check.reason !== "Already reversed" ? check.reason : null]
              .filter(Boolean)
              .join(" · ");
            const text = activityText(e, names);
            return (
              <li key={e._id} className="log__row">
                <span className="log__num">#{n}</span>
                <div className="log__body">
                  <span className="log__text">{text}</span>
                  {note && <span className="log__note">{note}</span>}
                </div>
                <button
                  type="button"
                  className="log__reverse"
                  disabled={busy || !check.canReverse}
                  aria-label={`Reverse #${n}: ${text}`}
                  onClick={() => doReverse(e._id)}
                >
                  Reverse
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </dialog>
  );
}
