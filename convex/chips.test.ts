/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOST = "device-host-1";
const ALICE = "device-alice-1";
const BOB = "device-bob-1";

/** A Room In Play with a Host and two Players holding `chips` each, and one empty Pot. */
async function setup(chips = 100, stage: "lobby" | "inPlay" | "ended" = "inPlay") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", {
      code: "ABCD",
      stage,
      startingChips: chips,
      seatingOrder: [],
    });
    const mk = (deviceId: string, name: string) =>
      ctx.db.insert("players", { roomId, deviceId, name, color: "#fff", chips, status: "active" });
    const host = await mk(HOST, "Host");
    const alice = await mk(ALICE, "Alice");
    const bob = await mk(BOB, "Bob");
    await ctx.db.patch("rooms", roomId, { hostPlayerId: host, seatingOrder: [host, alice, bob] });
    const pot = await ctx.db.insert("pots", { roomId, name: "Pot", chips: 0, contributions: {} });
    return { roomId, host, alice, bob, pot };
  });
  const chipsOf = (id: Id<"players"> | Id<"pots">) =>
    t.run(async (ctx) => (await ctx.db.get(id))!.chips);
  const potOf = (id: Id<"pots">) => t.run(async (ctx) => (await ctx.db.get(id))!);
  return { t, ...ids, chipsOf, potOf };
}

const player = (playerId: Id<"players">) => ({ kind: "player" as const, playerId });
const pot = (potId: Id<"pots">) => ({ kind: "pot" as const, potId });
const bank = { kind: "bank" as const };

describe("send", () => {
  test("moves Chips between Players and records Activity", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: player(s.bob),
      amount: 30,
    });
    expect(await s.chipsOf(s.alice)).toBe(70);
    expect(await s.chipsOf(s.bob)).toBe(130);
    const feed = await s.t.query(api.chips.activity, { deviceId: BOB, roomId: s.roomId });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "send",
      amount: 30,
      byPlayerId: s.alice,
      from: player(s.alice),
      to: player(s.bob),
      reversedById: null,
    });
  });

  test("into a Pot adds to the sender's Contribution", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 10 });
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 5 });
    await s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: pot(s.pot), amount: 20 });
    const p = await s.potOf(s.pot);
    expect(p.chips).toBe(35);
    expect(p.contributions).toEqual({ [s.alice]: 15, [s.bob]: 20 });
  });

  test("refuses overdrawing, and zero, negative, fractional or non-finite amounts", async () => {
    const s = await setup();
    for (const amount of [101, 0, -5, 1.5, NaN, Infinity]) {
      await expect(
        s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.bob), amount }),
      ).rejects.toThrow();
    }
    expect(await s.chipsOf(s.alice)).toBe(100);
    expect(await s.chipsOf(s.bob)).toBe(100);
  });

  test("can send everything, leaving zero", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.bob), amount: 100 });
    expect(await s.chipsOf(s.alice)).toBe(0);
  });

  test("refuses sending to yourself", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.alice), amount: 1 }),
    ).rejects.toThrow(/different/);
  });

  test("refuses unknown devices, left Players and Targets outside the Room", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.chips.send, { deviceId: "device-stranger", roomId: s.roomId, to: player(s.bob), amount: 1 }),
    ).rejects.toThrow(/not in this Room/);

    const outsider = await s.t.run(async (ctx) => {
      const roomId = await ctx.db.insert("rooms", { code: "WXYZ", stage: "inPlay", startingChips: 0, seatingOrder: [] });
      return ctx.db.insert("players", { roomId, deviceId: "device-x", name: "X", color: "#fff", chips: 0, status: "active" });
    });
    await expect(
      s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(outsider), amount: 1 }),
    ).rejects.toThrow(/isn't in this Room/);

    await s.t.run((ctx) => ctx.db.patch("players", s.bob, { status: "left" }));
    await expect(
      s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.bob), amount: 1 }),
    ).rejects.toThrow(/left/);
    await expect(
      s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: player(s.alice), amount: 1 }),
    ).rejects.toThrow(/not in this Room/);
  });

  test("refused in the Lobby and once the Room has Ended", async () => {
    for (const stage of ["lobby", "ended"] as const) {
      const s = await setup(100, stage);
      await expect(
        s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.bob), amount: 1 }),
      ).rejects.toThrow();
    }
  });
});

