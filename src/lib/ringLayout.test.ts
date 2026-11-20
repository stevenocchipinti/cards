import { describe, expect, it } from "vitest";
import {
  AIM_DEG,
  CENTER_SCALE,
  PINNED_MAX_DEPTH_PX,
  PINNED_SCALE,
  PINNED_STEP_PX,
  TAP_MIN_SCALE,
  TAP_STAGGER_PX,
  arcTop,
  compassLayout,
  rotateSeating,
  tapLayout,
  type CompassTarget,
} from "./ringLayout";

describe("arcTop", () => {
  it("matches the mockup circle: radius 450 centred at (W/2, 530)", () => {
    expect(arcTop(195, 390)).toBe(80);
    expect(arcTop(0, 390)).toBeCloseTo(530 - Math.sqrt(450 ** 2 - 195 ** 2));
    expect(arcTop(100, 390)).toBeCloseTo(arcTop(290, 390)); // symmetric
    expect(arcTop(215, 430)).toBe(80); // centred on any width
  });
  it("is lowest at the edges", () => {
    expect(arcTop(20, 390)).toBeGreaterThan(arcTop(120, 390));
  });
});

describe("rotateSeating", () => {
  // Seating Order is clockwise from above; facing the centre, clockwise-next is on my left.
  const order = ["a", "b", "c", "d", "e"];
  it("starts with my left neighbour (next clockwise) and ends with my right (previous)", () => {
    expect(rotateSeating(order, "c")).toEqual(["d", "e", "a", "b"]);
  });
  it("wraps at both ends", () => {
    expect(rotateSeating(order, "a")).toEqual(["b", "c", "d", "e"]);
    expect(rotateSeating(order, "e")).toEqual(["a", "b", "c", "d"]);
  });
  it("leaves me out, and copes with being alone or unseated", () => {
    expect(rotateSeating(["me"], "me")).toEqual([]);
    expect(rotateSeating(order, "zz")).toEqual(order);
  });
});

