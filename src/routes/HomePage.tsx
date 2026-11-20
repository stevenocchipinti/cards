import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { getDeviceId } from "../lib/device.ts";
import { errorMessage } from "../lib/errors.ts";
import { loadName, MAX_NAME_LENGTH, saveName } from "../lib/name.ts";
import { CODE_LENGTH, isCompleteCode, normalizeCode } from "../lib/roomCode.ts";

const STAGE_LABEL = { lobby: "In the Lobby", inPlay: "In Play" } as const;

export function HomePage() {
  return (
    <main className="screen">
      <header className="hero">
        <h1 className="title">Cards</h1>
        <p>Chips for games around a real table</p>
      </header>
      <NewRoomPanel />
      <JoinPanel />
      <YourRooms />
    </main>
  );
}

function NewRoomPanel() {
  const navigate = useNavigate();
  const createRoom = useMutation(api.rooms.createRoom);
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per New Room attempt, reused if it's retried, so the server never makes two Rooms.
  const requestId = useRef<string>(crypto.randomUUID());
  const nameId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await createRoom({ deviceId: getDeviceId(), name: name.trim(), requestId: requestId.current });
      saveName(name);
      requestId.current = crypto.randomUUID();
      await navigate({ to: "/r/$roomId", params: { roomId } });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} aria-labelledby={`${nameId}-h`}>
      <h2 id={`${nameId}-h`}>Host a Room</h2>
      <div className="field">
        <label htmlFor={nameId}>Your name</label>
        <input
          id={nameId}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          enterKeyHint="go"
          required
        />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn--block" type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "New Room"}
      </button>
    </form>
  );
}

function JoinPanel() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const codeId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code)) return;
    void navigate({ to: "/join", search: { code } });
  }

  return (
    <form className="panel" onSubmit={submit} aria-labelledby={`${codeId}-h`}>
      <h2 id={`${codeId}-h`}>Join a Room</h2>
      <div className="field">
        <label htmlFor={codeId}>Room Code</label>
        <input
          id={codeId}
          className="input input--code"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="ABCD"
        />
      </div>
      <button className="btn btn--felt btn--block" type="submit" disabled={!isCompleteCode(code)}>
        Join
      </button>
    </form>
  );
}

function YourRooms() {
  const rooms = useQuery(api.rooms.myRooms, { deviceId: getDeviceId() });
  if (!rooms || rooms.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="your-rooms">
      <h2 id="your-rooms">Your Rooms</h2>
      <ul className="room-list">
        {rooms.map((r) => (
          <li key={r.roomId}>
            <Link className="room-link" to="/r/$roomId" params={{ roomId: r.roomId }}>
              <span className="room-link__code">{r.code}</span>
              <span className="room-link__meta">
                {STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL] ?? r.stage} · as {r.name}
              </span>
              {r.isHost && <span className="badge">Host</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
