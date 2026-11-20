import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

/** What api.rooms.getRoom returns for a member of the Room. */
export type RoomView = NonNullable<FunctionReturnType<typeof api.rooms.getRoom>>;
export type PublicPlayer = RoomView["players"][number];

/** Active Players in Seating Order (clockwise). */
export function seatedPlayers(view: RoomView): PublicPlayer[] {
  const byId = new Map(view.players.map((p) => [p._id, p]));
  return view.room.seatingOrder.flatMap((id) => {
    const p = byId.get(id);
    return p && p.status === "active" ? [p] : [];
  });
}

/**
 * Whether a Player is shown Away. While presence is still loading nobody is, so avatars don't
 * flash grey on arrival; this device's own Player is never Away to itself.
 */
export function isAway(online: Set<string> | undefined, view: RoomView, playerId: string): boolean {
  if (online === undefined || playerId === view.me._id) return false;
  return !online.has(playerId);
}
