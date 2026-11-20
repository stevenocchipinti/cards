import { describe, expect, it } from "vitest";
import { activityText, type ActivityEntry, type ActivityNames } from "./activityText";

const names: ActivityNames = {
  players: new Map([
    ["ann", "Ann"],
    ["bob", "Bob"],
    ["sue", "Sue"],
  ]),
  pots: new Map([
    ["main", "Pot"],
    ["side", "Side pot"],
  ]),
};
const ann = { kind: "player", playerId: "ann" } as const;
const bob = { kind: "player", playerId: "bob" } as const;
const sue = { kind: "player", playerId: "sue" } as const;
const pot = { kind: "pot", potId: "main" } as const;
const side = { kind: "pot", potId: "side" } as const;
const bank = { kind: "bank" } as const;
const e = (kind: ActivityEntry["kind"], from: ActivityEntry["from"], to: ActivityEntry["to"], amount: number) => ({
  kind,
  from,
  to,
  amount,
});

describe("activityText", () => {
  it("writes sends as an arrow", () => {
    expect(activityText(e("send", ann, pot, 110), names)).toBe("Ann → Pot 110");
    expect(activityText(e("send", ann, bob, 5), names)).toBe("Ann → Bob 5");
  });
  it("names the Host for Awards, Corrections and Reversals", () => {
    expect(activityText(e("award", pot, bob, 330), names)).toBe("Host awarded Pot 330 to Bob");
    expect(activityText(e("correction", pot, side, 20), names)).toBe("Host corrected: Pot → Side pot 20");
    expect(activityText(e("reversal", pot, ann, 110), names)).toBe("Host reversed: Pot → Ann 110");
  });
  it("shows the Bank both ways", () => {
    expect(activityText(e("bank", bank, sue, 1000), names)).toBe("Bank → Sue 1,000");
    expect(activityText(e("bank", sue, bank, 50), names)).toBe("Sue → Bank 50");
  });
  it("words Starting Chips, Leave and Remove", () => {
    expect(activityText(e("starting", bank, sue, 1000), names)).toBe("Sue got 1,000 Starting Chips");
    expect(activityText(e("leave", bob, bank, 70), names)).toBe("Bob left: 70 back to the Bank");
    expect(activityText(e("removal", bob, bank, 70), names)).toBe("Host removed Bob: 70 back to the Bank");
  });
  it("can call me You", () => {
    expect(activityText(e("send", ann, pot, 1), { ...names, meId: "ann" })).toBe("You → Pot 1");
    expect(activityText(e("starting", bank, ann, 9), { ...names, meId: "ann" })).toBe("You got 9 Starting Chips");
  });
  it("copes with holders it can't name", () => {
    const who = { kind: "player", playerId: "gone" } as const;
    const where = { kind: "pot", potId: "gone" } as const;
    expect(activityText(e("send", who, where, 3), names)).toBe("Someone → a Pot 3");
  });
});
