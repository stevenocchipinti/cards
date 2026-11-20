import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, requireNotEnded, requirePlayer } from "./lib/auth";
import { target } from "./schema";

// Bearings (GLOSSARY.md): the compass heading my phone points along to face a Target, from
// where I sit. They're mine alone: nobody else's phone is at my seat, so nobody else reads them.

/** A Room has at most a few dozen Targets; this bounds the read with plenty of room. */
const MAX_BEARINGS = 200;

type Target = { kind: "player"; playerId: Id<"players"> } | { kind: "pot"; potId: Id<"pots"> };

function targetKey(t: Target): string {
  return t.kind === "player" ? `player:${t.playerId}` : `pot:${t.potId}`;
}

/** Locks (or re-locks) my Bearing to a Target at the heading my phone points along now. */
export const lockBearing = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), target, heading: v.number() },
  returns: v.null(),
  handler: async (ctx, { deviceId, roomId, target: t, heading }) => {
    const { room, player: me } = await requirePlayer(ctx, roomId, deviceId);
    requireNotEnded(room);
    if (!Number.isFinite(heading) || heading < 0 || heading > 360) fail("Heading must be between 0 and 360");
    // 360 is north, the same as 0; store one spelling so comparisons stay simple.
    const normalised = heading % 360;

    if (t.kind === "player") {
      if (t.playerId === me._id) fail("You can't aim at yourself");
      const p = await ctx.db.get("players", t.playerId);
      if (!p || p.roomId !== roomId) fail("That Player isn't in this Room");
      if (p.status !== "active") fail("That Player has left the Room");
    } else {
      const pot = await ctx.db.get("pots", t.potId);
      if (!pot || pot.roomId !== roomId || pot.closed) fail("That Pot isn't in this Room");
    }

    const key = targetKey(t);
    const existing = await ctx.db
      .query("bearings")
      .withIndex("by_fromPlayerId_and_targetKey", (q) => q.eq("fromPlayerId", me._id).eq("targetKey", key))
      .unique();
    if (existing) {
      await ctx.db.patch("bearings", existing._id, { heading: normalised });
    } else {
      await ctx.db.insert("bearings", { roomId, fromPlayerId: me._id, target: t, targetKey: key, heading: normalised });
    }
    return null;
  },
});

/** My Bearings in this Room. Targets that have since gone are left in; the screen skips them. */
export const myBearings = query({
  args: { deviceId: v.string(), roomId: v.id("rooms") },
  returns: v.array(v.object({ target, heading: v.number() })),
  handler: async (ctx, { deviceId, roomId }) => {
    const { player: me } = await requirePlayer(ctx, roomId, deviceId);
    const rows = await ctx.db
      .query("bearings")
      .withIndex("by_fromPlayerId_and_targetKey", (q) => q.eq("fromPlayerId", me._id))
      .take(MAX_BEARINGS);
    return rows.map((b) => ({ target: b.target, heading: b.heading }));
  },
});