describe("Host tools", () => {
  test("non-Hosts are refused every Host tool", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 10 });
    const [first] = await s.t.query(api.chips.activity, { deviceId: ALICE, roomId: s.roomId });
    const base = { deviceId: ALICE, roomId: s.roomId };
    const attempts = [
      s.t.mutation(api.chips.award, { ...base, potId: s.pot, playerId: s.alice, amount: 10 }),
      s.t.mutation(api.chips.bankGive, { ...base, to: player(s.alice), amount: 10 }),
      s.t.mutation(api.chips.bankReclaim, { ...base, from: player(s.bob), amount: 10 }),
      s.t.mutation(api.chips.correct, { ...base, from: player(s.bob), to: player(s.alice), amount: 10 }),
      s.t.mutation(api.chips.reverse, { ...base, transferId: first!._id }),
      s.t.mutation(api.chips.createPot, { ...base, name: "Side" }),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow(/Only the Host/);
    expect(await s.chipsOf(s.alice)).toBe(90);
  });

  test("award moves Pot Chips to a Player; emptying the Pot resets Contributions", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 10 });
    await s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: pot(s.pot), amount: 10 });
    const host = { deviceId: HOST, roomId: s.roomId };

    await s.t.mutation(api.chips.award, { ...host, potId: s.pot, playerId: s.bob, amount: 5 });
    expect((await s.potOf(s.pot)).contributions).toEqual({ [s.alice]: 10, [s.bob]: 10 });

    await expect(
      s.t.mutation(api.chips.award, { ...host, potId: s.pot, playerId: s.bob, amount: 16 }),
    ).rejects.toThrow(/Not enough/);

    await s.t.mutation(api.chips.award, { ...host, potId: s.pot, playerId: s.bob, amount: 15 });
    const p = await s.potOf(s.pot);
    expect(p.chips).toBe(0);
    expect(p.contributions).toEqual({});
    expect(await s.chipsOf(s.bob)).toBe(110);
    const transfer = await s.t.run(async (ctx) =>
      (await ctx.db.query("transfers").order("desc").first())!,
    );
    expect(transfer.potContributionsBefore).toEqual({ [s.alice]: 10, [s.bob]: 10 });
  });

  test("bankGive and bankReclaim: the Bank is unlimited, Players can't go below zero", async () => {
    const s = await setup();
    const host = { deviceId: HOST, roomId: s.roomId };
    await s.t.mutation(api.chips.bankGive, { ...host, to: player(s.alice), amount: 1_000_000 });
    expect(await s.chipsOf(s.alice)).toBe(1_000_100);
    await s.t.mutation(api.chips.bankGive, { ...host, to: pot(s.pot), amount: 50 });
    expect(await s.potOf(s.pot)).toMatchObject({ chips: 50, contributions: {} });
    await s.t.mutation(api.chips.bankReclaim, { ...host, from: player(s.bob), amount: 100 });
    expect(await s.chipsOf(s.bob)).toBe(0);
    await expect(
      s.t.mutation(api.chips.bankReclaim, { ...host, from: player(s.bob), amount: 1 }),
    ).rejects.toThrow(/Not enough/);
    await expect(
      s.t.mutation(api.chips.bankGive, { ...host, to: player(s.bob), amount: -1 }),
    ).rejects.toThrow();
  });

  test("correct moves any amount between any holders, including Pot to Pot", async () => {
    const s = await setup();
    const host = { deviceId: HOST, roomId: s.roomId };
    const side = await s.t.mutation(api.chips.createPot, { ...host, name: "  Side pot " });
    expect((await s.potOf(side)).name).toBe("Side pot");
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 40 });
    await s.t.mutation(api.chips.correct, { ...host, from: pot(s.pot), to: pot(side), amount: 25 });
    expect((await s.potOf(s.pot)).chips).toBe(15);
    expect((await s.potOf(side)).chips).toBe(25);
    await s.t.mutation(api.chips.correct, { ...host, from: player(s.bob), to: bank, amount: 100 });
    expect(await s.chipsOf(s.bob)).toBe(0);
    await expect(
      s.t.mutation(api.chips.correct, { ...host, from: bank, to: bank, amount: 1 }),
    ).rejects.toThrow(/different/);
  });

  test("createPot validates the name and is refused once Ended", async () => {
    const s = await setup();
    const host = { deviceId: HOST, roomId: s.roomId };
    await expect(s.t.mutation(api.chips.createPot, { ...host, name: "   " })).rejects.toThrow();
    await s.t.run((ctx) => ctx.db.patch("rooms", s.roomId, { stage: "ended" }));
    await expect(s.t.mutation(api.chips.createPot, { ...host, name: "Side" })).rejects.toThrow(/ended/);
  });
});