describe("tapLayout", () => {
  it("puts one other Player dead centre", () => {
    const [s] = tapLayout(["a"], 390);
    expect(s).toEqual({ target: "a", x: 195, y: 80, scale: 1 });
  });
  it("spaces Players evenly from the left edge to the right edge, in order, on the arc", () => {
    const slots = tapLayout(["l", "m", "r"], 390);
    expect(slots.map((s) => s.target)).toEqual(["l", "m", "r"]);
    const [l, m, r] = slots.map((s) => s.x) as [number, number, number];
    expect(l).toBeLessThan(m);
    expect(m).toBe(195);
    expect(r - m).toBeCloseTo(m - l);
    expect(l).toBeGreaterThan(20);
    expect(390 - r).toBeCloseTo(l);
    for (const s of slots) {
      expect(s.y).toBeCloseTo(arcTop(s.x, 390));
      expect(s.scale).toBe(1);
    }
  });
  it("scales x with the width", () => {
    const a = tapLayout(["x", "y"], 390);
    const b = tapLayout(["x", "y"], 780);
    expect(b[0]!.x).toBeCloseTo(a[0]!.x * 2);
  });
  it("staggers a crowded ring, then shrinks it", () => {
    const four = tapLayout(["a", "b", "c", "d"], 390); // 100px apart: room to spare
    expect(four.every((s) => s.scale === 1 && s.y === arcTop(s.x, 390))).toBe(true);

    const six = tapLayout(["a", "b", "c", "d", "e", "f"], 390); // 60px apart
    expect(six.map((s) => s.scale)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(six[0]!.y).toBeCloseTo(arcTop(six[0]!.x, 390));
    expect(six[1]!.y).toBeCloseTo(arcTop(six[1]!.x, 390) + TAP_STAGGER_PX);

    const many = tapLayout(Array.from({ length: 23 }, (_, i) => i), 390);
    expect(many[0]!.scale).toBe(TAP_MIN_SCALE);
    expect(many[1]!.y).toBeCloseTo(arcTop(many[1]!.x, 390) + TAP_STAGGER_PX * TAP_MIN_SCALE);
  });
  it("handles nobody", () => {
    expect(tapLayout([], 390)).toEqual([]);
  });
});

describe("compassLayout", () => {
  const p = (id: string, bearing?: number | null): CompassTarget => ({ id, kind: "player", bearing });
  const byId = (r: ReturnType<typeof compassLayout>) => Object.fromEntries(r.slots.map((s) => [s.target.id, s]));

  it("puts a Target dead ahead in the centre, biggest, and aims at it", () => {
    const r = compassLayout([p("a", 90)], 90, 390);
    const a = r.slots[0]!;
    expect(a.x).toBe(195);
    expect(a.y).toBe(80);
    expect(a.scale).toBeCloseTo(CENTER_SCALE);
    expect(a.aimed).toBe(true);
    expect(a.edge).toBeNull();
    expect(r.aimed?.id).toBe("a");
  });

  it("maps degrees to about 5px each at 390 wide, right of heading to the right", () => {
    const s = byId(compassLayout([p("r", 100), p("l", 80)], 90, 390));
    expect(s.r!.x - 195).toBeCloseTo(50, 0);
    expect(195 - s.l!.x).toBeCloseTo(50, 0);
    expect(s.r!.relative).toBe(10);
    expect(s.l!.relative).toBe(-10);
  });

  it("shrinks Targets towards the edge of the view", () => {
    const s = byId(compassLayout([p("near", 5), p("far", 28)], 0, 390));
    expect(s.near!.scale).toBeGreaterThan(s.far!.scale);
    expect(s.far!.scale).toBeGreaterThanOrEqual(1);
    expect(compassLayout([p("edge", 30)], 0).slots[0]!.scale).toBeCloseTo(1);
  });

  it("works across north", () => {
    const s = byId(compassLayout([p("a", 5), p("b", 355)], 0, 390));
    expect(s.a!.x).toBeGreaterThan(195);
    expect(s.b!.x).toBeLessThan(195);
    expect(compassLayout([p("c", 10)], 350).slots[0]!.relative).toBe(20);
  });

  it("aims at the nearest Target within 10° only", () => {
    const r = compassLayout([p("a", 8), p("b", -3), p("c", 20)], 0, 390);
    expect(r.aimed?.id).toBe("b");
    expect(r.slots.filter((s) => s.aimed).map((s) => s.target.id)).toEqual(["b"]);
    expect(compassLayout([p("a", AIM_DEG + 1)], 0).aimed).toBeNull();
    expect(compassLayout([p("a", AIM_DEG)], 0).aimed?.id).toBe("a");
  });

  it("pins out-of-view Targets small to the matching edge, stacked closest first", () => {
    const r = compassLayout([p("r2", 150), p("r1", 40), p("l1", -60), p("l2", -170)], 0, 390);
    const s = byId(r);
    for (const id of ["r1", "r2"]) expect(s[id]!.edge).toBe("right");
    for (const id of ["l1", "l2"]) expect(s[id]!.edge).toBe("left");
    for (const slot of r.slots) {
      expect(slot.scale).toBe(PINNED_SCALE);
      expect(slot.aimed).toBe(false);
    }
    expect(s.l1!.x).toBeLessThan(40);
    expect(s.r1!.x).toBeGreaterThan(350);
    expect(s.r1!.x).toBe(s.r2!.x);
    expect(s.r1!.y).toBeCloseTo(arcTop(s.r1!.x, 390));
    expect(s.r2!.y - s.r1!.y).toBeCloseTo(PINNED_STEP_PX);
    expect(s.l2!.y - s.l1!.y).toBeCloseTo(PINNED_STEP_PX);
    expect(r.aimed).toBeNull();
  });

  it("squeezes a deep pinned stack so it never reaches past PINNED_MAX_DEPTH_PX", () => {
    const three = byId(compassLayout([p("a", 40), p("b", 60), p("c", 80)], 0, 390));
    expect(three.b!.y - three.a!.y).toBeCloseTo(PINNED_STEP_PX); // three fit unsqueezed

    const r = compassLayout(
      Array.from({ length: 7 }, (_, i) => p(`r${i}`, 40 + i * 10)),
      0,
      390,
    );
    const s = byId(r);
    const top = s.r0!.y;
    expect(top).toBeCloseTo(arcTop(s.r0!.x, 390));
    expect(s.r6!.y - top).toBeCloseTo(PINNED_MAX_DEPTH_PX);
    expect(s.r1!.y - top).toBeCloseTo(PINNED_MAX_DEPTH_PX / 6); // evenly squeezed, closest first
  });

  it("sends a Target exactly behind to the right edge", () => {
    expect(compassLayout([p("a", 180)], 0).slots[0]!.edge).toBe("right");
  });

  it("leaves Targets with no Bearing in their tap-mode slot, flagged unplaced", () => {
    const targets = [p("a", null), p("b", 0), p("c")];
    const tap = tapLayout(targets, 390);
    const r = compassLayout(targets, 0, 390);
    const [a, , c] = r.slots;
    expect(a).toMatchObject({ x: tap[0]!.x, y: tap[0]!.y, scale: 1, unplaced: true, edge: null, aimed: false, relative: null });
    expect(c).toMatchObject({ x: tap[2]!.x, unplaced: true });
    expect(r.slots[1]!.unplaced).toBe(false);
    expect(r.aimed?.id).toBe("b");
  });

  it("keeps input order and passes the Target through, so callers can filter Pots", () => {
    const pot: CompassTarget = { id: "pot", kind: "pot", bearing: 2 };
    const r = compassLayout([p("a", 0), pot], 0, 390);
    expect(r.slots.map((s) => s.target)).toEqual([p("a", 0), pot]);
    expect(r.aimed?.id).toBe("a"); // 0° beats 2°
    expect(r.slots.filter((s) => s.target.kind === "player")).toHaveLength(1);
  });
});
