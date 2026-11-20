// The rail's amount and send bar rules (docs/PRD.md › Play screen). Pure, so they're tested.

/** Add a chip button's value, never past what I hold. */
export function addToAmount(amount: number, add: number, myChips: number): number {
  return Math.max(0, Math.min(myChips, amount + add));
}

/** The amount actually on offer: my Chips can drop under it (e.g. the Host reclaims some). */
export function cappedAmount(amount: number, myChips: number): number {
  return Math.max(0, Math.min(amount, myChips));
}

export type SendBarState = { canSend: boolean; label: string };

/**
 * Whether the send bar is live, and what it says. `targetName` is null with no Target.
 * The order of hints follows the PRD's flow: pick a Target, pick an amount, swipe up.
 */
export function sendBarState(opts: {
  targetName: string | null;
  amount: number;
  myChips: number;
  busy?: boolean;
  /** What to say with no Target; compass mode can say "Aim or tap a Target". */
  noTargetHint?: string;
}): SendBarState {
  const { targetName, myChips, busy = false } = opts;
  const amount = cappedAmount(opts.amount, myChips);
  if (myChips <= 0) return { canSend: false, label: "No Chips to send" };
  if (targetName === null) return { canSend: false, label: opts.noTargetHint ?? "Tap a Target" };
  if (amount <= 0) return { canSend: false, label: "Pick an amount" };
  if (busy) return { canSend: false, label: "Sending…" };
  return { canSend: true, label: `Swipe up: ${amount.toLocaleString("en")} to ${targetName}` };
}

/** How far up (px) a drag on the send bar must go to count as a swipe. */
export const SWIPE_UP_PX = 30;

/** A drag from startY to endY (screen y grows downward) is a swipe up. */
export function isSwipeUp(startY: number, endY: number): boolean {
  return startY - endY > SWIPE_UP_PX;
}
