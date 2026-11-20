import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { MAX_POTS, moveChips } from "./chips";
import { stage } from "./schema";
import {
  checkDeviceId,
  fail,
  findPlayer,
  requireHost,
  requireNotEnded,
  requirePlayer,
} from "./lib/auth";

// The Room lifecycle: create, join, Lobby setup, start, Leave, Remove, hand over, end.
// Terms are defined in GLOSSARY.md; the rules are in docs/PRD.md › Rooms.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;
export const DEFAULT_STARTING_CHIPS = 1000;
export const MAX_STARTING_CHIPS = 1_000_000_000;
/** Active Players per Room. Rooms are a table of people, so this keeps every list bounded. */
export const MAX_PLAYERS = 24;
/** Every Player row a Room can have, counting those who Left or were Removed. */
const MAX_PLAYER_ROWS = 300;

/** Light colours that read well with dark initials on green felt. */
export const PLAYER_COLORS = [
  "#FFD166", // gold
  "#F4A3A8", // pink
  "#9AD1F5", // sky
  "#C9B6F2", // lavender
  "#FFB38A", // peach
  "#F7F3A1", // lemon
  "#A0E7E5", // aqua
  "#FFC6E5", // rose
  "#E8D5B5", // sand
  "#D6E4FF", // periwinkle
];

const publicPlayer = v.object({
  _id: v.id("players"),
  name: v.string(),
  color: v.string(),
  chips: v.number(),
  status: v.union(v.literal("active"), v.literal("left"), v.literal("removed")),
});

function toPublicPlayer(p: Doc<"players">) {
  return { _id: p._id, name: p.name, color: p.color, chips: p.chips, status: p.status };
}

function cleanName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 24) fail("Name must be 1 to 24 characters");
  return trimmed;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** The Room using this code, if it hasn't Ended. Codes are reserved until then. */
async function liveRoomByCode(ctx: QueryCtx, code: string) {
  for (const s of ["lobby", "inPlay"] as const) {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code_and_stage", (q) => q.eq("code", code).eq("stage", s))
      .first();
    if (room) return room;
  }
  return null;
}

async function activePlayers(ctx: QueryCtx, roomId: Id<"rooms">) {
  return await ctx.db
    .query("players")
    .withIndex("by_roomId_and_status", (q) => q.eq("roomId", roomId).eq("status", "active"))
    .take(MAX_PLAYERS + 1);
}

async function addPlayer(ctx: MutationCtx, room: Doc<"rooms">, deviceId: string, name: string) {
  const active = await activePlayers(ctx, room._id);
  if (active.length >= MAX_PLAYERS) fail(`A Room can have at most ${MAX_PLAYERS} Players`);
  const used = new Set(active.map((p) => p.color));
  const free = PLAYER_COLORS.filter((c) => !used.has(c));
  const choices = free.length > 0 ? free : PLAYER_COLORS;
  const color = choices[Math.floor(Math.random() * choices.length)]!;
  const playerId = await ctx.db.insert("players", {
    roomId: room._id,
    deviceId,
    name,
    color,
    chips: 0,
    status: "active",
  });
  await ctx.db.patch("rooms", room._id, { seatingOrder: [...room.seatingOrder, playerId] });
  return playerId;
}

/** Another active Player in this Room, or a refusal. */
async function requireOtherActivePlayer(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  me: Doc<"players">,
  playerId: Id<"players">,
) {
  const other = await ctx.db.get("players", playerId);
  if (!other || other.roomId !== room._id || other.status !== "active") {
    fail("That Player isn't in this Room");
  }
  if (other._id === me._id) fail("Choose another Player");
  return other;
}

/** Takes a Player out of the Room: their Chips go to the Bank and they lose their seat. */
async function takeOut(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  player: Doc<"players">,
  by: Doc<"players">,
  how: "leave" | "removal",
) {
  // Chips only exist In Play, so a Lobby Player always has zero here.
  if (player.chips > 0) {
    await moveChips(ctx, {
      roomId: room._id,
      kind: how,
      from: { kind: "player", playerId: player._id },
      to: { kind: "bank" },
      amount: player.chips,
      byPlayerId: by._id,
    });
  }
  await ctx.db.patch("players", player._id, { status: how === "leave" ? "left" : "removed" });
  await ctx.db.patch("rooms", room._id, {
    seatingOrder: room.seatingOrder.filter((id) => id !== player._id),
  });
}

