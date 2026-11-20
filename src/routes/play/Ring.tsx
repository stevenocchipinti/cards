import { Avatar } from "../../components/Avatar.tsx";
import { RING_CENTER_Y, RING_RADIUS } from "../../lib/ringLayout.ts";
import type { PublicPlayer } from "../room/types.ts";
import { useHold } from "./compass/useHold.ts";
import type { PlaySlot } from "./targets.ts";

type Props = {
  width: number;
  slots: PlaySlot[];
  isAway: (p: PublicPlayer) => boolean;
  isTarget: (p: PublicPlayer) => boolean;
  onPick: (p: PublicPlayer) => void;
  /** Compass mode: a long-press locks a Bearing to this Player. */
  onHold?: (p: PublicPlayer) => void;
};

/** Avatar diameter at scale 1; its centre sits on the slot's point. */
const AVATAR_PX = 52;
/** How far a seat (avatar, name and Chip count) reaches below its point, at scale 1. */
export const SEAT_BELOW_CENTRE_PX = 66;

/**
 * The ring: one big faint circle of which only the top arc shows, and an avatar for each
 * other Player at the place the layout gives it. Positions are in screen px from the top.
 */
export function Ring({ width, slots, isAway, isTarget, onPick, onHold }: Props) {
  const hold = useHold(onHold);
  return (
    <>
      <div
        className="ring-arc"
        aria-hidden="true"
        style={{
          left: width / 2 - RING_RADIUS,
          top: RING_CENTER_Y - RING_RADIUS,
          width: RING_RADIUS * 2,
          height: RING_RADIUS * 2,
        }}
      />
      <ul className="ring" aria-label="Players">
        {slots.map(({ target: p, x, y, scale, edge, unplaced }) => {
          const away = isAway(p);
          const selected = isTarget(p);
          const chips = p.chips.toLocaleString("en");
          return (
            <li key={p._id}>
              <button
                type="button"
                className={`ring-seat${away ? " ring-seat--away" : ""}${selected ? " ring-seat--selected" : ""}${unplaced ? " ring-seat--unplaced" : ""}`}
                style={{
                  left: x,
                  top: y,
                  transform: `translate(-50%, ${-AVATAR_PX / 2}px) scale(${scale})`,
                  // Higher seats draw on top, so on a crowded (staggered) ring their names
                  // stay readable over the row below.
                  zIndex: 1000 - Math.round(y),
                }}
                aria-pressed={selected}
                aria-label={`${p.name}, ${chips} Chips${away ? ", Away" : ""}`}
                {...hold.bind(p)}
                onClick={() => {
                  if (!hold.wasHeld()) onPick(p);
                }}
              >
                <Avatar name={p.name} color={p.color} size={AVATAR_PX} away={away} highlighted={selected} />
                <span className="ring-seat__name">
                  {edge === "left" && "‹ "}
                  {p.name}
                  {edge === "right" && " ›"}
                </span>
                <span className="ring-seat__chips">{chips}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
