import { useId, useState } from "react";
import { parseAmount, stepAmount } from "../../../lib/hostTray.ts";

/** The same chips as the rail, so amounts feel the same in the tray. */
const CHIPS = [
  { value: 1, className: "" },
  { value: 5, className: "chip-btn--5" },
  { value: 25, className: "chip-btn--25" },
  { value: 100, className: "chip-btn--100" },
] as const;

type Props = {
  label: string;
  value: number;
  onChange: (amount: number) => void;
  /** The most it can be: what the source holds, or Infinity for the Bank. */
  max: number;
  disabled?: boolean;
};

/**
 * A typed amount with the rail's chip buttons. The ± switch turns the chips from adding to
 * taking away, so the Host can trim a default (such as a whole Pot) without retyping it.
 */
export function AmountInput({ label, value, onChange, max, disabled = false }: Props) {
  const id = useId();
  const [minus, setMinus] = useState(false);
  const sign = minus ? -1 : 1;
  return (
    <div className="amount-input">
      <div className="amount-input__top">
        <label htmlFor={id}>{label}</label>
        {Number.isFinite(max) && <span className="amount-input__max">Max {max.toLocaleString("en")}</span>}
      </div>
      <div className="amount-input__row">
        <input
          id={id}
          className="input input--number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value === 0 ? "" : value.toLocaleString("en")}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => onChange(parseAmount(e.target.value, max))}
        />
        <button
          type="button"
          className="pill-btn"
          aria-pressed={minus}
          aria-label="Take away"
          disabled={disabled}
          onClick={() => setMinus(!minus)}
        >
          {minus ? "−" : "+"}
        </button>
      </div>
      <div className="amount-input__chips">
        {CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`chip-btn chip-btn--small ${c.className}`}
            aria-label={`${minus ? "Take away" : "Add"} ${c.value}`}
            disabled={disabled || (minus ? value <= 0 : value >= max)}
            onClick={() => onChange(stepAmount(value, sign * c.value, max))}
          >
            <span className="chip-btn__face">
              {minus ? "−" : "+"}
              {c.value}
            </span>
          </button>
        ))}
      </div>
      <div className="amount-input__row amount-input__row--end">
        {Number.isFinite(max) && (
          <button type="button" className="pill-btn" disabled={disabled || max <= 0} onClick={() => onChange(max)}>
            All
          </button>
        )}
        <button type="button" className="pill-btn" disabled={disabled || value === 0} onClick={() => onChange(0)}>
          Clear
        </button>
      </div>
    </div>
  );
}
