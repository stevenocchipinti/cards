// Swipe up or down on a chip button to step the amount by that chip's value.
// A tap still adds the chip once. Pure, so it's tested.

/** Movement under this still counts as a tap. */
export const TAP_SLOP_PX = 10;
/** Vertical distance per step while dragging. */
export const STEP_PX = 24;

/** Whole steps dragged from startY to y. Up is positive (screen y grows downward). */
export function dragSteps(startY: number, y: number, stepPx = STEP_PX): number {
  return Math.trunc((startY - y) / stepPx) || 0; // no -0
}

/**
 * The amount after dragging `steps` of `value` from `base`, kept within 0 and my Chips.
 * `atLimit` is true when the drag is trying to go past either end.
 */
export function dragAmount(
  base: number,
  steps: number,
  value: number,
  myChips: number,
): { amount: number; atLimit: boolean } {
  const wanted = base + steps * value;
  const amount = Math.max(0, Math.min(myChips, wanted));
  return { amount, atLimit: wanted !== amount || amount === 0 || amount === myChips };
}