/** Creates a Room in the Lobby with the caller as Host, and its first Pot. */
export const createRoom = mutation({
  args: { deviceId: v.string(), name: v.string() },
  returns: v.object({ roomId: v.id("rooms"), playerId: v.id("players"), code: v.string() }),
  handler: async (ctx, args) => {
    checkDeviceId(args.deviceId);
    const name = cleanName(args.name);
    let code: string | null = null;
    for (let attempt = 0; attempt < 50 && code === null; attempt++) {
      const candidate = randomCode();
      if (!(await liveRoomByCode(ctx, candidate))) code = candidate;
    }
    if (code === null) fail("Couldn't find a free Room Code, please try again");
    const roomId = await ctx.db.insert("rooms", {
      code,
      stage: "lobby",
      startingChips: DEFAULT_STARTING_CHIPS,
      seatingOrder: [],
    });
    const room = (await ctx.db.get("rooms", roomId))!;
    const playerId = await addPlayer(ctx, room, args.deviceId, name);
    await ctx.db.patch("rooms", roomId, { hostPlayerId: playerId });
    await ctx.db.insert("pots", { roomId, name: "Pot", chips: 0, contributions: {} });
    return { roomId, playerId, code };
  },
});

/**
 * Joins a Room by its code in any Stage until it Ends. The same device gets its existing
 * Player back. A new Player starts with zero Chips and takes the last seat.
 */
export const joinRoom = mutation({
  args: { deviceId: v.string(), code: v.string(), name: v.string() },
  returns: v.object({ roomId: v.id("rooms"), playerId: v.id("players") }),
  handler: async (ctx, args) => {
    checkDeviceId(args.deviceId);
    const code = args.code.trim().toUpperCase();
    const room = code.length === CODE_LENGTH ? await liveRoomByCode(ctx, code) : null;
    if (!room) fail("No open Room has that code");
    const existing = await findPlayer(ctx, room._id, args.deviceId);
    if (existing) return { roomId: room._id, playerId: existing.player._id };
    const playerId = await addPlayer(ctx, room, args.deviceId, cleanName(args.name));
    return { roomId: room._id, playerId };
  },
});

/** Everything the Room screens need. Null when the caller has no active Player in the Room. */
export const getRoom = query({
  args: { deviceId: v.string(), roomId: v.id("rooms") },
  returns: v.union(
    v.null(),
    v.object({
      room: v.object({
        _id: v.id("rooms"),
        code: v.string(),
        stage,
        startingChips: v.number(),
        seatingOrder: v.array(v.id("players")),
        hostPlayerId: v.union(v.id("players"), v.null()),
        endedAt: v.union(v.number(), v.null()),
      }),
      me: publicPlayer,
      isHost: v.boolean(),
      /** Every Player the Room has had, including those who Left or were Removed (for Activity). */
      players: v.array(publicPlayer),
      pots: v.array(
        v.object({
          _id: v.id("pots"),
          name: v.string(),
          chips: v.number(),
          contributions: v.record(v.string(), v.number()),
        }),
      ),
      /** Host only: how many Chips are out of the Bank (held by Players and Pots). */
      bank: v.union(v.null(), v.object({ chipsOut: v.number() })),
    }),
  ),
  handler: async (ctx, args) => {
    const found = await findPlayer(ctx, args.roomId, args.deviceId);
    if (!found) return null;
    const { room, player } = found;
    const isHost = room.hostPlayerId === player._id;
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_status", (q) => q.eq("roomId", room._id))
      .take(MAX_PLAYER_ROWS);
    const pots = await ctx.db
      .query("pots")
      .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
      .take(MAX_POTS);
    const chipsOut =
      players.reduce((sum, p) => sum + p.chips, 0) + pots.reduce((sum, p) => sum + p.chips, 0);
    return {
      room: {
        _id: room._id,
        code: room.code,
        stage: room.stage,
        startingChips: room.startingChips,
        seatingOrder: room.seatingOrder,
        hostPlayerId: room.hostPlayerId ?? null,
        endedAt: room.endedAt ?? null,
      },
      me: toPublicPlayer(player),
      isHost,
      players: players.map(toPublicPlayer),
      pots: pots.map((p) => ({ _id: p._id, name: p.name, chips: p.chips, contributions: p.contributions })),
      bank: isHost ? { chipsOut } : null,
    };
  },
});

