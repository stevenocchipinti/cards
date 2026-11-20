// Where avatars sit on the Play screen's ring (see docs/PRD.md › Play screen and the mockup).
// Pure: callers pass the screen width and get back avatar centres in CSS px plus a scale.
//
// Geometry (from the mockup at its 390px design width): a big faint circle of radius 450,
// centred horizontally and 530px down, of which only the top arc shows. Avatars sit with
// their centre on that arc. Vertical numbers are fixed px; horizontal ones scale with width.

import { relativeAngle } from "./heading";

export const DESIGN_WIDTH = 390;
export const RING_CENTER_Y = 530;
export const RING_RADIUS = 450;

/** Tap mode: the outermost avatars sit this fraction of the width in from each side. */
export const TAP_EDGE_FRACTION = 0.115;

/** Compass mode shows ±HALF_VIEW_DEG either side of the heading (about 60° in all). */
export const HALF_VIEW_DEG = 30;
/** A Target within this many degrees of the heading is the one being aimed at. */
export const AIM_DEG = 10;
/** At ±HALF_VIEW_DEG an avatar is this fraction of the width from the centre (5px/° at 390). */
const VIEW_SPAN_FRACTION = 0.385;
/** Avatar scale dead ahead; it falls smoothly to 1 at the edge of the view. */
export const CENTER_SCALE = 1.35;
/** Out-of-view Targets are pinned this small... */
export const PINNED_SCALE = 0.72;
/** ...this fraction of the width in from the side... */
const PINNED_EDGE_FRACTION = 0.07;
/** ...stacked this many px apart, closest to the view first... */
export const PINNED_STEP_PX = 50;
/**
 * ...but a stack never reaches more than this far below its first avatar: a deeper one
 * squeezes its step instead, so a crowd off to one side can't push the felt (and the Pots
 * under the ring) down the screen. Two full steps fit, so up to three avatars aren't squeezed.
 */
export const PINNED_MAX_DEPTH_PX = 2 * PINNED_STEP_PX;

/** y of the visible arc at x, for a screen `width` wide. Clamped to the circle's extent. */
export function arcTop(x: number, width: number = DESIGN_WIDTH): number {
  const dx = Math.min(Math.abs(x - width / 2), RING_RADIUS);
  return RING_CENTER_Y - Math.sqrt(RING_RADIUS * RING_RADIUS - dx * dx);
}

/**
 * The other Players in the order they appear on my ring, left to right.
 *
 * Seating Order is clockwise viewed from above. Sitting at the table facing the centre,
 * the next Player clockwise from me is on my LEFT (picture yourself at the bottom of a
 * clock face: clockwise from 6 goes up through 9, which is your left). So the left edge
 * is the next Player clockwise after me and the right edge is the one before me.
 *
 * If `meId` isn't seated (e.g. a moment before my join lands), the order is shown as is.
 */
export function rotateSeating<T>(seatingOrder: readonly T[], meId: T): T[] {
  const i = seatingOrder.indexOf(meId);
  if (i < 0) return [...seatingOrder];
  return [...seatingOrder.slice(i + 1), ...seatingOrder.slice(0, i)];
}

export type RingSlot<T> = { target: T; x: number; y: number; scale: number };

/** Tap mode: neighbours closer than this (px) would overlap, so the ring gets crowded. */
export const TAP_MIN_SPACING_PX = 76;
/** Crowded avatars shrink to no less than this... */
export const TAP_MIN_SCALE = 0.6;
/** ...and every second one drops this far (px at scale 1) below the arc, so they interleave. */
export const TAP_STAGGER_PX = 64;

/**
 * Tap mode: `others` (already in ring order, see rotateSeating) evenly spaced along the
 * arc from the left edge to the right edge. A single other Player sits dead centre.
 *
 * A crowded table (neighbours under TAP_MIN_SPACING_PX apart) staggers every second avatar
 * below the arc, which doubles the room each has, and shrinks them if that's still too tight.
 */
