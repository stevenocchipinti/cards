import { describe, expect, it } from "vitest";
import {
  axesFromQuaternion,
  headingFromAxes,
  headingFromEuler,
  normalizeDegrees,
  pickSource,
  readOrientationEvent,
  relativeAngle,
  smoothHeading,
  type Smoothed,
} from "./heading";

const close = (a: number | null, b: number, eps = 1e-6) => {
  expect(a).not.toBeNull();
  // Compare on the circle so 359.9999 matches 0.
  expect(Math.abs(relativeAngle(a!, b))).toBeLessThan(eps);
};

describe("normalizeDegrees", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-360)).toBe(0);
    expect(Object.is(normalizeDegrees(-0), 0)).toBe(true);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(725)).toBe(5);
  });
});

describe("relativeAngle", () => {
  it("is the signed shortest turn, positive clockwise", () => {
    expect(relativeAngle(10, 350)).toBe(20);
    expect(relativeAngle(350, 10)).toBe(-20);
    expect(relativeAngle(90, 90)).toBe(0);
  });
  it("puts exactly opposite at +180, never -180", () => {
    expect(relativeAngle(180, 0)).toBe(180);
    expect(relativeAngle(0, 180)).toBe(180);
    expect(relativeAngle(270, 90)).toBe(180);
  });
});

describe("headingFromEuler", () => {
  it("flat phone: heading is where the top edge points (alpha is counter-clockwise)", () => {
    close(headingFromEuler(0, 0, 0), 0);
    close(headingFromEuler(90, 0, 0), 270);
    close(headingFromEuler(270, 0, 0), 90);
  });
  it("upright phone: heading is where the back camera looks", () => {
    close(headingFromEuler(0, 90, 0), 0);
    close(headingFromEuler(90, 90, 0), 270);
  });
  it("pitching between flat and upright doesn't change the heading", () => {
    for (const beta of [10, 30, 45, 60, 80]) close(headingFromEuler(30, beta, 0), 330, 1e-6);
  });
  it("rolling a flat phone sideways doesn't skew the heading", () => {
    close(headingFromEuler(0, 0, 40), 0);
    close(headingFromEuler(0, 0, -40), 0);
  });
  it("corrects for screen orientation (landscape)", () => {
    // Flat, top of the device at north, screen rotated 90°: the screen's top edge faces east.
    close(headingFromEuler(0, 0, 0, 90), 90);
    close(headingFromEuler(0, 0, 0, 270), 270);
    close(headingFromEuler(0, 0, 0, 180), 180);
  });
  it("returns null for a degenerate pose (tilted back, facing the ground)", () => {
    expect(headingFromEuler(0, 140, 0)).toBeNull();
  });
});

describe("axesFromQuaternion", () => {
  it("agrees with the Euler path", () => {
    close(headingFromAxes(axesFromQuaternion([0, 0, 0, 1])), 0);
    // 90° about z (counter-clockwise from above), same as alpha = 90.
    const s = Math.SQRT1_2;
    close(headingFromAxes(axesFromQuaternion([0, 0, s, s])), 270);
  });
});

describe("pickSource", () => {
  it("prefers the most trustworthy fresh source", () => {
    const latest = { absFlag: { heading: 1, t: 1000 }, webkit: { heading: 2, t: 1000 } };
    expect(pickSource(latest, 1500)).toBe("webkit");
  });
  it("falls through stale sources", () => {
    const latest = { sensor: { heading: 1, t: 0 }, absEvent: { heading: 2, t: 1900 } };
    expect(pickSource(latest, 2000)).toBe("absEvent");
  });
  it("returns null when nothing is fresh", () => {
    expect(pickSource({}, 0)).toBeNull();
    expect(pickSource({ sensor: { heading: 1, t: 0 } }, 5000)).toBeNull();
  });
});

describe("readOrientationEvent", () => {
  const base = { alpha: 90, beta: 0, gamma: 0 };
  it("uses iOS webkitCompassHeading when present", () => {
    expect(readOrientationEvent({ ...base, type: "deviceorientation", webkitCompassHeading: 42 }, 0)).toEqual({
      source: "webkit",
      heading: 42,
    });
  });
  it("ignores an uncalibrated (-1) webkitCompassHeading and falls back to Euler angles", () => {
    const r = readOrientationEvent({ ...base, type: "deviceorientation", absolute: true, webkitCompassHeading: -1 }, 0);
    expect(r?.source).toBe("absFlag");
    close(r!.heading, 270);
  });
  it("classifies absolute events", () => {
    expect(readOrientationEvent({ ...base, type: "deviceorientationabsolute" }, 0)?.source).toBe("absEvent");
    expect(readOrientationEvent({ ...base, type: "deviceorientation", absolute: true }, 0)?.source).toBe("absFlag");
  });
  it("rejects relative-only and empty events", () => {
    expect(readOrientationEvent({ ...base, type: "deviceorientation", absolute: false }, 0)).toBeNull();
    expect(readOrientationEvent({ type: "deviceorientation", alpha: null, beta: null, gamma: null }, 0)).toBeNull();
  });
});

describe("smoothHeading", () => {
  it("starts at the first reading", () => {
    expect(smoothHeading(null, 123, 0).heading).toBeCloseTo(123);
  });
  it("averages across north without swinging through south", () => {
    let s: Smoothed | null = null;
    for (let i = 0; i < 50; i++) s = smoothHeading(s, i % 2 ? 350 : 10, 16);
    close(s!.heading, 0, 3);
  });
  it("converges on a new heading over a few time constants", () => {
    let s = smoothHeading(null, 0, 0);
    s = smoothHeading(s, 90, 10);
    expect(s.heading).toBeGreaterThan(0);
    expect(s.heading).toBeLessThan(45);
    for (let i = 0; i < 60; i++) s = smoothHeading(s, 90, 16);
    close(s.heading, 90, 0.5);
  });
  it("is frame-rate independent", () => {
    let fast = smoothHeading(null, 0, 0);
    for (let i = 0; i < 6; i++) fast = smoothHeading(fast, 60, 10);
    const slow = smoothHeading(smoothHeading(null, 0, 0), 60, 60);
    // Not identical (it's a chord average), but close.
    expect(Math.abs(fast.heading - slow.heading)).toBeLessThan(3);
  });
});