/** This device's Rooms that haven't Ended, newest first, for resuming. */
export const myRooms = query({
  args: { deviceId: v.string() },
  returns: v.array(
    v.object({
      roomId: v.id("rooms"),
      playerId: v.id("players"),
      code: v.string(),
      stage,
      name: v.string(),
      isHost: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("players")
      .withIndex("by_deviceId_and_status", (q) => q.eq("deviceId", args.deviceId).eq("status", "active"))
      .order("desc")
      .take(20);
    const rooms = [];
    for (const p of mine) {
      const room = await ctx.db.get("rooms", p.roomId);
      if (!room || room.stage === "ended") continue;
      rooms.push({
        roomId: room._id,
        playerId: p._id,
        code: room.code,
        stage: room.stage,
        name: p.name,
        isHost: room.hostPlayerId === p._id,
      });
    }
    return rooms;
  },
});

/** Host, Lobby only: how many Chips each Player gets when the Room starts. */
export const setStartingChips = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room } = await requireHost(ctx, args.roomId, args.deviceId);
    if (room.stage !== "lobby") fail("Starting Chips can only be set in the Lobby");
    if (!Number.isSafeInteger(args.amount) || args.amount < 0 || args.amount > MAX_STARTING_CHIPS) {
      fail("Starting Chips must be a whole number from 0 to 1,000,000,000");
    }
    await ctx.db.patch("rooms", room._id, { startingChips: args.amount });
    return null;
  },
});

/** Host: the clockwise Seating Order. Must list every active Player exactly once. */
export const setSeatingOrder = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), seatingOrder: v.array(v.id("players")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room } = await requireHost(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    const active = new Set((await activePlayers(ctx, room._id)).map((p) => p._id));
    const given = new Set(args.seatingOrder);
    if (
      given.size !== args.seatingOrder.length ||
      given.size !== active.size ||
      args.seatingOrder.some((id) => !active.has(id))
    ) {
      fail("The Seating Order must list every Player in the Room once");
    }
    await ctx.db.patch("rooms", room._id, { seatingOrder: args.seatingOrder });
    return null;
  },
});

/** Host: moves the Room In Play and gives every Player present the Starting Chips from the Bank. */
export const startRoom = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, player: host } = await requireHost(ctx, args.roomId, args.deviceId);
    if (room.stage !== "lobby") fail("The Room has already started");
    await ctx.db.patch("rooms", room._id, { stage: "inPlay" });
    if (room.startingChips > 0) {
      for (const playerId of room.seatingOrder) {
        await moveChips(ctx, {
          roomId: room._id,
          kind: "starting",
          from: { kind: "bank" },
          to: { kind: "player", playerId },
          amount: room.startingChips,
          byPlayerId: host._id,
        });
      }
    }
    return null;
  },
});

/**
 * Leave the Room for good: your Chips go to the Bank. The Host must either hand the role
 * to another Player (handOverTo) or end the Room for everyone (endRoom: true).
 */
export const leaveRoom = mutation({
  args: {
    deviceId: v.string(),
    roomId: v.id("rooms"),
    handOverTo: v.optional(v.id("players")),
    endRoom: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, player } = await requirePlayer(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    const isHost = room.hostPlayerId === player._id;
    const ending = args.endRoom === true;
    if (!isHost && (args.handOverTo !== undefined || ending)) fail("Only the Host can do that");
    if (isHost && (args.handOverTo !== undefined) === ending) {
      fail("The Host must either hand over to another Player or end the Room");
    }
    const newHost =
      args.handOverTo !== undefined
        ? await requireOtherActivePlayer(ctx, room, player, args.handOverTo)
        : null;

    await takeOut(ctx, room, player, player, "leave");
    if (newHost) await ctx.db.patch("rooms", room._id, { hostPlayerId: newHost._id });
    if (ending) await ctx.db.patch("rooms", room._id, { stage: "ended", endedAt: Date.now() });
    return null;
  },
});

/** Host: Remove a Player. Their Chips go to the Bank and they lose their seat. */
export const removePlayer = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, player: host } = await requireHost(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    const target = await requireOtherActivePlayer(ctx, room, host, args.playerId);
    await takeOut(ctx, room, target, host, "removal");
    return null;
  },
});

/** Host: make another Player the Host. */
export const handOverHost = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms"), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, player: host } = await requireHost(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    const next = await requireOtherActivePlayer(ctx, room, host, args.playerId);
    await ctx.db.patch("rooms", room._id, { hostPlayerId: next._id });
    return null;
  },
});

/** Host: End the Room for everyone. Its code is then free for a new Room. */
export const endRoom = mutation({
  args: { deviceId: v.string(), roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room } = await requireHost(ctx, args.roomId, args.deviceId);
    requireNotEnded(room);
    await ctx.db.patch("rooms", room._id, { stage: "ended", endedAt: Date.now() });
    return null;
  },
});
