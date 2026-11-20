import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Terms (Room, Player, Pot, Transfer, Bearing...) are defined in GLOSSARY.md.

export const stage = v.union(
  v.literal("lobby"),
  v.literal("inPlay"),
  v.literal("ended"),
);

/** Anything that can hold Chips. The Bank is unlimited and Host-only. */
export const holder = v.union(
  v.object({ kind: v.literal("player"), playerId: v.id("players") }),
  v.object({ kind: v.literal("pot"), potId: v.id("pots") }),
  v.object({ kind: v.literal("bank") }),
);

/** Something a Player can aim at or tap: another Player or a Pot. */
export const target = v.union(
  v.object({ kind: v.literal("player"), playerId: v.id("players") }),
  v.object({ kind: v.literal("pot"), potId: v.id("pots") }),
);

export const transferKind = v.union(
  v.literal("send"), // a Player sending their own Chips
  v.literal("starting"), // Starting Chips handed out when the Room goes In Play
  v.literal("award"), // Host: Pot -> Player
  v.literal("bank"), // Host: Bank -> anyone, or anyone -> Bank
  v.literal("correction"), // Host: any holder -> any holder
  v.literal("reversal"), // Host: undoes a specific earlier Transfer
  v.literal("leave"), // a leaving Player's Chips returning to the Bank
  v.literal("removal"), // a removed Player's Chips returning to the Bank
);

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    stage,
    /** Unset only for the moment between creating the Room and its Host. */
    hostPlayerId: v.optional(v.id("players")),
    startingChips: v.number(),
    /** Clockwise, active Players only. Rooms are small, so a bounded array is fine. */
    seatingOrder: v.array(v.id("players")),
    endedAt: v.optional(v.number()),
  }).index("by_code_and_stage", ["code", "stage"]),

  players: defineTable({
    roomId: v.id("rooms"),
    /** Secret bearer token from the device's localStorage. Never return it from a query. */
    deviceId: v.string(),
    name: v.string(),
    color: v.string(),
    chips: v.number(),
    status: v.union(v.literal("active"), v.literal("left"), v.literal("removed")),
  })
    .index("by_roomId_and_status", ["roomId", "status"])
    .index("by_roomId_and_deviceId", ["roomId", "deviceId"])
    .index("by_deviceId", ["deviceId"]),

  pots: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    chips: v.number(),
    /** Chips each Player has put in since the Pot was last empty. */
    contributions: v.record(v.string(), v.number()),
    closed: v.optional(v.boolean()),
  }).index("by_roomId", ["roomId"]),

  /** The Activity feed. Append-only: a Reversal is a new row pointing at the old one. */
  transfers: defineTable({
    roomId: v.id("rooms"),
    kind: transferKind,
    from: holder,
    to: holder,
    amount: v.number(),
    byPlayerId: v.optional(v.id("players")),
    reversesId: v.optional(v.id("transfers")),
    /** When this Transfer emptied a Pot, its Contributions beforehand, so a Reversal can restore them. */
    potContributionsBefore: v.optional(v.record(v.string(), v.number())),
  }).index("by_roomId", ["roomId"]),

  /** The heading a Player's phone pointed along to face a Target, locked by that Player. */
  bearings: defineTable({
    roomId: v.id("rooms"),
    fromPlayerId: v.id("players"),
    target,
    targetKey: v.string(), // "player:<id>" or "pot:<id>", for the unique lookup index
    heading: v.number(), // degrees clockwise from magnetic north, 0-360
  })
    .index("by_roomId", ["roomId"])
    .index("by_fromPlayerId_and_targetKey", ["fromPlayerId", "targetKey"]),
});
