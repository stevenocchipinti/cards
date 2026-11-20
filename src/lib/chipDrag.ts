// Hold a chip button, then drag up or down to step the amount by that chip's value.
// A quick tap still adds the chip once. Pure, so it's tested.

/** How long a press must last before it becomes a drag. */
export const HOLD_MS = 300;
/** Movement before HOLD_MS that cancels the hold (the finger was scrolling or slipping). */
export const HOLD_SLOP_PX = 10;
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
