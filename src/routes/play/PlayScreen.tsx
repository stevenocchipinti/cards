import { useState } from "react";
import { Avatar } from "../../components/Avatar.tsx";
import { LeaveDialog } from "../../components/LeaveDialog.tsx";
import { isAway, seatedPlayers, type RoomView } from "../room/types.ts";

type Props = { view: RoomView; online: Set<string> | undefined };

/**
 * Placeholder for the In Play screen, so a started Room shows something useful.
 * #6 replaces this with the real Play screen (ring, Pots, rail, swipe to send).
 */
export function PlayScreen({ view, online }: Props) {
  const [leaving, setLeaving] = useState(false);
  const players = seatedPlayers(view);
  return (
    <main className="screen">
      <header className="room-code">
        <span className="room-code__label">Room {view.room.code} · In Play</span>
        <span className="title" style={{ fontSize: "3rem", color: "var(--gold)" }}>
          {view.me.chips.toLocaleString()}
        </span>
        <span className="muted">your Chips</span>
      </header>
      <section className="panel" aria-labelledby="play-players">
        <h2 id="play-players">Players</h2>
        <ol className="seats">
          {players.map((p) => {
            const away = isAway(online, view, p._id);
            return (
              <li key={p._id} className="seat">
                <Avatar name={p.name} color={p.color} size={40} away={away} highlighted={p._id === view.me._id} />
                <span className="seat__name">
                  {p.name} {view.room.hostPlayerId === p._id && <span className="badge">Host</span>}{" "}
                  {away && <span className="badge badge--away">Away</span>}
                </span>
                <span className="room-link__code">{p.chips.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="panel" aria-labelledby="play-pots">
        <h2 id="play-pots">Pots</h2>
        <ul className="room-list">
          {view.pots.map((pot) => (
            <li key={pot._id} className="row">
              <span className="grow">{pot.name}</span>
              <span className="room-link__code">{pot.chips.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="waiting">Play screen coming (#6)</p>
      <button type="button" className="btn btn--wood btn--block" onClick={() => setLeaving(true)}>
        Leave Room
      </button>
      <LeaveDialog view={view} open={leaving} onClose={() => setLeaving(false)} />
    </main>
  );
}
