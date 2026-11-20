/// <reference types="vite/client" />
import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOST = "device-host-1";
const ALICE = "device-alice-1";
const STRANGER = "device-stranger-1";

async function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  const { roomId, playerId: host, code } = await t.mutation(api.rooms.createRoom, {
    deviceId: HOST,
    name: "Hana",
  });
  const { playerId: alice } = await t.mutation(api.rooms.joinRoom, { deviceId: ALICE, code, name: "Alice" });
  const beat = (deviceId: string, sessionId = `session-${deviceId}`) =>
    t.mutation(api.presence.heartbeat, { deviceId, roomId, sessionId, interval: 10_000 });
  return { t, roomId, host, alice, beat };
}

describe("presence", () => {
  test("a heartbeat marks the caller's Player online, keyed by playerId, never deviceId", async () => {
    const s = await setup();
    const tokens = (await s.beat(HOST))!;
    expect(tokens).toEqual({ roomToken: expect.any(String), sessionToken: expect.any(String) });
    await s.beat(ALICE);
    const list = await s.t.query(api.presence.list, { roomToken: tokens.roomToken });
    expect(list).toHaveLength(2);
    expect(new Set(list.map((e) => e.userId))).toEqual(new Set([s.host, s.alice]));
    expect(list.every((e) => e.online)).toBe(true);
    expect(JSON.stringify(list)).not.toContain("device-");
  });

  test("disconnecting makes the Player Away but keeps them listed", async () => {
    const s = await setup();
    const hostTokens = (await s.beat(HOST))!;
    const aliceTokens = (await s.beat(ALICE))!;
    await s.t.mutation(api.presence.disconnect, { sessionToken: aliceTokens.sessionToken });
    const list = await s.t.query(api.presence.list, { roomToken: hostTokens.roomToken });
    expect(list).toEqual(
      expect.arrayContaining([
        { userId: s.host, online: true },
        { userId: s.alice, online: false },
      ]),
    );
  });

  test("someone not in the Room gets no tokens and isn't recorded", async () => {
    const s = await setup();
    expect(await s.beat(STRANGER)).toBeNull();
    const tokens = (await s.beat(HOST))!;
    const list = await s.t.query(api.presence.list, { roomToken: tokens.roomToken });
    expect(list.map((e) => e.userId)).toEqual([s.host]);
  });

  test("a Player who Left can't heartbeat any more", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.leaveRoom, { deviceId: ALICE, roomId: s.roomId });
    expect(await s.beat(ALICE)).toBeNull();
  });

  test("no heartbeats once the Room has Ended", async () => {
    const s = await setup();
    await s.t.mutation(api.rooms.endRoom, { deviceId: HOST, roomId: s.roomId });
    expect(await s.beat(HOST)).toBeNull();
  });

  test("a made-up roomToken lists nobody", async () => {
    const s = await setup();
    await s.beat(HOST);
    expect(await s.t.query(api.presence.list, { roomToken: "not-a-real-token" })).toEqual([]);
  });
});