export function tapLayout<T>(others: readonly T[], width: number = DESIGN_WIDTH): RingSlot<T>[] {
  const n = others.length;
  const left = width * TAP_EDGE_FRACTION;
  const span = width - 2 * left;
  const spacing = n > 1 ? span / (n - 1) : Infinity;
  const crowded = spacing < TAP_MIN_SPACING_PX;
  const scale = crowded ? Math.max(TAP_MIN_SCALE, Math.min(1, (2 * spacing) / TAP_MIN_SPACING_PX)) : 1;
  return others.map((target, i) => {
    const x = n === 1 ? width / 2 : left + (span * i) / (n - 1);
    const drop = crowded && i % 2 === 1 ? TAP_STAGGER_PX * scale : 0;
    return { target, x, y: arcTop(x, width) + drop, scale };
  });
}

export type CompassTarget = {
  id: string;
  /** Pots are Targets too; callers usually filter them out and draw them in the middle. */
  kind: "player" | "pot";
  /** My locked Bearing to this Target (compass degrees), if I've set one. */
  bearing?: number | null;
};

export type CompassSlot<T> = RingSlot<T> & {
  /** Pinned to a side because it's outside the view; draw ‹ or › beside it. */
  edge: "left" | "right" | null;
  /** The Target I'm pointing at: draw it glowing. At most one. */
  aimed: boolean;
  /** No Bearing yet, so it sits in its tap-mode slot. */
  unplaced: boolean;
  /** Bearing relative to my heading in (-180, 180], positive to the right; null if unplaced. */
  relative: number | null;
};

/**
 * Compass mode. `targets` are in ring order (their tap-mode order), `heading` is where my
 * phone points. Returns one slot per target, in the same order, plus the aimed Target.
 */
export function compassLayout<T extends CompassTarget>(
  targets: readonly T[],
  heading: number,
  width: number = DESIGN_WIDTH,
): { slots: CompassSlot<T>[]; aimed: T | null } {
  const tap = tapLayout(targets, width);
  const pxPerDeg = (width * VIEW_SPAN_FRACTION) / HALF_VIEW_DEG;

  const slots: CompassSlot<T>[] = targets.map((target, i) => {
    if (target.bearing == null) {
      return { ...tap[i]!, edge: null, aimed: false, unplaced: true, relative: null };
    }
    const d = relativeAngle(target.bearing, heading);
    if (Math.abs(d) <= HALF_VIEW_DEG) {
      const x = width / 2 + d * pxPerDeg;
      const c = Math.cos(((d / HALF_VIEW_DEG) * Math.PI) / 2);
      const scale = 1 + (CENTER_SCALE - 1) * c * c;
      return { target, x, y: arcTop(x, width), scale, edge: null, aimed: false, unplaced: false, relative: d };
    }
    // Out of view: y is filled in below once we know the stacking order.
    const edge = d < 0 ? "left" : "right";
    const x = edge === "left" ? width * PINNED_EDGE_FRACTION : width * (1 - PINNED_EDGE_FRACTION);
    return { target, x, y: 0, scale: PINNED_SCALE, edge, aimed: false, unplaced: false, relative: d };
  });

  for (const edge of ["left", "right"] as const) {
    const stack = slots.filter((s) => s.edge === edge).sort((a, b) => Math.abs(a.relative!) - Math.abs(b.relative!));
    const step = stack.length > 1 ? Math.min(PINNED_STEP_PX, PINNED_MAX_DEPTH_PX / (stack.length - 1)) : 0;
    stack.forEach((s, k) => {
      s.y = arcTop(s.x, width) + k * step;
    });
  }

  let aimedSlot: CompassSlot<T> | null = null;
  for (const s of slots) {
    if (s.relative == null || Math.abs(s.relative) > AIM_DEG) continue;
    if (!aimedSlot || Math.abs(s.relative) < Math.abs(aimedSlot.relative!)) aimedSlot = s;
  }
  if (aimedSlot) aimedSlot.aimed = true;

  return { slots, aimed: aimedSlot?.target ?? null };
}
