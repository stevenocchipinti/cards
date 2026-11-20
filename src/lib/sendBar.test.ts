import { describe, expect, it } from "vitest";
import { addToAmount, cappedAmount, isSwipeUp, sendBarState } from "./sendBar";

describe("addToAmount", () => {
  it("adds chip values", () => {
    expect(addToAmount(0, 25, 1000)).toBe(25);
    expect(addToAmount(25, 100, 1000)).toBe(125);
  });
  it("caps at my Chips", () => {
    expect(addToAmount(90, 25, 100)).toBe(100);
    expect(addToAmount(0, 5, 0)).toBe(0);
  });
});

describe("cappedAmount", () => {
  it("drops to my Chips if they fall under the amount", () => {
    expect(cappedAmount(300, 120)).toBe(120);
    expect(cappedAmount(50, 120)).toBe(50);
    expect(cappedAmount(50, 0)).toBe(0);
  });
});

describe("sendBarState", () => {
  it("asks for a Target first, then an amount", () => {
    expect(sendBarState({ targetName: null, amount: 10, myChips: 100 })).toEqual({ canSend: false, label: "Tap a Target" });
    expect(sendBarState({ targetName: "Ann", amount: 0, myChips: 100 })).toEqual({ canSend: false, label: "Pick an amount" });
  });
  it("is live with both, using the capped amount", () => {
    expect(sendBarState({ targetName: "Pot", amount: 5000, myChips: 1200 })).toEqual({
      canSend: true,
      label: "Swipe up: 1,200 to Pot",
    });
  });
  it("is off with no Chips (a late joiner) or while sending", () => {
    expect(sendBarState({ targetName: "Ann", amount: 5, myChips: 0 }).canSend).toBe(false);
    expect(sendBarState({ targetName: "Ann", amount: 5, myChips: 10, busy: true })).toEqual({
      canSend: false,
      label: "Sending…",
    });
  });
  it("takes a custom no-Target hint", () => {
    expect(sendBarState({ targetName: null, amount: 1, myChips: 1, noTargetHint: "Aim or tap a Target" }).label).toBe(
      "Aim or tap a Target",
    );
  });
});

describe("isSwipeUp", () => {
  it("needs more than 30px upward", () => {
    expect(isSwipeUp(200, 160)).toBe(true);
    expect(isSwipeUp(200, 175)).toBe(false);
    expect(isSwipeUp(200, 260)).toBe(false);
  });
});
