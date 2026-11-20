// Which mode the Play screen is in (docs/PRD.md › Play screen). Pure, so the fallback
// rules are tested; useCompassMode wires it to localStorage and the heading.

import type { HeadingStatus } from "../../../lib/useHeading.ts";

export type Mode = "compass" | "tap";

export const MODE_KEY = "cards.mode";

export function parseMode(stored: string | null): Mode | null {
  return stored === "compass" || stored === "tap" ? stored : null;
}

export type ResolvedMode = {
  /** What the toggle shows: the Player's choice, or the default if they haven't made one. */
  chosen: Mode;
  /** Whether the ring follows the compass. False means tap mode, chosen or fallen back to. */
  live: boolean;
  /** Why compass mode isn't working (or what to do to turn it on), or null. */
  note: string | null;
};

/**
 * The Player's stored choice wins. With none, it's compass if the device seems to have one.
 * Choosing compass where it can't work leaves the ring in tap mode, with a short reason.
 */
export function resolveMode(stored: Mode | null, status: HeadingStatus): ResolvedMode {
  const chosen = stored ?? (status === "unsupported" ? "tap" : "compass");
  if (chosen === "tap") return { chosen, live: false, note: null };
  switch (status) {
    case "active":
    case "starting":
      return { chosen, live: true, note: null };
    case "needs-permission":
      return { chosen, live: false, note: "Tap Compass to allow motion access" };
    case "unsupported":
      return { chosen, live: false, note: "No compass on this device, so tap a Target instead" };
    case "denied":
      return { chosen, live: false, note: "Motion access is off, so tap a Target instead" };
    case "no-data":
      return { chosen, live: false, note: "No compass reading, so tap a Target instead" };
  }
}
