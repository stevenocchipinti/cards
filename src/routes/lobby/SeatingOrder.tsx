import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar } from "../../components/Avatar.tsx";
import { ChevronDown, ChevronUp, GripIcon } from "../../components/icons.tsx";
import { dropIndex, moveItem } from "../../lib/seating.ts";
import { isAway, type PublicPlayer, type RoomView } from "../room/types.ts";

type Props = {
  view: RoomView;
  players: PublicPlayer[];
  online: Set<string> | undefined;
  /** Host only: when set, the list can be reordered and this is called with the new order. */
  onReorder?: (order: Id<"players">[]) => void;
};

type Drag = {
  id: Id<"players">;
  pointerId: number;
  from: number;
  startY: number;
  dy: number;
  to: number;
  midpoints: number[];
};

/**
 * The Seating Order (clockwise around the real table). The Host drags a row by its handle,
 * or uses the up/down buttons, which also work with a keyboard and screen reader.
 */
export function SeatingOrder({ view, players, online, onReorder }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // After a button move React re-inserts the row, which can drop focus; put it back.
  const refocus = useRef<string | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canReorder = onReorder !== undefined && players.length > 1;

  useLayoutEffect(() => {
    if (!refocus.current) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-focus-key="${refocus.current}"]`);
    refocus.current = null;
    if (el && !(el as HTMLButtonElement).disabled) el.focus({ preventScroll: true });
    else el?.closest(".seat")?.querySelector<HTMLElement>(".seat__move:not(:disabled)")?.focus();
  });

  function announce(text: string) {
    // Clear first and delay a little, so a refocus announcement doesn't swallow it.
    setAnnouncement("");
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(text), 300);
  }

  function commit(from: number, to: number) {
    if (!onReorder || from === to) return;
    const moved = players[from]!;
    onReorder(moveItem(players, from, to).map((p) => p._id));
    announce(`${moved.name} moved to seat ${to + 1} of ${players.length}`);
  }

  function moveBy(index: number, delta: -1 | 1) {
    const id = players[index]!._id;
    refocus.current = `${id}:${delta === -1 ? "up" : "down"}`;
    commit(index, index + delta);
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, index: number) {
    if (!canReorder || drag || !e.isPrimary || e.button !== 0) return;
    const rows = listRef.current ? [...listRef.current.children] : [];
    const midpoints = rows.map((row) => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.classList.add("is-dragging");
    setDrag({
      id: players[index]!._id,
      pointerId: e.pointerId,
      from: index,
      startY: e.clientY,
      dy: 0,
      to: index,
      midpoints,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const first = drag.midpoints[0] ?? 0;
    const last = drag.midpoints[drag.midpoints.length - 1] ?? 0;
    const y = Math.min(Math.max(e.clientY, first - 1), last + 1);
    setDrag({ ...drag, dy: e.clientY - drag.startY, to: dropIndex(y, drag.midpoints, drag.from) });
  }

  function endDrag(e: PointerEvent<HTMLButtonElement>, drop: boolean) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    document.documentElement.classList.remove("is-dragging");
    setDrag(null);
    if (drop) commit(drag.from, drag.to);
  }

  function onHandleKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "Escape" && drag) {
      document.documentElement.classList.remove("is-dragging");
      setDrag(null);
      announce("Move cancelled");
      return;
    }
    if (!canReorder) return;
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      refocus.current = `${players[index]!._id}:handle`;
      commit(index, index - 1);
    } else if (e.key === "ArrowDown" && index < players.length - 1) {
      e.preventDefault();
      refocus.current = `${players[index]!._id}:handle`;
      commit(index, index + 1);
    }
  }

  return (
    <>
      <ol className="seats" ref={listRef} aria-label="Seating Order, clockwise">
        {players.map((p, i) => {
          const away = isAway(online, view, p._id);
          const isHostPlayer = view.room.hostPlayerId === p._id;
          const classes = ["seat"];
          const dragging = drag?.id === p._id;
          if (dragging) classes.push("seat--dragging");
          if (drag && drag.to !== drag.from && i === drag.to) {
            classes.push(drag.to < drag.from ? "seat--drop-before" : "seat--drop-after");
          }
          return (
            <li
              key={p._id}
              className={classes.join(" ")}
              style={dragging ? { translate: `0 ${drag.dy}px` } : undefined}
            >
              {canReorder && (
                <button
                  type="button"
                  className="seat__handle"
                  data-focus-key={`${p._id}:handle`}
                  aria-label={`Reorder ${p.name}, seat ${i + 1} of ${players.length}. Drag, or use the arrow keys.`}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => endDrag(e, true)}
                  onPointerCancel={(e) => endDrag(e, false)}
                  onLostPointerCapture={(e) => endDrag(e, false)}
                  onKeyDown={(e) => onHandleKey(e, i)}
                >
                  <GripIcon />
                </button>
              )}
              {!canReorder && <span className="seat__num" aria-hidden="true">{i + 1}</span>}
              <Avatar name={p.name} color={p.color} size={40} away={away} highlighted={p._id === view.me._id} />
              <span className="seat__name">
                {p.name}
                {p._id === view.me._id && <span className="seat__you"> (you)</span>}{" "}
                {isHostPlayer && <span className="badge">Host</span>}{" "}
                {away && <span className="badge badge--away">Away</span>}
              </span>
              {canReorder && (
                <>
                  <button
                    type="button"
                    className="btn btn--felt btn--icon seat__move"
                    data-focus-key={`${p._id}:up`}
                    aria-label={`Move ${p.name} up`}
                    disabled={i === 0}
                    onClick={() => moveBy(i, -1)}
                  >
                    <ChevronUp />
                  </button>
                  <button
                    type="button"
                    className="btn btn--felt btn--icon seat__move"
                    data-focus-key={`${p._id}:down`}
                    aria-label={`Move ${p.name} down`}
                    disabled={i === players.length - 1}
                    onClick={() => moveBy(i, 1)}
                  >
                    <ChevronDown />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
