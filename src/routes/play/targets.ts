import type { Id } from "../../../convex/_generated/dataModel";
import { rotateSeating, tapLayout, type RingSlot } from "../../lib/ringLayout.ts";
import { seatedPlayers, type PublicPlayer, type RoomView } from "../room/types.ts";

/** A Target (GLOSSARY.md), in the shape api.chips.send takes as `to`. */
export type TargetRef = { kind: "player"; playerId: Id<"players"> } | { kind: "pot"; potId: Id<"pots"> };

export function sameTarget(a: TargetRef | null, b: TargetRef | null): boolean {
  if (!a || !b) return false;
  return a.kind === "player" ? b.kind === "player" && a.playerId === b.playerId : b.kind === "pot" && a.potId === b.potId;
}

/** The Target's display name, or null if it's gone (Left, Removed, or a Pot that no longer exists). */
export function targetName(view: RoomView, t: TargetRef | null): string | null {
  if (!t) return null;
  if (t.kind === "pot") return view.pots.find((p) => p._id === t.potId)?.name ?? null;
  const p = view.players.find((p) => p._id === t.playerId);
  return p && p.status === "active" ? p.name : null;
}

/** Every other active seated Player, in ring order: left neighbour first (see rotateSeating). */
export function ringPlayers(view: RoomView): PublicPlayer[] {
  const seated = seatedPlayers(view);
  const byId = new Map(seated.map((p) => [p._id, p]));
  return rotateSeating(
    seated.map((p) => p._id),
    view.me._id,
  ).flatMap((id) => (id === view.me._id ? [] : [byId.get(id)!]));
}

/**
 * One avatar's place on the ring. Compass layouts can also pin it to an edge with ‹ or ›,
 * or flag it `unplaced` (no Bearing yet, so it sits in its tap-mode slot, outlined dashed).
 */
export type PlaySlot = RingSlot<PublicPlayer> & { edge?: "left" | "right" | null; unplaced?: boolean };

/**
 * Where the ring's avatars go: the seam between the Play screen and a mode. Tap mode is
 * tapLayout; compass mode (#9) wraps compassLayout, closing over the heading and Bearings,
 * and reports the Target being aimed at, which the screen uses when nothing is tapped.
 */
export type RingLayout = (others: PublicPlayer[], width: number) => { slots: PlaySlot[]; aimed: TargetRef | null };

export const tapRingLayout: RingLayout = (others, width) => ({ slots: tapLayout(others, width), aimed: null });
