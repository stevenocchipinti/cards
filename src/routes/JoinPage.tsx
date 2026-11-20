import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { getDeviceId } from "../lib/device.ts";
import { errorMessage } from "../lib/errors.ts";
import { loadName, MAX_NAME_LENGTH, saveName } from "../lib/name.ts";
import { CODE_LENGTH, isCompleteCode, normalizeCode } from "../lib/roomCode.ts";
import { joinRoute } from "../router.tsx";

export function JoinPage() {
  const search = joinRoute.useSearch();
  const navigate = useNavigate();
  const joinRoom = useMutation(api.rooms.joinRoom);
  const [code, setCode] = useState(() => normalizeCode(search.code ?? ""));
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeId = useId();
  const nameId = useId();
  const ready = isCompleteCode(code) && name.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await joinRoom({ deviceId: getDeviceId(), code, name: name.trim() });
      saveName(name);
      await navigate({ to: "/r/$roomId", params: { roomId }, replace: true });
    } catch (err) {
      const message = errorMessage(err);
      setError(
        message === "No open Room has that code"
          ? "No open Room has that code. Check it with the Host: the Room may have ended."
          : message,
      );
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <header className="hero">
        <h1 className="title">Join</h1>
      </header>
      <form className="panel" onSubmit={submit}>
        <div className="field">
          <label htmlFor={codeId}>Room Code</label>
          <input
            id={codeId}
            className="input input--code"
            value={code}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setError(null);
            }}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD"
          />
        </div>
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
            autoFocus={isCompleteCode(code) && !name}
            required
          />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--block" type="submit" disabled={busy || !ready}>
          {busy ? "Joining…" : "Join Room"}
        </button>
      </form>
      <Link className="btn btn--wood btn--block" to="/">
        Back
      </Link>
    </main>
  );
}
