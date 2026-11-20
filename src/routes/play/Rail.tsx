import { useRef, useState, type PointerEvent } from "react";
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
        {targetName && <span className="rail__amount-to">→ {targetName}</span>}
      </div>
      <div className="rail__chips">
        {CHIP_BUTTONS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`chip-btn ${c.className}`}
            aria-label={`Add ${c.value}`}
            disabled={myChips <= 0}
            onClick={() => onAmount(addToAmount(shown, c.value, myChips))}
          >
            <span className="chip-btn__face">+{c.value}</span>
          </button>
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
