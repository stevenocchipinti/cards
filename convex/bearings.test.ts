/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = "device-alice-1";
const BOB = "device-bob-1";
const CAROL = "device-carol-1";

async function setup(stage: "lobby" | "inPlay" | "ended" = "inPlay") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", { code: "ABCD", stage, startingChips: 100, seatingOrder: [] });
    const mk = (deviceId: string, name: string, status: "active" | "left" = "active") =>
      ctx.db.insert("players", { roomId, deviceId, name, color: "#fff", chips: 100, status });
    const alice = await mk(ALICE, "Alice");
    const bob = await mk(BOB, "Bob");
    const carol = await mk(CAROL, "Carol", "left");
    await ctx.db.patch("rooms", roomId, { hostPlayerId: alice, seatingOrder: [alice, bob] });
    const pot = await ctx.db.insert("pots", { roomId, name: "Pot", chips: 0, contributions: {} });

    const otherRoom = await ctx.db.insert("rooms", { code: "WXYZ", stage: "inPlay", startingChips: 0, seatingOrder: [] });
    const stranger = await ctx.db.insert("players", {
      roomId: otherRoom,
      deviceId: "device-stranger",
      name: "Stranger",
      color: "#fff",
      chips: 0,
      status: "active",
    });
    const otherPot = await ctx.db.insert("pots", { roomId: otherRoom, name: "Other", chips: 0, contributions: {} });
    return { roomId, alice, bob, carol, pot, stranger, otherPot };
  });
  return { t, ...ids };
}

const player = (playerId: Id<"players">) => ({ kind: "player" as const, playerId });
const pot = (potId: Id<"pots">) => ({ kind: "pot" as const, potId });

describe("lockBearing", () => {
  test("stores a Bearing per Target and re-locking replaces it", async () => {
    const s = await setup();
    const lock = (target: ReturnType<typeof player> | ReturnType<typeof pot>, heading: number) =>
      s.t.mutation(api.bearings.lockBearing, { deviceId: ALICE, roomId: s.roomId, target, heading });
    await lock(player(s.bob), 90);
    await lock(pot(s.pot), 180.5);
    await lock(player(s.bob), 100);

    const mine = await s.t.query(api.bearings.myBearings, { deviceId: ALICE, roomId: s.roomId });
    expect(mine).toHaveLength(2);
    expect(mine).toEqual(
      expect.arrayContaining([
        { target: player(s.bob), heading: 100 },
        { target: pot(s.pot), heading: 180.5 },
      ]),
    );
    const rows = await s.t.run((ctx) => ctx.db.query("bearings").collect());
    expect(rows).toHaveLength(2);
  });

  test("360 is stored as north (0)", async () => {
    const s = await setup();
    await s.t.mutation(api.bearings.lockBearing, { deviceId: ALICE, roomId: s.roomId, target: player(s.bob), heading: 360 });
    const mine = await s.t.query(api.bearings.myBearings, { deviceId: ALICE, roomId: s.roomId });
    expect(mine).toEqual([{ target: player(s.bob), heading: 0 }]);
  });

  test("Bearings are per Player: Bob doesn't see Alice's", async () => {
    const s = await setup();
    await s.t.mutation(api.bearings.lockBearing, { deviceId: ALICE, roomId: s.roomId, target: player(s.bob), heading: 45 });
    await s.t.mutation(api.bearings.lockBearing, { deviceId: BOB, roomId: s.roomId, target: player(s.alice), heading: 225 });
    expect(await s.t.query(api.bearings.myBearings, { deviceId: BOB, roomId: s.roomId })).toEqual([
      { target: player(s.alice), heading: 225 },
    ]);
  });

  test.each([-1, 360.01, Number.NaN, Number.POSITIVE_INFINITY])("refuses heading %s", async (heading) => {
    const s = await setup();
    await expect(
      s.t.mutation(api.bearings.lockBearing, { deviceId: ALICE, roomId: s.roomId, target: player(s.bob), heading }),
    ).rejects.toThrow(/Heading/);
  });

  test("refuses myself, a Player who Left, and Targets from another Room", async () => {
    const s = await setup();
    const lock = (target: ReturnType<typeof player> | ReturnType<typeof pot>) =>
      s.t.mutation(api.bearings.lockBearing, { deviceId: ALICE, roomId: s.roomId, target, heading: 10 });
    await expect(lock(player(s.alice))).rejects.toThrow(/yourself/);
    await expect(lock(player(s.carol))).rejects.toThrow(/left/);
    await expect(lock(player(s.stranger))).rejects.toThrow(/isn't in this Room/);
    await expect(lock(pot(s.otherPot))).rejects.toThrow(/isn't in this Room/);
  });

  test("refuses someone who isn't in the Room, and an Ended Room", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.bearings.lockBearing, { deviceId: CAROL, roomId: s.roomId, target: player(s.bob), heading: 10 }),
    ).rejects.toThrow(/not in this Room/);
    await expect(s.t.query(api.bearings.myBearings, { deviceId: CAROL, roomId: s.roomId })).rejects.toThrow(
      /not in this Room/,
    );

    const ended = await setup("ended");
    await expect(
      ended.t.mutation(api.bearings.lockBearing, {
        deviceId: ALICE,
        roomId: ended.roomId,
        target: player(ended.bob),
        heading: 10,
      }),
    ).rejects.toThrow(/ended/);
  });
});
