import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CENTER_SCALE, tapLayout } from "../../../lib/ringLayout.ts";
import type { PublicPlayer } from "../../room/types.ts";
import { bearingMap, compassRingLayout, targetKey, type Bearing } from "./compassRing.ts";
import { parseMode, resolveMode } from "./mode.ts";

const pl = (id: string): PublicPlayer => ({ _id: id as Id<"players">, name: id, color: "#fff", chips: 0, status: "active" }) as PublicPlayer;
const player = (id: string) => ({ kind: "player" as const, playerId: id as Id<"players"> });
const pot = (id: string) => ({ kind: "pot" as const, potId: id as Id<"pots"> });

describe("compassRingLayout", () => {
  const others = [pl("ann"), pl("bob"), pl("cat")];
  const bearings: Bearing[] = [
    { target: player("ann"), heading: 90 },
    { target: player("bob"), heading: 200 },
    { target: pot("main"), heading: 0 },
  ];
  const layout = (heading: number | null, potIds = ["main" as Id<"pots">]) =>
    compassRingLayout({ bearings: bearingMap(bearings), heading, potIds })(others, 390);

  it("uses tap slots with no heading yet, flagging who has no Bearing", () => {
    const r = layout(null);
    const tap = tapLayout(others, 390);
    expect(r.aimed).toBeNull();
    expect(r.slots.map((s) => [s.x, s.unplaced])).toEqual([
      [tap[0]!.x, false],
      [tap[1]!.x, false],
      [tap[2]!.x, true],
    ]);
  });

  it("centres and aims the Player I'm pointing at; unplaced ones keep their tap slot", () => {
    const r = layout(92);
    const [ann, bob, cat] = r.slots;
    expect(r.aimed).toEqual(player("ann"));
    expect(ann!.x).toBeCloseTo(195 - 2 * 5, 1); // about 5px per degree at 390
    expect(ann!.scale).toBeGreaterThan(1);
    expect(ann!.scale).toBeLessThanOrEqual(CENTER_SCALE);
    expect(bob!.edge).toBe("right");
    expect(cat!.unplaced).toBe(true);
    expect(cat!.x).toBeCloseTo(tapLayout(others, 390)[2]!.x);
  });

  it("aims a Pot with a Bearing, though Pots never get a ring slot", () => {
    const r = layout(355);
    expect(r.aimed).toEqual(pot("main"));
    expect(r.slots).toHaveLength(3);
  });

  it("aims whichever Target is nearest", () => {
    const near = compassRingLayout({
      bearings: bearingMap([...bearings, { target: player("cat"), heading: 6 }]),
      heading: 4,
      potIds: ["main" as Id<"pots">],
    })(others, 390);
    expect(near.aimed).toEqual(player("cat"));
    expect(layout(8).aimed).toEqual(pot("main"));
  });

  it("ignores a Bearing to a Pot that's gone, and aims nothing far from every Target", () => {
    expect(layout(0, []).aimed).toBeNull();
    expect(layout(140).aimed).toBeNull();
  });

  it("keys Targets by kind and id", () => {
    expect(targetKey(player("x"))).toBe("player:x");
    expect(targetKey(pot("x"))).toBe("pot:x");
  });
});

describe("resolveMode", () => {
  it("defaults to compass when the device seems to have one, else tap", () => {
    expect(resolveMode(null, "starting")).toEqual({ chosen: "compass", live: true, note: null });
    expect(resolveMode(null, "needs-permission")).toMatchObject({ chosen: "compass", live: false, note: expect.stringMatching(/compass button/) });
    expect(resolveMode(null, "unsupported")).toEqual({ chosen: "tap", live: false, note: null });
  });

  it("keeps the stored choice", () => {
    expect(resolveMode("tap", "active")).toEqual({ chosen: "tap", live: false, note: null });
    expect(resolveMode("compass", "active")).toEqual({ chosen: "compass", live: true, note: null });
  });

  it("falls back to tap mode, saying why, when the compass can't work", () => {
    for (const status of ["unsupported", "denied", "no-data"] as const) {
      const r = resolveMode("compass", status);
      expect(r).toMatchObject({ chosen: "compass", live: false });
      expect(r.note).toMatch(/tap a Target/);
    }
  });

  it("parses only known modes", () => {
    expect(parseMode("compass")).toBe("compass");
    expect(parseMode("tap")).toBe("tap");
    expect(parseMode("sideways")).toBeNull();
    expect(parseMode(null)).toBeNull();
  });
});
