import { describe, expect, it } from "vitest";
import { dragAmount, dragSteps } from "./chipDrag.ts";

describe("dragSteps", () => {
  it("counts whole steps, up is positive", () => {
    expect(dragSteps(500, 500)).toBe(0);
    expect(dragSteps(500, 477)).toBe(0);
    expect(dragSteps(500, 476)).toBe(1);
    expect(dragSteps(500, 428)).toBe(3);
  });
  it("counts down as negative", () => {
    expect(dragSteps(500, 524)).toBe(-1);
    expect(dragSteps(500, 523)).toBe(0);
  });
});

describe("dragAmount", () => {
  it("steps by the chip's value", () => {
    expect(dragAmount(50, 3, 25, 1000)).toEqual({ amount: 125, atLimit: false });
    expect(dragAmount(50, -1, 25, 1000)).toEqual({ amount: 25, atLimit: false });
  });
  it("stops at zero", () => {
    expect(dragAmount(50, -5, 25, 1000)).toEqual({ amount: 0, atLimit: true });
  });
  it("stops at my Chips", () => {
    expect(dragAmount(900, 2, 100, 960)).toEqual({ amount: 960, atLimit: true });
  });
});
