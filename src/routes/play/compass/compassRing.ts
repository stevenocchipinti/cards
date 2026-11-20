// Compass mode's ring (docs/PRD.md › Play screen › Compass mode), as a RingLayout for the
// Play screen. Pure: the heading and my Bearings go in, avatar places and the aimed Target
// come out. The geometry itself is compassLayout in src/lib/ringLayout.ts.

import type { Id } from "../../../../convex/_generated/dataModel";
import { relativeAngle } from "../../../lib/heading.ts";
import { AIM_DEG, compassLayout, tapLayout } from "../../../lib/ringLayout.ts";
import type { PublicPlayer } from "../../room/types.ts";
import type { PlaySlot, RingLayout, TargetRef } from "../targets.ts";

/** One of my Bearings, as api.bearings.myBearings returns it. */
export type Bearing = { target: TargetRef; heading: number };

export function targetKey(t: TargetRef): string {
  return t.kind === "player" ? `player:${t.playerId}` : `pot:${t.potId}`;
}

/** My Bearing to each Target, by targetKey. */
export function bearingMap(bearings: readonly Bearing[]): Map<string, number> {
  return new Map(bearings.map((b) => [targetKey(b.target), b.heading]));
}

/**
 * The compass ring. Players go through compassLayout; Players with no Bearing keep their
 * tap-mode slot and are flagged `unplaced` (drawn with a dashed outline). Pots stay on the
 * felt, but one I've locked a Bearing to can still be aimed at. Whichever Target, Player or
 * Pot, is nearest the heading (within AIM_DEG) is the aimed one.
 *
 * With no heading yet (the compass is starting up) everyone sits in tap mode and nothing is
 * aimed, but unplaced Players are still flagged so it's clear who needs a Bearing.
 */
export function compassRingLayout({
  bearings,
  heading,
  potIds,
}: {
  bearings: ReadonlyMap<string, number>;
  heading: number | null;
  potIds: readonly Id<"pots">[];
}): RingLayout {
  return (others: PublicPlayer[], width: number) => {
    const bearingOf = (p: PublicPlayer) => bearings.get(targetKey({ kind: "player", playerId: p._id })) ?? null;

    if (heading == null) {
      const slots: PlaySlot[] = tapLayout(others, width).map((s) => ({ ...s, unplaced: bearingOf(s.target) == null }));
      return { slots, aimed: null };
    }

    const r = compassLayout(
      others.map((p) => ({ id: p._id as string, kind: "player" as const, bearing: bearingOf(p), player: p })),
      heading,
      width,
    );
    const slots: PlaySlot[] = r.slots.map((s) => ({
      target: s.target.player,
      x: s.x,
      y: s.y,
      scale: s.scale,
      edge: s.edge,
      unplaced: s.unplaced,
    }));

    let aimed: TargetRef | null = null;
    let best = Infinity;
    const aimedSlot = r.slots.find((s) => s.aimed);
    if (aimedSlot) {
      aimed = { kind: "player", playerId: aimedSlot.target.player._id };
      best = Math.abs(aimedSlot.relative!);
    }
    for (const potId of potIds) {
      const b = bearings.get(targetKey({ kind: "pot", potId }));
      if (b == null) continue;
      const d = Math.abs(relativeAngle(b, heading));
      if (d <= AIM_DEG && d < best) {
        aimed = { kind: "pot", potId };
        best = d;
      }
    }
    return { slots, aimed };
  };
}
