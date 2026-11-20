import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// There are no accounts: a Player is a device. Every public function takes the caller's
// deviceId and resolves it here, so no function ever trusts a playerId as "who is calling".

export function fail(message: string): never {
  throw new ConvexError(message);
}

export function checkDeviceId(deviceId: string) {
  if (deviceId.length < 8 || deviceId.length > 128) fail("Invalid device");
}

/** The caller's active Player in this Room, or null. Never throws. */
export async function findPlayer(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  deviceId: string,
): Promise<{ room: Doc<"rooms">; player: Doc<"players"> } | null> {
  const room = await ctx.db.get("rooms", roomId);
  if (!room) return null;
  const player = await ctx.db
    .query("players")
    .withIndex("by_roomId_and_deviceId_and_status", (q) =>
      q.eq("roomId", roomId).eq("deviceId", deviceId).eq("status", "active"),
    )
    .first();
  if (!player) return null;
  return { room, player };
}

/** Throws unless the caller has an active Player in this Room. */
export async function requirePlayer(ctx: QueryCtx, roomId: Id<"rooms">, deviceId: string) {
  checkDeviceId(deviceId);
  const found = await findPlayer(ctx, roomId, deviceId);
  if (!found) fail("You're not in this Room");
  return found;
}

/** Throws unless the caller is this Room's Host. */
export async function requireHost(ctx: QueryCtx, roomId: Id<"rooms">, deviceId: string) {
  const found = await requirePlayer(ctx, roomId, deviceId);
  if (found.room.hostPlayerId !== found.player._id) fail("Only the Host can do that");
  return found;
}

export function requireNotEnded(room: Doc<"rooms">) {
  if (room.stage === "ended") fail("This Room has ended");
}

export function requireInPlay(room: Doc<"rooms">) {
  requireNotEnded(room);
  if (room.stage !== "inPlay") fail("The Room hasn't started yet");
}
