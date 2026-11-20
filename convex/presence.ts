import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { checkDeviceId, findPlayer } from "./lib/auth";

// Away (GLOSSARY.md): a Player whose device isn't connected. The presence component tracks
// sessions by heartbeat. Its "room" is our Room id and its "user" is the caller's playerId,
// resolved from deviceId here, so the deviceId never reaches the component or any client.

export const presence = new Presence<Id<"rooms">, Id<"players">>(components.presence);

/** Heartbeats need at least this long between them, so a client can't hammer the worker. */
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps the caller's session online in the Room. Returns null (and records nothing) when the
 * caller has no active Player there or the Room has Ended, so the client can stop.
 */
export const heartbeat = mutation({
  args: {
    deviceId: v.string(),
    roomId: v.id("rooms"),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.union(v.null(), v.object({ roomToken: v.string(), sessionToken: v.string() })),
  handler: async (ctx, args) => {
    checkDeviceId(args.deviceId);
    if (args.sessionId.length < 8 || args.sessionId.length > 256) return null;
    const found = await findPlayer(ctx, args.roomId, args.deviceId);
    if (!found || found.room.stage === "ended") return null;
    const interval = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, args.interval || 0));
    return await presence.heartbeat(ctx, found.room._id, found.player._id, args.sessionId, interval);
  },
});

/**
 * Who in the Room is online. The roomToken comes from heartbeat, so only Players get one.
 * No per-caller reads here, so every Player's subscription shares one cached result.
 */
export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(v.object({ userId: v.string(), online: v.boolean() })),
  handler: async (ctx, args) => {
    const entries = await presence.list(ctx, args.roomToken);
    return entries.map((e) => ({ userId: e.userId, online: e.online }));
  },
});

/** Graceful disconnect, also sent by navigator.sendBeacon when the page closes (so no deviceId). */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await presence.disconnect(ctx, args.sessionToken);
    return null;
  },
});
