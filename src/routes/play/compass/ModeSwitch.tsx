import type { Mode } from "./mode.ts";

type Props = { chosen: Mode; onChoose: (mode: Mode) => void };

/**
 * The top bar's compass toggle: one icon button, lit gold when compass mode is on and
 * dim with a slash through it when off (tap mode).
 */
export function ModeSwitch({ chosen, onChoose }: Props) {
  const on = chosen === "compass";
  return (
    <button
      type="button"
      className="mode-toggle"
      aria-pressed={on}
      aria-label="Compass mode"
      title={on ? "Compass on: aim to pick a Target" : "Compass off: tap a Target"}
      onClick={() => onChoose(on ? "tap" : "compass")}
    >
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M15.5 8.5 L13.4 13.4 L8.5 15.5 L10.6 10.6 Z" fill="currentColor" />
        {!on && <path d="M4 4 L20 20" strokeWidth="2.5" />}
      </svg>
    </button>
  );
}