describe("reverse", () => {
  async function lastTransferId(s: Awaited<ReturnType<typeof setup>>) {
    const [latest] = await s.t.query(api.chips.activity, { deviceId: HOST, roomId: s.roomId, limit: 1 });
    return latest!._id;
  }

  test("undoes a send with a new Transfer, and the Reversal can itself be reversed", async () => {
    const s = await setup();
    const host = { deviceId: HOST, roomId: s.roomId };
    const sent = await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: player(s.bob),
      amount: 30,
    });
    const reversal = await s.t.mutation(api.chips.reverse, { ...host, transferId: sent });
    expect(await s.chipsOf(s.alice)).toBe(100);
    expect(await s.chipsOf(s.bob)).toBe(100);

    const again = await s.t.mutation(api.chips.reverse, { ...host, transferId: reversal });
    expect(await s.chipsOf(s.alice)).toBe(70);
    expect(await s.chipsOf(s.bob)).toBe(130);

    const feed = await s.t.query(api.chips.activity, { deviceId: ALICE, roomId: s.roomId });
    expect(feed.map((r) => r._id)).toEqual([again, reversal, sent]);
    expect(feed[0]).toMatchObject({ kind: "reversal", reversesId: reversal, reversedById: null });
    expect(feed[1]).toMatchObject({ kind: "reversal", reversesId: sent, reversedById: again });
    expect(feed[2]).toMatchObject({ reversedById: reversal });
  });

  test("a Transfer can only be reversed once", async () => {
    const s = await setup();
    const sent = await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: player(s.bob),
      amount: 30,
    });
    await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: sent });
    await expect(
      s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: sent }),
    ).rejects.toThrow(/already been reversed/);
    expect(await s.chipsOf(s.alice)).toBe(100);
  });

  test("refused when the holder no longer has the Chips", async () => {
    const s = await setup();
    const sent = await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: player(s.bob),
      amount: 30,
    });
    await s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: player(s.alice), amount: 110 });
    await expect(
      s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: sent }),
    ).rejects.toThrow(/Not enough/);
    expect(await s.chipsOf(s.bob)).toBe(20);
  });

  test("refuses a Transfer from another Room", async () => {
    const s = await setup();
    const foreign = await s.t.run(async (ctx) => {
      const roomId = await ctx.db.insert("rooms", { code: "WXYZ", stage: "inPlay", startingChips: 0, seatingOrder: [] });
      return ctx.db.insert("transfers", { roomId, kind: "bank", from: bank, to: bank, amount: 1 });
    });
    await expect(
      s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: foreign }),
    ).rejects.toThrow(/not found/);
  });

  test("reversing a send into a Pot takes back that Contribution", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: pot(s.pot), amount: 20 });
    const sent = await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: pot(s.pot),
      amount: 10,
    });
    const reversal = await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: sent });
    expect(await s.potOf(s.pot)).toMatchObject({ chips: 20, contributions: { [s.bob]: 20 } });
    expect(await s.chipsOf(s.alice)).toBe(100);

    // Reversing the Reversal puts the Contribution back.
    await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: reversal });
    expect(await s.potOf(s.pot)).toMatchObject({
      chips: 30,
      contributions: { [s.bob]: 20, [s.alice]: 10 },
    });
  });

  test("reversing an Award that emptied the Pot restores its Contributions, and back again", async () => {
    const s = await setup();
    await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: pot(s.pot), amount: 10 });
    await s.t.mutation(api.chips.send, { deviceId: BOB, roomId: s.roomId, to: pot(s.pot), amount: 15 });
    const awarded = await s.t.mutation(api.chips.award, {
      deviceId: HOST,
      roomId: s.roomId,
      potId: s.pot,
      playerId: s.bob,
      amount: 25,
    });
    expect(await s.potOf(s.pot)).toMatchObject({ chips: 0, contributions: {} });

    const reversal = await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: awarded });
    expect(await s.potOf(s.pot)).toMatchObject({
      chips: 25,
      contributions: { [s.alice]: 10, [s.bob]: 15 },
    });
    expect(await s.chipsOf(s.bob)).toBe(85);

    // Reversing that Reversal is the Award again: the Pot empties and resets.
    await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: reversal });
    expect(await s.potOf(s.pot)).toMatchObject({ chips: 0, contributions: {} });
    expect(await s.chipsOf(s.bob)).toBe(110);
  });

  test("reversing the only Contribution empties the Pot and leaves no Contributions", async () => {
    const s = await setup();
    const sent = await s.t.mutation(api.chips.send, {
      deviceId: ALICE,
      roomId: s.roomId,
      to: pot(s.pot),
      amount: 10,
    });
    await s.t.mutation(api.chips.reverse, { deviceId: HOST, roomId: s.roomId, transferId: sent });
    expect(await s.potOf(s.pot)).toMatchObject({ chips: 0, contributions: {} });
  });

  test("reverses Bank and Correction Transfers", async () => {
    const s = await setup();
    const host = { deviceId: HOST, roomId: s.roomId };
    const given = await s.t.mutation(api.chips.bankGive, { ...host, to: player(s.alice), amount: 50 });
    await s.t.mutation(api.chips.reverse, { ...host, transferId: given });
    expect(await s.chipsOf(s.alice)).toBe(100);
    const corrected = await s.t.mutation(api.chips.correct, {
      ...host,
      from: player(s.bob),
      to: pot(s.pot),
      amount: 60,
    });
    expect((await s.potOf(s.pot)).contributions).toEqual({});
    await s.t.mutation(api.chips.reverse, { ...host, transferId: corrected });
    expect(await s.chipsOf(s.bob)).toBe(100);
    expect(await lastTransferId(s)).not.toBe(corrected);
  });
});

describe("activity", () => {
  test("is newest first, bounded by limit, and empty for outsiders", async () => {
    const s = await setup();
    for (let i = 1; i <= 5; i++) {
      await s.t.mutation(api.chips.send, { deviceId: ALICE, roomId: s.roomId, to: player(s.bob), amount: i });
    }
    const feed = await s.t.query(api.chips.activity, { deviceId: BOB, roomId: s.roomId, limit: 3 });
    expect(feed.map((r) => r.amount)).toEqual([5, 4, 3]);
    for (const limit of [0, -1, NaN, 1e9]) {
      const rows = await s.t.query(api.chips.activity, { deviceId: BOB, roomId: s.roomId, limit });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(200);
    }
    expect(await s.t.query(api.chips.activity, { deviceId: "device-stranger", roomId: s.roomId })).toEqual([]);
  });
});
