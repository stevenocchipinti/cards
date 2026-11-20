// One Activity entry (a Transfer, see GLOSSARY.md) as a short line a Player can read at a
// glance, e.g. "Ann → Pot 110" or "Host awarded Pot 330 to Bob". Pure, so it's tested and
// shared: the Play screen's ticker shows the last two, and the Host's Activity log shows all.

export type ActivityHolder =
  | { kind: "player"; playerId: string }
  | { kind: "pot"; potId: string }
  | { kind: "bank" };

export type ActivityKind =
  | "send"
  | "starting"
  | "award"
  | "bank"
  | "correction"
  | "reversal"
  | "leave"
  | "removal";

/** The fields of an api.chips.activity row that the text depends on. */
export type ActivityEntry = {
  kind: ActivityKind;
  from: ActivityHolder;
  to: ActivityHolder;
  amount: number;
};

export type ActivityNames = {
  /** Every Player who has been in the Room, including those who Left or were Removed. */
  players: ReadonlyMap<string, string>;
  pots: ReadonlyMap<string, string>;
  /** When given, this Player is written as "You". */
  meId?: string;
};

export function holderName(h: ActivityHolder, names: ActivityNames): string {
  switch (h.kind) {
    case "bank":
      return "Bank";
    case "pot":
      return names.pots.get(h.potId) ?? "a Pot";
    case "player":
      if (names.meId !== undefined && h.playerId === names.meId) return "You";
      return names.players.get(h.playerId) ?? "Someone";
  }
}

export function activityText(entry: ActivityEntry, names: ActivityNames): string {
  const from = holderName(entry.from, names);
  const to = holderName(entry.to, names);
  const n = entry.amount.toLocaleString("en");
  switch (entry.kind) {
    case "send":
    case "bank":
      return `${from} → ${to} ${n}`;
    case "starting":
      return `${to} got ${n} Starting Chips`;
    case "award":
      return `Host awarded ${from} ${n} to ${to}`;
    case "correction":
      return `Host corrected: ${from} → ${to} ${n}`;
    case "reversal":
      return `Host reversed: ${from} → ${to} ${n}`;
    case "leave":
      return `${from} left: ${n} back to the Bank`;
    case "removal":
      return `Host removed ${from}: ${n} back to the Bank`;
  }
}
