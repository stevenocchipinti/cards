import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { holder, target, transferKind } from "./schema";
import { fail, findPlayer, requireHost, requireInPlay, requireNotEnded, requirePlayer } from "./lib/auth";

// Every change to Chips goes through moveChips, so no holder can go below zero and every
// change is recorded in Activity (the transfers table). Terms are defined in GLOSSARY.md.

export type Holder = Infer<typeof holder>;
export type TransferKind = Infer<typeof transferKind>;
type ContributionChange = { potId: Id<"pots">; playerId: Id<"players">; delta: number };

export const MAX_POTS = 20;

export function checkAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) fail("Amount must be a whole number above zero");
}

function sameHolder(a: Holder, b: Holder) {
  if (a.kind === "bank" || b.kind === "bank") return a.kind === b.kind;
  if (a.kind === "player" && b.kind === "player") return a.playerId === b.playerId;
  if (a.kind === "pot" && b.kind === "pot") return a.potId === b.potId;
  return false;
}

type Loaded =
  | { kind: "player"; doc: Doc<"players"> }
  | { kind: "pot"; doc: Doc<"pots"> }
  | { kind: "bank" };

async function loadHolder(ctx: MutationCtx, roomId: Id<"rooms">, h: Holder): Promise<Loaded> {
  if (h.kind === "bank") return { kind: "bank" };
  if (h.kind === "player") {
    const doc = await ctx.db.get("players", h.playerId);
    if (!doc || doc.roomId !== roomId) fail("That Player isn't in this Room");
    if (doc.status !== "active") fail("That Player has left the Room");
    return { kind: "player", doc };
  }
  const doc = await ctx.db.get("pots", h.potId);
  if (!doc || doc.roomId !== roomId) fail("That Pot isn't in this Room");
  return { kind: "pot", doc };
}

function chipsOf(l: Loaded) {
  return l.kind === "bank" ? Infinity : l.doc.chips;
}

/**
 * Moves Chips from one holder to another and records the Transfer. The only code that
 * changes Chips. Callers check who may do it; this checks that it can be done:
 * a positive whole amount, the Room In Play, both holders in the Room (Players active),
 * and the source holding enough (the Bank is unlimited).
 *
 * Contributions: a Player's "send" into a Pot adds to their Contribution. A Transfer that
 * empties a Pot resets its Contributions and keeps the old ones in potContributionsBefore.
 * Each Transfer stores the exact Contribution changes it made, and a Reversal (reversesId)
 * applies the opposite of the original's, so a Reversal of a Reversal works too.
 */
export async function moveChips(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    kind: TransferKind;
    from: Holder;
    to: Holder;
    amount: number;
    byPlayerId?: Id<"players">;
    reversesId?: Id<"transfers">;
  },
): Promise<Id<"transfers">> {
  checkAmount(args.amount);
  const room = await ctx.db.get("rooms", args.roomId);
  if (!room) fail("Room not found");
  requireInPlay(room);
  if (sameHolder(args.from, args.to)) fail("Chips must move between two different holders");

  const from = await loadHolder(ctx, room._id, args.from);
  const to = await loadHolder(ctx, room._id, args.to);
  if (chipsOf(from) < args.amount) fail("Not enough Chips");

  // Working copies of the Contributions of every Pot this Transfer touches.
  const pots = new Map<Id<"pots">, Doc<"pots">>();
  const contributions = new Map<Id<"pots">, Record<string, number>>();
  for (const l of [from, to]) {
    if (l.kind === "pot") {
      pots.set(l.doc._id, l.doc);
      contributions.set(l.doc._id, { ...l.doc.contributions });
    }
  }
  const changes: ContributionChange[] = [];
  const change = (potId: Id<"pots">, playerId: Id<"players">, delta: number) => {
    const c = contributions.get(potId);
    if (!c) return;
    const current = c[playerId] ?? 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    if (next === 0) delete c[playerId];
    else c[playerId] = next;
    changes.push({ potId, playerId, delta: next - current });
  };

  if (args.reversesId !== undefined) {
    const original = await ctx.db.get("transfers", args.reversesId);
    if (!original || original.roomId !== room._id) fail("Transfer not found");
    for (const c of original.contributionChanges ?? []) change(c.potId, c.playerId, -c.delta);
  } else if (args.kind === "send" && from.kind === "player" && to.kind === "pot") {
    change(to.doc._id, from.doc._id, args.amount);
  }

  let potContributionsBefore: Record<string, number> | undefined;
  if (from.kind === "pot" && from.doc.chips === args.amount) {
    const before = contributions.get(from.doc._id) ?? {};
    if (Object.keys(before).length > 0) {
      potContributionsBefore = { ...before };
      for (const [playerId, amount] of Object.entries(before)) {
        change(from.doc._id, playerId as Id<"players">, -amount);
      }
    }
  }

  if (to.kind !== "bank" && !Number.isSafeInteger(to.doc.chips + args.amount)) fail("Too many Chips");
  for (const [l, sign] of [[from, -1], [to, 1]] as const) {
    if (l.kind === "player") {
      await ctx.db.patch("players", l.doc._id, { chips: l.doc.chips + sign * args.amount });
    } else if (l.kind === "pot") {
      await ctx.db.patch("pots", l.doc._id, { chips: l.doc.chips + sign * args.amount });
    }
  }
  for (const [potId, c] of contributions) {
    const pot = pots.get(potId);
    if (pot && JSON.stringify(c) !== JSON.stringify(pot.contributions)) {
      await ctx.db.patch("pots", potId, { contributions: c });
    }
  }

  return await ctx.db.insert("transfers", {
    roomId: room._id,
    kind: args.kind,
    from: args.from,
    to: args.to,
    amount: args.amount,
    byPlayerId: args.byPlayerId,
    reversesId: args.reversesId,
    potContributionsBefore,
    contributionChanges: changes.length > 0 ? changes : undefined,
  });
}

