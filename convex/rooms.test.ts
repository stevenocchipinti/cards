/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CODE_ALPHABET, PLAYER_COLORS } from "./rooms";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOST = "device-host-1";
const ALICE = "device-alice-1";
const BOB = "device-bob-1";

/** A Room with a Host, Alice and Bob, in the Lobby unless `start` is set. */
async function setup(opts: { start?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const { roomId, playerId: host, code } = await t.mutation(api.rooms.createRoom, {
    deviceId: HOST,
    name: "Hana",
  });
  const { playerId: alice } = await t.mutation(api.rooms.joinRoom, { deviceId: ALICE, code, name: "Alice" });
  const { playerId: bob } = await t.mutation(api.rooms.joinRoom, { deviceId: BOB, code, name: "Bob" });
  if (opts.start) await t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId });
  const view = (deviceId: string) => t.query(api.rooms.getRoom, { deviceId, roomId });
  const chipsOf = (id: Id<"players">) => t.run(async (ctx) => (await ctx.db.get(id))!.chips);
  return { t, roomId, code, host, alice, bob, view, chipsOf };
}

describe("createRoom", () => {
  test("makes the creator Host of a Lobby Room with a code, a Pot and default Starting Chips", async () => {
    const s = await setup();
    const view = (await s.view(HOST))!;
    expect(view.isHost).toBe(true);
    expect(view.room).toMatchObject({ stage: "lobby", startingChips: 1000, hostPlayerId: s.host });
    expect(view.room.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`));
    expect(view.pots).toEqual([expect.objectContaining({ name: "Pot", chips: 0, contributions: {} })]);
    expect(view.me).toMatchObject({ _id: s.host, name: "Hana", chips: 0, status: "active" });
    expect(PLAYER_COLORS).toContain(view.me.color);
    expect(view.bank).toEqual({ chipsOut: 0 });
  });

  test("codes are unique among Rooms that haven't Ended", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const room = { startingChips: 0, seatingOrder: [] };
      await ctx.db.insert("rooms", { ...room, code: "2222", stage: "lobby" });
      await ctx.db.insert("rooms", { ...room, code: "3333", stage: "inPlay" });
      await ctx.db.insert("rooms", { ...room, code: "4444", stage: "ended" });
    });
    // Random draws spell 2222 (taken), then 3333 (taken), then 4444 (free: its Room Ended).
    const draws = [0, 1.5, 2.5].flatMap((i) => Array<number>(4).fill(i / CODE_ALPHABET.length));
    const spy = vi.spyOn(Math, "random").mockImplementation(() => draws.shift() ?? 0.99);
    try {
      const { code } = await t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "Hana" });
      expect(code).toBe("4444");
    } finally {
      spy.mockRestore();
    }
  });

  test("an Ended Room's code can be used by a new Room, and can't be joined", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.endRoom, { deviceId: HOST, roomId: s.roomId });
    const reused = await s.t.run(async (ctx) =>
      ctx.db.insert("rooms", { code: s.code, stage: "lobby", startingChips: 0, seatingOrder: [] }),
    );
    const { roomId } = await s.t.mutation(api.rooms.joinRoom, { deviceId: "device-new-1", code: s.code, name: "N" });
    expect(roomId).toBe(reused);
  });

  test("refuses bad names and device ids", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "   " })).rejects.toThrow(/Name/);
    await expect(t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "x".repeat(25) })).rejects.toThrow();
    await expect(t.mutation(api.rooms.createRoom, { deviceId: "short", name: "Hana" })).rejects.toThrow();
  });

  test("a retry with the same requestId returns the same Room instead of making another", async () => {
    const t = convexTest(schema, modules);
    const requestId = "req-0000-1111";
    const first = await t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "Hana", requestId });
    const again = await t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "Hana", requestId });
    expect(again).toEqual(first);
    const rooms = await t.query(api.rooms.myRooms, { deviceId: HOST });
    expect(rooms).toHaveLength(1);
    const other = await t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "Hana", requestId: "req-2222-3333" });
    expect(other.roomId).not.toBe(first.roomId);
  });

  test("another device's requestId never hands over someone else's Room", async () => {
    const t = convexTest(schema, modules);
    const requestId = "req-0000-1111";
    const mine = await t.mutation(api.rooms.createRoom, { deviceId: HOST, name: "Hana", requestId });
    const theirs = await t.mutation(api.rooms.createRoom, { deviceId: ALICE, name: "Alice", requestId });
    expect(theirs.roomId).not.toBe(mine.roomId);
    expect(theirs.playerId).not.toBe(mine.playerId);
  });
});

describe("joinRoom", () => {
  test("adds Players to the end of the Seating Order, with distinct colours", async () => {
    const s = await setup();
    const view = (await s.view(ALICE))!;
    expect(view.isHost).toBe(false);
    expect(view.bank).toBeNull();
    expect(view.room.seatingOrder).toEqual([s.host, s.alice, s.bob]);
    expect(new Set(view.players.map((p) => p.color)).size).toBe(3);
    // No query ever returns a deviceId.
    expect(JSON.stringify(view)).not.toContain("device-");
  });

  test("codes are case-insensitive and trimmed", async () => {
    const s = await setup();
    const { roomId } = await s.t.mutation(api.rooms.joinRoom, {
      deviceId: "device-carl-1",
      code: ` ${s.code.toLowerCase()} `,
      name: "Carl",
    });
    expect(roomId).toBe(s.roomId);
  });

  test("the same device gets its existing Player back", async () => {
    const s = await setup();
    const again = await s.t.mutation(api.rooms.joinRoom, { deviceId: ALICE, code: s.code, name: "Other name" });
    expect(again.playerId).toBe(s.alice);
    expect((await s.view(ALICE))!.room.seatingOrder).toHaveLength(3);
  });

  test("joining In Play starts with zero Chips", async () => {
    const s = await setup({ start: true });
    const { playerId } = await s.t.mutation(api.rooms.joinRoom, { deviceId: "device-carl-1", code: s.code, name: "Carl" });
    expect(await s.chipsOf(playerId)).toBe(0);
    expect((await s.view(HOST))!.room.seatingOrder.at(-1)).toBe(playerId);
  });

  test("refuses unknown codes and Ended Rooms", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.rooms.joinRoom, { deviceId: "device-carl-1", code: "2222", name: "Carl" }),
    ).rejects.toThrow(/No open Room/);
    await s.t.mutation(api.rooms.endRoom, { deviceId: HOST, roomId: s.roomId });
    await expect(
      s.t.mutation(api.rooms.joinRoom, { deviceId: "device-carl-1", code: s.code, name: "Carl" }),
    ).rejects.toThrow(/No open Room/);
  });

  test("rejoining after Leaving makes a new Player with zero Chips", async () => {
    const s = await setup({ start: true });
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    const { playerId } = await s.t.mutation(api.rooms.joinRoom, { deviceId: ALICE, code: s.code, name: "Alice" });
    expect(playerId).not.toBe(s.alice);
    expect(await s.chipsOf(playerId)).toBe(0);
  });
});

describe("getRoom and myRooms", () => {
  test("getRoom is null for anyone without an active Player in the Room", async () => {
    const s = await setup();
    expect(await s.view("device-stranger")).toBeNull();
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    expect(await s.view(ALICE)).toBeNull();
    const players = (await s.view(BOB))!.players;
    expect(players.find((p) => p._id === s.alice)?.status).toBe("left");
  });

  test("myRooms lists this device's Rooms that haven't Ended", async () => {
    const s = await setup();
    const second = await s.t.mutation(api.rooms.createRoom, { deviceId: ALICE, name: "Alice" });
    const mine = await s.t.query(api.rooms.myRooms, { deviceId: ALICE });
    expect(mine.map((r) => r.roomId)).toEqual([second.roomId, s.roomId]);
    expect(mine[0]).toMatchObject({ code: second.code, stage: "lobby", isHost: true });
    expect(mine[1]).toMatchObject({ code: s.code, isHost: false, playerId: s.alice });

    await s.t.mutation(api.rooms.endRoom, { deviceId: ALICE, roomId: second.roomId });
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    expect(await s.t.query(api.rooms.myRooms, { deviceId: ALICE })).toEqual([]);
  });
});

describe("Lobby setup", () => {
  test("Host sets Starting Chips; refused for non-Hosts, bad amounts and after starting", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.setStartingChips, { deviceId: HOST, roomId: s.roomId, amount: 500 });
    expect((await s.view(HOST))!.room.startingChips).toBe(500);
    await expect(
      s.t.mutation(api.rooms.setStartingChips, { deviceId: ALICE, roomId: s.roomId, amount: 5 }),
    ).rejects.toThrow(/Only the Host/);
    for (const amount of [-1, 1.5, NaN, Infinity, 2e9]) {
      await expect(
        s.t.mutation(api.rooms.setStartingChips, { deviceId: HOST, roomId: s.roomId, amount }),
      ).rejects.toThrow();
    }
    await s.t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId: s.roomId });
    await expect(
      s.t.mutation(api.rooms.setStartingChips, { deviceId: HOST, roomId: s.roomId, amount: 5 }),
    ).rejects.toThrow(/Lobby/);
  });

  test("setSeatingOrder must be a permutation of the active Players", async () => {
    const s = await setup();
    const set = (deviceId: string, seatingOrder: Id<"players">[]) =>
      s.t.mutation(api.rooms.setSeatingOrder, { deviceId, roomId: s.roomId, seatingOrder });
    await set(HOST, [s.bob, s.host, s.alice]);
    expect((await s.view(HOST))!.room.seatingOrder).toEqual([s.bob, s.host, s.alice]);
    await expect(set(ALICE, [s.alice, s.bob, s.host])).rejects.toThrow(/Only the Host/);
    await expect(set(HOST, [s.bob, s.host])).rejects.toThrow(/every Player/);
    await expect(set(HOST, [s.bob, s.bob, s.host])).rejects.toThrow(/every Player/);
    await expect(set(HOST, [s.bob, s.host, s.alice, s.alice])).rejects.toThrow(/every Player/);
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: BOB, roomId: s.roomId });
    await expect(set(HOST, [s.bob, s.host, s.alice])).rejects.toThrow(/every Player/);
    await set(HOST, [s.alice, s.host]);
  });

  test("startRoom gives every Player the Starting Chips from the Bank, once", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.setStartingChips, { deviceId: HOST, roomId: s.roomId, amount: 250 });
    await expect(s.t.mutation(api.rooms.startRoom, { deviceId: ALICE, roomId: s.roomId })).rejects.toThrow(
      /Only the Host/,
    );
    await s.t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId: s.roomId });
    const view = (await s.view(HOST))!;
    expect(view.room.stage).toBe("inPlay");
    expect(view.players.map((p) => p.chips)).toEqual([250, 250, 250]);
    expect(view.bank).toEqual({ chipsOut: 750 });
    const feed = await s.t.query(api.chips.activity, { deviceId: ALICE, roomId: s.roomId });
    expect(feed).toHaveLength(3);
    expect(feed.every((r) => r.kind === "starting" && r.from.kind === "bank" && r.amount === 250)).toBe(true);
    await expect(s.t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId: s.roomId })).rejects.toThrow(
      /already started/,
    );
  });

  test("starting with zero Starting Chips records no Transfers", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.setStartingChips, { deviceId: HOST, roomId: s.roomId, amount: 0 });
    await s.t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId: s.roomId });
    expect(await s.t.query(api.chips.activity, { deviceId: HOST, roomId: s.roomId })).toEqual([]);
  });
});

describe("leaveRoom", () => {
  test("a Player's Chips go to the Bank and they lose their seat", async () => {
    const s = await setup({ start: true });
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    expect(await s.chipsOf(s.alice)).toBe(0);
    const view = (await s.view(HOST))!;
    expect(view.room.seatingOrder).toEqual([s.host, s.bob]);
    expect(view.bank).toEqual({ chipsOut: 2000 });
    const [latest] = await s.t.query(api.chips.activity, { deviceId: HOST, roomId: s.roomId });
    expect(latest).toMatchObject({ kind: "leave", amount: 1000, from: { kind: "player", playerId: s.alice } });
    await expect(s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId })).rejects.toThrow(
      /not in this Room/,
    );
  });

  test("leaving the Lobby records no Transfer", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    expect(await s.t.query(api.chips.activity, { deviceId: HOST, roomId: s.roomId })).toEqual([]);
  });

  test("non-Hosts can't hand over or end the Room by leaving", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId, endRoom: true }),
    ).rejects.toThrow(/Only the Host/);
    await expect(
      s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId, handOverTo: s.bob }),
    ).rejects.toThrow(/Only the Host/);
  });

  test("the Host must hand over or end the Room, not neither or both", async () => {
    const s = await setup({ start: true });
    const leave = (extra: { handOverTo?: Id<"players">; endRoom?: boolean }) =>
      s.t.mutation(api.rooms.leaveRoom, { deviceId: HOST, roomId: s.roomId, ...extra });
    await expect(leave({})).rejects.toThrow(/hand over/);
    await expect(leave({ endRoom: false })).rejects.toThrow(/hand over/);
    await expect(leave({ handOverTo: s.alice, endRoom: true })).rejects.toThrow(/hand over/);
    await expect(leave({ handOverTo: s.host })).rejects.toThrow(/another Player/);

    await leave({ handOverTo: s.alice });
    const view = (await s.view(ALICE))!;
    expect(view.isHost).toBe(true);
    expect(view.room.hostPlayerId).toBe(s.alice);
    expect(view.room.stage).toBe("inPlay");
    expect(await s.chipsOf(s.host)).toBe(0);
  });

  test("the Host can't hand over to someone who has left", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: BOB, roomId: s.roomId });
    await expect(
      s.t.mutation(api.rooms.leaveRoom, { deviceId: HOST, roomId: s.roomId, handOverTo: s.bob }),
    ).rejects.toThrow(/isn't in this Room/);
  });

  test("the Host leaving with endRoom Ends the Room", async () => {
    const s = await setup({ start: true });
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: HOST, roomId: s.roomId, endRoom: true });
    const view = (await s.view(ALICE))!;
    expect(view.room.stage).toBe("ended");
    expect(view.room.endedAt).toEqual(expect.any(Number));
    await expect(s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId })).rejects.toThrow(
      /ended/,
    );
  });
});

describe("Host tools", () => {
  test("removePlayer reclaims their Chips into the Bank", async () => {
    const s = await setup({ start: true });
    await expect(
      s.t.mutation(api.rooms.removePlayer, { deviceId: ALICE, roomId: s.roomId, playerId: s.bob }),
    ).rejects.toThrow(/Only the Host/);
    await expect(
      s.t.mutation(api.rooms.removePlayer, { deviceId: HOST, roomId: s.roomId, playerId: s.host }),
    ).rejects.toThrow(/another Player/);
    await s.t.mutation(api.rooms.removePlayer, { deviceId: HOST, roomId: s.roomId, playerId: s.bob });
    expect(await s.chipsOf(s.bob)).toBe(0);
    expect(await s.view(BOB)).toBeNull();
    const view = (await s.view(HOST))!;
    expect(view.room.seatingOrder).toEqual([s.host, s.alice]);
    expect(view.players.find((p) => p._id === s.bob)?.status).toBe("removed");
    const [latest] = await s.t.query(api.chips.activity, { deviceId: HOST, roomId: s.roomId });
    expect(latest).toMatchObject({ kind: "removal", amount: 1000, to: { kind: "bank" } });
    await expect(
      s.t.mutation(api.rooms.removePlayer, { deviceId: HOST, roomId: s.roomId, playerId: s.bob }),
    ).rejects.toThrow(/isn't in this Room/);
  });

  test("handOverHost passes the Host role on; the old Host loses Host powers", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.rooms.handOverHost, { deviceId: ALICE, roomId: s.roomId, playerId: s.bob }),
    ).rejects.toThrow(/Only the Host/);
    await s.t.mutation(api.rooms.handOverHost, { deviceId: HOST, roomId: s.roomId, playerId: s.bob });
    expect((await s.view(BOB))!.isHost).toBe(true);
    expect((await s.view(HOST))!.isHost).toBe(false);
    await expect(s.t.mutation(api.rooms.startRoom, { deviceId: HOST, roomId: s.roomId })).rejects.toThrow(
      /Only the Host/,
    );
    await s.t.mutation(api.rooms.startRoom, { deviceId: BOB, roomId: s.roomId });
  });

  test("endRoom Ends the Room; nothing else can happen afterwards", async () => {
    const s = await setup({ start: true });
    await expect(s.t.mutation(api.rooms.endRoom, { deviceId: ALICE, roomId: s.roomId })).rejects.toThrow(
      /Only the Host/,
    );
    await s.t.mutation(api.rooms.endRoom, { deviceId: HOST, roomId: s.roomId });
    expect((await s.view(HOST))!.room.stage).toBe("ended");
    const base = { deviceId: HOST, roomId: s.roomId };
    await expect(s.t.mutation(api.rooms.endRoom, base)).rejects.toThrow(/ended/);
    await expect(s.t.mutation(api.rooms.handOverHost, { ...base, playerId: s.alice })).rejects.toThrow(/ended/);
    await expect(s.t.mutation(api.rooms.removePlayer, { ...base, playerId: s.alice })).rejects.toThrow(/ended/);
    await expect(
      s.t.mutation(api.rooms.setSeatingOrder, { ...base, seatingOrder: [s.host, s.alice, s.bob] }),
    ).rejects.toThrow(/ended/);
    await expect(
      s.t.mutation(api.chips.send, {
        deviceId: ALICE,
        roomId: s.roomId,
        to: { kind: "player", playerId: s.bob },
        amount: 1,
      }),
    ).rejects.toThrow(/ended/);
    await expect(
      s.t.mutation(api.chips.bankGive, { ...base, to: { kind: "player", playerId: s.bob }, amount: 1 }),
    ).rejects.toThrow(/ended/);
  });
});
