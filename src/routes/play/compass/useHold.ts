import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** How long a press has to last to count as a hold (lock a Bearing). */
export const HOLD_MS = 500;
/** A finger that slides further than this (px) is scrolling or dragging, not holding. */
const SLOP_PX = 10;

/**
 * Long-press for buttons that also take a normal tap. `bind(item)` gives the press handlers
 * for one button, and the button's onClick should start with `if (wasHeld()) return`, so
 * the click that follows letting go of a hold doesn't also select the Target.
 *
 * The context menu (a long-press on Android, or the keyboard's menu key) also counts as a
 * hold, so the gesture doesn't open a menu and keyboard users have a way in. With no
 * `onHold`, `bind` gives nothing and buttons behave exactly as before.
 */
export function useHold<T>(onHold: ((item: T) => void) | undefined) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  };
  useEffect(() => cancel, []);

  function bind(item: T) {
    if (!onHold) return {};
    const fire = () => {
      cancel();
      held.current = true;
      onHold(item);
    };
    return {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        cancel();
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(fire, HOLD_MS);
      },
      onPointerMove: (e: PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onKeyDown: () => {
        held.current = false;
      },
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        if (!held.current) fire();
      },
    };
  }

  /** True once, straight after a hold: the caller then skips its click. */
  function wasHeld() {
    const h = held.current;
    held.current = false;
    return h;
  }

  return { bind, wasHeld };
}
