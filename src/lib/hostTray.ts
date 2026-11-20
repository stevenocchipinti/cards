// The Host's dealer tray and Activity log rules (docs/PRD.md › Chips › Host powers). Pure, so
// they're tested. The server enforces all of this too; these decide what the UI offers and
// why a button is disabled, from the live balances getRoom already gives the Host.

import type { ActivityHolder, ActivityKind } from "./activityText.ts";

/** The parts of api.rooms.getRoom these rules read. */
export type Table = {
  players: ReadonlyArray<{ _id: string; name: string; chips: number; status: "active" | "left" | "removed" }>;
  pots: ReadonlyArray<{ _id: string; name: string; chips: number }>;
};

/**
 * What a holder holds now: Infinity for the Bank, null when it can't take part in a Transfer
 * (a Player who Left or was Removed, or a Pot that isn't in the Room).
 */
export function holderChips(h: ActivityHolder, table: Table): number | null {
  if (h.kind === "bank") return Infinity;
  if (h.kind === "pot") return table.pots.find((p) => p._id === h.potId)?.chips ?? null;
  const p = table.players.find((p) => p._id === h.playerId);
  return p && p.status === "active" ? p.chips : null;
}

function nameOf(h: ActivityHolder, table: Table): string {
  if (h.kind === "bank") return "Bank";
  if (h.kind === "pot") return table.pots.find((p) => p._id === h.potId)?.name ?? "That Pot";
  return table.players.find((p) => p._id === h.playerId)?.name ?? "That Player";
}

/** The fields of an api.chips.activity row that reversing depends on. */
export type ReversibleEntry = {
  from: ActivityHolder;
  to: ActivityHolder;
  amount: number;
  reversedById: string | null;
};

export type ReverseCheck = { canReverse: true; reason: null } | { canReverse: false; reason: string };

/**
 * Whether the Host can reverse this Transfer now. A Reversal moves the amount back from
 * `to` to `from`, so `to` must still hold it (the Bank always does), both holders must still
 * be in play, and each Transfer can be reversed only once (reverse its Reversal to redo it).
 */
export function reverseCheck(entry: ReversibleEntry, table: Table): ReverseCheck {
  if (entry.reversedById !== null) return { canReverse: false, reason: "Already reversed" };
  for (const h of [entry.from, entry.to]) {
    if (holderChips(h, table) === null) {
      return { canReverse: false, reason: `${nameOf(h, table)} is no longer in the Room` };
    }
  }
  const held = holderChips(entry.to, table)!;
  if (held < entry.amount) {
    return {
      canReverse: false,
      reason: `${nameOf(entry.to, table)} only has ${held.toLocaleString("en")}: use a Correction`,
    };
  }
  return { canReverse: true, reason: null };
}

/**
 * Activity numbers, oldest = #1, for a page of entries listed newest first. They're stable
 * while every Transfer in the Room fits in the page (api.chips.activity returns up to 200).
 */
export function activityNumbers(newestFirst: ReadonlyArray<{ _id: string }>): Map<string, number> {
  const n = newestFirst.length;
  return new Map(newestFirst.map((e, i) => [e._id, n - i]));
}

/** The sub-label under an Activity row, e.g. "Reversal of #3", or null for none. */
export function activityNote(
  entry: { kind: ActivityKind; reversesId: string | null; reversedById: string | null },
  numbers: ReadonlyMap<string, number>,
): string | null {
  const parts: string[] = [];
  if (entry.reversesId !== null) {
    const n = numbers.get(entry.reversesId);
    parts.push(n === undefined ? "Reversal of an earlier Transfer" : `Reversal of #${n}`);
  }
  if (entry.reversedById !== null) {
    const n = numbers.get(entry.reversedById);
    parts.push(n === undefined ? "Reversed" : `Reversed by #${n}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A holder as a <select> option value: "bank", "player:<id>" or "pot:<id>". */
export function holderKey(h: ActivityHolder): string {
  if (h.kind === "bank") return "bank";
  return h.kind === "player" ? `player:${h.playerId}` : `pot:${h.potId}`;
}

export function parseHolderKey(key: string): ActivityHolder | null {
  if (key === "bank") return { kind: "bank" };
  const colon = key.indexOf(":");
  if (colon < 0) return null;
  const kind = key.slice(0, colon);
  const id = key.slice(colon + 1);
  if (id === "") return null;
  if (kind === "player") return { kind: "player", playerId: id };
  if (kind === "pot") return { kind: "pot", potId: id };
  return null;
}

/** Add (or with a negative step, take away) a chip button's value, kept within 0..max. */
export function stepAmount(amount: number, step: number, max: number): number {
  return Math.max(0, Math.min(max, amount + step));
}

/** What the Host typed in an amount field: digits only, capped at max; anything else is 0. */
export function parseAmount(text: string, max: number): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? Math.min(n, max) : Math.min(Number.MAX_SAFE_INTEGER, max);
}
