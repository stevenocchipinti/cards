import { useId } from "react";
import type { ActivityHolder } from "../../../lib/activityText.ts";
import { holderKey, parseHolderKey } from "../../../lib/hostTray.ts";
import type { RoomView } from "../../room/types.ts";

type Props = {
  label: string;
  value: ActivityHolder | null;
  onChange: (h: ActivityHolder | null) => void;
  view: RoomView;
  /** Which kinds of holder to offer. */
  kinds: ReadonlyArray<"player" | "pot" | "bank">;
  /** Shown when nothing is chosen, e.g. "Pick a Player". */
  placeholder: string;
  /** Leave the Host out (e.g. for Remove and Hand over Host). */
  excludeMe?: boolean;
  disabled?: boolean;
};

/** A native picker over the Room's holders: active Players, Pots and (for the Host) the Bank. */
export function HolderSelect({ label, value, onChange, view, kinds, placeholder, excludeMe = false, disabled = false }: Props) {
  const id = useId();
  const players = view.players.filter((p) => p.status === "active" && !(excludeMe && p._id === view.me._id));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input select"
        value={value ? holderKey(value) : ""}
        disabled={disabled}
        onChange={(e) => onChange(parseHolderKey(e.target.value))}
      >
        <option value="">{placeholder}</option>
        {kinds.includes("player") && players.length > 0 && (
          <optgroup label="Players">
            {players.map((p) => (
              <option key={p._id} value={holderKey({ kind: "player", playerId: p._id })}>
                {p._id === view.me._id ? `${p.name} (you)` : p.name} · {p.chips.toLocaleString("en")}
              </option>
            ))}
          </optgroup>
        )}
        {kinds.includes("pot") && view.pots.length > 0 && (
          <optgroup label="Pots">
            {view.pots.map((p) => (
              <option key={p._id} value={holderKey({ kind: "pot", potId: p._id })}>
                {p.name} · {p.chips.toLocaleString("en")}
              </option>
            ))}
          </optgroup>
        )}
        {kinds.includes("bank") && <option value="bank">Bank (unlimited)</option>}
      </select>
    </div>
  );
}
