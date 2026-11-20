/** The list with the item at `from` moved so it ends up at index `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length) return next;
  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item as T);
  return next;
}

/**
 * Where a dragged item lands, given the pointer's position and the vertical midpoints of every
 * item (including the dragged one) in their current slots. Returns the target index.
 */
export function dropIndex(pointerY: number, midpoints: readonly number[], from: number): number {
  let before = midpoints.findIndex((mid) => pointerY < mid);
  if (before === -1) before = midpoints.length;
  // Inserting before a slot after the dragged item shifts everything up by one.
  return before > from ? before - 1 : before;
}
