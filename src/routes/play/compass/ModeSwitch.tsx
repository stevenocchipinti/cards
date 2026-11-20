import type { Mode } from "./mode.ts";

type Props = { chosen: Mode; onChoose: (mode: Mode) => void };

/** The top bar's Compass/Tap switch. */
export function ModeSwitch({ chosen, onChoose }: Props) {
  return (
    <div className="mode-switch" role="group" aria-label="Mode">
      {(["compass", "tap"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className="mode-switch__btn"
          aria-pressed={chosen === mode}
          onClick={() => onChoose(mode)}
        >
          {mode === "compass" ? "Compass" : "Tap"}
        </button>
      ))}
    </div>
  );
}
