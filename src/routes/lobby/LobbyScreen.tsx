import { useMutation } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LeaveDialog } from "../../components/LeaveDialog.tsx";
import { getDeviceId } from "../../lib/device.ts";
import { errorMessage } from "../../lib/errors.ts";
import { seatedPlayers, type RoomView } from "../room/types.ts";
import { SeatingOrder } from "./SeatingOrder.tsx";

type Props = { view: RoomView; online: Set<string> | undefined };

/** The Lobby Stage: everyone gathers, the Host sets things up and presses Start. */
export function LobbyScreen({ view, online }: Props) {
  const [leaving, setLeaving] = useState(false);
  const deviceId = getDeviceId();
  const players = seatedPlayers(view);
  const joinUrl = `${location.origin}${import.meta.env.BASE_URL}join?code=${view.room.code}`;

  const setSeatingOrder = useMutation(api.rooms.setSeatingOrder).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.rooms.getRoom, { deviceId, roomId: view.room._id });
    if (current) {
      store.setQuery(
        api.rooms.getRoom,
        { deviceId, roomId: view.room._id },
        { ...current, room: { ...current.room, seatingOrder: args.seatingOrder } },
      );
    }
  });
  const [seatError, setSeatError] = useState<string | null>(null);

  function reorder(order: Id<"players">[]) {
    setSeatError(null);
    setSeatingOrder({ deviceId, roomId: view.room._id, seatingOrder: order }).catch((err) =>
      setSeatError(errorMessage(err)),
    );
  }

  return (
    <main className="screen">
      <section className="room-code" aria-label="Room Code">
        <span className="room-code__label">Room Code</span>
        <span className="room-code__value">{view.room.code}</span>
        <span className="muted">Scan to join, or enter the code on the Home screen</span>
      </section>
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={180} marginSize={0} title={`Join Room ${view.room.code}`} />
      </div>

      <section className="panel" aria-labelledby="players-h">
        <h2 id="players-h">
          Players <span className="muted">({players.length})</span>
        </h2>
        {view.isHost && players.length > 1 && (
          <p className="muted">Arrange the Seating Order clockwise, as you sit around the table.</p>
        )}
        <SeatingOrder view={view} players={players} online={online} onReorder={view.isHost ? reorder : undefined} />
        {seatError && <p className="error" role="alert">{seatError}</p>}
      </section>

      {view.isHost ? <HostControls view={view} /> : <p className="waiting">Waiting for the Host to start</p>}

      <button type="button" className="btn btn--wood btn--block" onClick={() => setLeaving(true)}>
        Leave Room
      </button>
      <LeaveDialog view={view} open={leaving} onClose={() => setLeaving(false)} />
    </main>
  );
}

function HostControls({ view }: { view: RoomView }) {
  const deviceId = getDeviceId();
  const roomId = view.room._id;
  const setStartingChips = useMutation(api.rooms.setStartingChips);
  const startRoom = useMutation(api.rooms.startRoom);
  const saved = view.room.startingChips;
  const [draft, setDraft] = useState(String(saved));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // Follow the server's value unless the Host is typing.
  useEffect(() => {
    if (!editing) setDraft(String(saved));
  }, [saved, editing]);

  async function save(): Promise<boolean> {
    const amount = Number(draft);
    if (draft === "" || !Number.isSafeInteger(amount)) {
      setDraft(String(saved));
      return true;
    }
    if (amount === saved) return true;
    try {
      await setStartingChips({ deviceId, roomId, amount });
      setError(null);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      setDraft(String(saved));
      return false;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    // Make sure a just-typed Starting Chips value lands before the Room starts.
    const ok = await save();
    if (!ok) {
      setBusy(false);
      return;
    }
    try {
      await startRoom({ deviceId, roomId });
      // The Room's Stage changes reactively and this screen is replaced by the Play screen.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} aria-labelledby={`${inputId}-h`}>
      <h2 id={`${inputId}-h`}>Host setup</h2>
      <div className="field">
        <label htmlFor={inputId}>Starting Chips for each Player</label>
        <input
          id={inputId}
          className="input input--number"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onBlur={() => {
            setEditing(false);
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--block" disabled={busy}>
        {busy ? "Starting…" : "Start"}
      </button>
    </form>
  );
}
