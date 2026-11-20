import { useRef, useState, type PointerEvent } from "react";
import { dragAmount, dragSteps, TAP_SLOP_PX } from "../../lib/chipDrag.ts";
import { addToAmount, cappedAmount, isSwipeUp, SWIPE_UP_PX, type SendBarState } from "../../lib/sendBar.ts";

/** The chip buttons, coloured like real chips. */
const CHIP_BUTTONS = [
  { value: 1, className: "chip-btn--1" },
  { value: 5, className: "chip-btn--5" },
  { value: 25, className: "chip-btn--25" },
  { value: 100, className: "chip-btn--100" },
] as const;

type Props = {
  myChips: number;
  amount: number;
  onAmount: (amount: number) => void;
  /** Shown beside the amount, e.g. "Ann". */
  targetName: string | null;
  bar: SendBarState;
  onSend: () => void;
  error: string | null;
};

/** My rail along the bottom: my Chips, the amount, the chip buttons and the send bar. */
export function Rail({ myChips, amount, onAmount, targetName, bar, onSend, error }: Props) {
  const shown = cappedAmount(amount, myChips);
  const [adjusting, setAdjusting] = useState<number | null>(null);
  return (
    <section className="rail" aria-label="Your Chips">
      <div className="rail__mine">
        <span className="rail__label">YOUR CHIPS</span>
        <span className="rail__mine-value">{myChips.toLocaleString("en")}</span>
      </div>
      <div className="rail__amount">
        <span className="rail__amount-value" aria-label={`Amount: ${shown}`}>
          {shown.toLocaleString("en")}
        </span>
        {adjusting !== null ? (
          <span className="rail__amount-to rail__amount-adjust">↑ +{adjusting} · ↓ −{adjusting}</span>
        ) : (
          targetName && <span className="rail__amount-to">→ {targetName}</span>
        )}
      </div>
      <div className="rail__chips">
        {CHIP_BUTTONS.map((c) => (
          <ChipButton
            key={c.value}
            value={c.value}
            className={c.className}
            shown={shown}
            myChips={myChips}
            onAmount={onAmount}
            onAdjusting={(on) => setAdjusting(on ? c.value : null)}
          />
        ))}
      </div>
      <div className="rail__row">
        <button type="button" className="pill-btn" disabled={myChips <= 0} onClick={() => onAmount(myChips)}>
          All
        </button>
        <button type="button" className="pill-btn" disabled={shown === 0} onClick={() => onAmount(0)}>
          Clear
        </button>
      </div>
      <SendBar bar={bar} onSend={onSend} />
      {error && (
        <p className="rail__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * A haptic tick. Browsers only allow vibration after the page has had a "user activation",
 * which on touch screens happens when a finger lifts (pointerup/touchend), not when it lands.
 * So during the very first drag after a page load there's no vibration until the finger
 * lifts; from then on it works. That's a browser rule, not something we can get around.
 * (iOS Safari doesn't support vibration at all.)
 */
function buzz(ms: number) {
  navigator.vibrate?.(ms);
}

/**
 * A chip button. A tap adds its value once. Swiping on it changes the amount directly:
 * each STEP_PX up adds the value and each step down takes it away, with a small vibration
 * per step and a longer one at 0 or at my Chips. Keyboard activation adds once.
 */
function ChipButton(props: {
  value: number;
  className: string;
  shown: number;
  myChips: number;
  onAmount: (amount: number) => void;
  onAdjusting: (on: boolean) => void;
}) {
  const { value, className, shown, myChips, onAmount, onAdjusting } = props;
  const press = useRef<{ startY: number; base: number; steps: number; dragging: boolean; limitBuzzed: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  function end() {
    press.current = null;
    setDragging(false);
    onAdjusting(false);
  }

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (myChips <= 0 || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { startY: e.clientY, base: shown, steps: 0, dragging: false, limitBuzzed: false };
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current;
    if (!p) return;
    if (!p.dragging) {
      if (Math.abs(e.clientY - p.startY) <= TAP_SLOP_PX) return;
      p.dragging = true;
      setDragging(true);
      onAdjusting(true);
    }
    const steps = dragSteps(p.startY, e.clientY);
    if (steps === p.steps) return;
    const { amount, atLimit } = dragAmount(p.base, steps, value, myChips);
    const prev = dragAmount(p.base, p.steps, value, myChips).amount;
    p.steps = steps;
    if (amount !== prev) {
      onAmount(amount);
      p.limitBuzzed = false;
      buzz(atLimit ? 40 : 8);
    } else if (atLimit && !p.limitBuzzed) {
      p.limitBuzzed = true;
      buzz(40);
    }
  }

  function up() {
    const p = press.current;
    // Barely moved: a plain tap.
    if (p && !p.dragging) onAmount(addToAmount(shown, value, myChips));
    end();
  }

  return (
    <button
      type="button"
      className={`chip-btn ${className}${dragging ? " chip-btn--dragging" : ""}`}
      aria-label={`Add ${value}. Swipe up or down on it to change by ${value}`}
      disabled={myChips <= 0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Pointer presses are handled above; this is keyboard activation.
        if (e.detail === 0) onAmount(addToAmount(shown, value, myChips));
      }}
    >
      <span className="chip-btn__face">+{value}</span>
    </button>
  );
}

/**
 * Swipe up to send (docs/PRD.md › Play screen). A drag of more than SWIPE_UP_PX upward
 * sends; a plain tap doesn't, so a stray touch can't move Chips. Keyboard activation
 * (Enter or Space, which fire a click with detail 0) also sends.
 */
function SendBar({ bar, onSend }: { bar: SendBarState; onSend: () => void }) {
  const startY = useRef<number | null>(null);
  const [lift, setLift] = useState(0);

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (!bar.canSend) return;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    setLift(Math.max(0, Math.min(SWIPE_UP_PX * 1.5, startY.current - e.clientY)));
  }
  function up(e: PointerEvent<HTMLButtonElement>) {
    const from = startY.current;
    startY.current = null;
    setLift(0);
    if (from !== null && isSwipeUp(from, e.clientY)) onSend();
  }
  function cancel() {
    startY.current = null;
    setLift(0);
  }

  return (
    <button
      type="button"
      className={`send-bar${lift > SWIPE_UP_PX ? " send-bar--armed" : ""}`}
      disabled={!bar.canSend}
      aria-label={bar.canSend ? `${bar.label.replace("Swipe up: ", "Send ")}. Swipe up, or press Enter` : bar.label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={(e) => {
        if (e.detail === 0) onSend();
      }}
    >
      <span className="send-bar__content" style={{ transform: `translateY(${-lift}px)` }}>
        <svg aria-hidden="true" width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10 L9 3 L16 10" />
        </svg>
        <span className="send-bar__label">{bar.label}</span>
      </span>
    </button>
  );
}
