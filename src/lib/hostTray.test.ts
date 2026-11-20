import { describe, expect, it } from "vitest";
import type { ActivityHolder } from "./activityText";
import {
  activityNote,
  activityNumbers,
  holderChips,
  holderKey,
  parseAmount,
  parseHolderKey,
  reverseCheck,
  stepAmount,
  type Table,
} from "./hostTray";

const table: Table = {
  players: [
    { _id: "ann", name: "Ann", chips: 500, status: "active" },
    { _id: "sue", name: "Sue", chips: 10, status: "active" },
    { _id: "bob", name: "Bob", chips: 0, status: "left" },
  ],
  pots: [
    { _id: "main", name: "Pot", chips: 330 },
    { _id: "side", name: "Side pot", chips: 0 },
  ],
};
const ann = { kind: "player", playerId: "ann" } as const;
const sue = { kind: "player", playerId: "sue" } as const;
const bob = { kind: "player", playerId: "bob" } as const;
const pot = { kind: "pot", potId: "main" } as const;
const side = { kind: "pot", potId: "side" } as const;
const bank = { kind: "bank" } as const;

describe("holderChips", () => {
  it("reads Players and Pots, and the Bank is unlimited", () => {
    expect(holderChips(ann, table)).toBe(500);
    expect(holderChips(pot, table)).toBe(330);
    expect(holderChips(bank, table)).toBe(Infinity);
  });
  it("is null for a Player who Left or a Pot that isn't there", () => {
    expect(holderChips(bob, table)).toBeNull();
    expect(holderChips({ kind: "pot", potId: "nope" }, table)).toBeNull();
    expect(holderChips({ kind: "player", playerId: "nope" }, table)).toBeNull();
  });
});

describe("reverseCheck", () => {
  const entry = (from: ActivityHolder, to: ActivityHolder, amount: number, reversedById: string | null = null) => ({
    from,
    to,
    amount,
    reversedById,
  });
  it("allows it when the receiver still holds the amount", () => {
    expect(reverseCheck(entry(ann, pot, 110), table)).toEqual({ canReverse: true, reason: null });
    expect(reverseCheck(entry(pot, ann, 500), table)).toEqual({ canReverse: true, reason: null });
  });
  it("always allows taking back from the Bank", () => {
    expect(reverseCheck(entry(sue, bank, 1_000_000), table).canReverse).toBe(true);
  });
  it("refuses with a reason when the receiver no longer holds enough", () => {
    expect(reverseCheck(entry(ann, sue, 50), table)).toEqual({
      canReverse: false,
      reason: "Sue only has 10: use a Correction",
    });
    expect(reverseCheck(entry(ann, side, 5), table).reason).toBe("Side pot only has 0: use a Correction");
  });
  it("refuses a Transfer that's already reversed", () => {
    expect(reverseCheck(entry(ann, pot, 1, "t9"), table)).toEqual({ canReverse: false, reason: "Already reversed" });
  });
  it("refuses when either Player has Left or was Removed", () => {
    expect(reverseCheck(entry(bob, ann, 5), table)).toEqual({ canReverse: false, reason: "Bob is no longer in the Room" });
    expect(reverseCheck(entry(bank, bob, 5), table).reason).toBe("Bob is no longer in the Room");
  });
});

describe("activityNumbers and activityNote", () => {
  const page = [{ _id: "c" }, { _id: "b" }, { _id: "a" }];
  const numbers = activityNumbers(page);
  it("numbers oldest first from 1", () => {
    expect([...numbers]).toEqual([
      ["c", 3],
      ["b", 2],
      ["a", 1],
    ]);
  });
  it("names the Transfer a Reversal reverses, and the one that reversed it", () => {
    expect(activityNote({ kind: "reversal", reversesId: "a", reversedById: null }, numbers)).toBe("Reversal of #1");
    expect(activityNote({ kind: "send", reversesId: null, reversedById: "b" }, numbers)).toBe("Reversed by #2");
    expect(activityNote({ kind: "reversal", reversesId: "a", reversedById: "c" }, numbers)).toBe(
      "Reversal of #1 · Reversed by #3",
    );
  });
  it("copes with a Transfer older than the page", () => {
    expect(activityNote({ kind: "reversal", reversesId: "old", reversedById: null }, numbers)).toBe(
      "Reversal of an earlier Transfer",
    );
  });
  it("is null for a plain Transfer", () => {
    expect(activityNote({ kind: "send", reversesId: null, reversedById: null }, numbers)).toBeNull();
  });
});

describe("holderKey", () => {
  it("round-trips every holder", () => {
    for (const h of [ann, pot, bank]) expect(parseHolderKey(holderKey(h))).toEqual(h);
  });
  it("rejects junk", () => {
    expect(parseHolderKey("")).toBeNull();
    expect(parseHolderKey("player:")).toBeNull();
    expect(parseHolderKey("chair:1")).toBeNull();
  });
});

describe("amounts", () => {
  it("steps within 0..max", () => {
    expect(stepAmount(10, 25, 100)).toBe(35);
    expect(stepAmount(90, 25, 100)).toBe(100);
    expect(stepAmount(10, -25, 100)).toBe(0);
    expect(stepAmount(10, 100, Infinity)).toBe(110);
  });
  it("parses typed digits, capped at max", () => {
    expect(parseAmount("120", 500)).toBe(120);
    expect(parseAmount("1,200", Infinity)).toBe(1200);
    expect(parseAmount("900", 500)).toBe(500);
    expect(parseAmount("", 500)).toBe(0);
    expect(parseAmount("abc", 500)).toBe(0);
    expect(parseAmount("99999999999999999999", Infinity)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