/** Any Player: send some of their own Chips to another Player or a Pot. */
export const send = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), to: target, amount: v.number() },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requirePlayer(ctx, args.roomId, args.deviceId);
    requireInPlay(room);
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "send",
      from: { kind: "player", playerId: player._id },
      to: args.to,
      amount: args.amount,
      byPlayerId: player._id,
    });
  },
});

/** Host: Award some or all of a Pot's Chips to a Player. */
export const award = mutation({
  args: {
    deviceId: v.string(),
    roomId: v.id("rooms"),
    potId: v.id("pots"),
    playerId: v.id("players"),
    amount: v.number(),
  },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requireHost(ctx, args.roomId, args.deviceId);
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "award",
      from: { kind: "pot", potId: args.potId },
      to: { kind: "player", playerId: args.playerId },
      amount: args.amount,
      byPlayerId: player._id,
    });
  },
});

/** Host: give Chips from the Bank to a Player or a Pot. */
export const bankGive = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), to: target, amount: v.number() },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requireHost(ctx, args.roomId, args.deviceId);
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "bank",
      from: { kind: "bank" },
      to: args.to,
      amount: args.amount,
      byPlayerId: player._id,
    });
  },
});

/** Host: reclaim Chips from a Player or a Pot into the Bank. */
export const bankReclaim = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), from: target, amount: v.number() },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requireHost(ctx, args.roomId, args.deviceId);
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "bank",
      from: args.from,
      to: { kind: "bank" },
      amount: args.amount,
      byPlayerId: player._id,
    });
  },
});

/** Host: a Correction, any amount from any holder to any other (including Pot to Pot). */
export const correct = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), from: holder, to: holder, amount: v.number() },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requireHost(ctx, args.roomId, args.deviceId);
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "correction",
      from: args.from,
      to: args.to,
      amount: args.amount,
      byPlayerId: player._id,
    });
  },
});

/**
 * Host: a Reversal of an earlier Transfer. A new Transfer the other way; refused when the
 * holder no longer has the Chips. Each Transfer can be reversed once, so a retry or a double
 * tap can't undo it twice; reverse the Reversal instead to redo it.
 */
export const reverse = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), transferId: v.id("transfers") },
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { room, player } = await requireHost(ctx, args.roomId, args.deviceId);
    const original = await ctx.db.get("transfers", args.transferId);
    if (!original || original.roomId !== room._id) fail("Transfer not found");
    const existing = await ctx.db
      .query("transfers")
      .withIndex("by_reversesId", (q) => q.eq("reversesId", original._id))
      .first();
    if (existing) fail("That Transfer has already been reversed");
    return await moveChips(ctx, {
      roomId: room._id,
      kind: "reversal",
      from: original.to,
      to: original.from,
      amount: original.amount,
      byPlayerId: player._id,
      reversesId: original._id,
    });
  },
});

/** Host: add a named Pot, for example a side pot. */
export const createPot = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), name: v.string() },
  returns: v.id("pots"),
  handler: async (ctx, args) => {
    const { room } = await requireHost(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 24) fail("Pot name must be 1 to 24 characters");
    const pots = await ctx.db
      .query("pots")
      .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
      .take(MAX_POTS);
    if (pots.length >= MAX_POTS) fail(`A Room can have at most ${MAX_POTS} Pots`);
    return await ctx.db.insert("pots", { roomId: room._id, name, chips: 0, contributions: {} });
  },
});

export const MAX_ACTIVITY = 200;

/** Activity, newest first. Empty for anyone not in the Room. */
export const activity = query({
  args: { deviceId: v.string(), roomId: v.id("rooms"), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("transfers"),
      _creationTime: v.number(),
      kind: transferKind,
      from: holder,
      to: holder,
      amount: v.number(),
      byPlayerId: v.union(v.id("players"), v.null()),
      reversesId: v.union(v.id("transfers"), v.null()),
      /** The Reversal of this Transfer, if it has been reversed. */
      reversedById: v.union(v.id("transfers"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const found = await findPlayer(ctx, args.roomId, args.deviceId);
    if (!found) return [];
    const limit =
      args.limit === undefined || !Number.isFinite(args.limit)
        ? 50
        : Math.min(MAX_ACTIVITY, Math.max(1, Math.floor(args.limit)));
    const rows = await ctx.db
      .query("transfers")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(limit);
    // A Reversal is always newer than what it reverses, so it's in this page too.
    const reversedBy = new Map<Id<"transfers">, Id<"transfers">>();
    for (const r of rows) if (r.reversesId) reversedBy.set(r.reversesId, r._id);
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      kind: r.kind,
      from: r.from,
      to: r.to,
      amount: r.amount,
      byPlayerId: r.byPlayerId ?? null,
      reversesId: r.reversesId ?? null,
      reversedById: reversedBy.get(r._id) ?? null,
    }));
  },
});
