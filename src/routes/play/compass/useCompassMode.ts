import { useState } from "react";
import { useHeading } from "../../../lib/useHeading.ts";
import { MODE_KEY, parseMode, resolveMode, type Mode } from "./mode.ts";

function readStored(): Mode | null {
  try {
    return parseMode(localStorage.getItem(MODE_KEY));
  } catch {
    return null; // storage blocked: fall back to the default each visit
  }
}

/**
 * The Play screen's mode: the Player's stored choice (localStorage `cards.mode`), the live
 * heading, and `choose`, which the compass toggle calls from its click handler. That
 * click is the user gesture iOS needs before it will hand over motion data.
 */
export function useCompassMode() {
  const [stored, setStored] = useState<Mode | null>(readStored);
  // Listen unless tap mode was chosen outright; with no compass the hook simply reports so.
  const h = useHeading({ enabled: stored !== "tap" });
  const resolved = resolveMode(stored, h.status);

  function choose(mode: Mode) {
    // First, while still inside the tap: iOS only shows its prompt from a user gesture.
    if (mode === "compass" && (h.status === "needs-permission" || h.status === "denied")) void h.requestPermission();
    setStored(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not remembered after a reload, but it still applies now.
    }
  }

  return { ...resolved, heading: resolved.live ? h.heading : null, choose };
}
