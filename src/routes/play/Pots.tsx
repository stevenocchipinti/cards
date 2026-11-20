import type { RoomView } from "../room/types.ts";
import { useHold } from "./compass/useHold.ts";

type Pot = RoomView["pots"][number];

type Props = {
  view: RoomView;
  isTarget: (pot: Pot) => boolean;
  onPick: (pot: Pot) => void;
  /** Compass mode: a long-press locks a Bearing to this Pot. */
  onHold?: (pot: Pot) => void;
};

/** The Pots in the middle of the felt, each with its total and its Contributions underneath. */
export function Pots({ view, isTarget, onPick, onHold }: Props) {
  const hold = useHold(onHold);
  const names = new Map(view.players.map((p) => [p._id as string, p.name]));
  return (
    <ul className={`pots${view.pots.length > 2 ? " pots--many" : ""}`} aria-label="Pots">
      {view.pots.map((pot) => {
        const selected = isTarget(pot);
        const total = pot.chips.toLocaleString("en");
        const contributions = Object.entries(pot.contributions)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `${id === view.me._id ? "You" : (names.get(id) ?? "Someone")} ${n.toLocaleString("en")}`)
          .join(" · ");
        return (
          <li key={pot._id} className="pot">
            <button
              type="button"
              className={`pot__chip${selected ? " pot__chip--selected" : ""}`}
              aria-pressed={selected}
              aria-label={`${pot.name}, ${total} Chips`}
              {...hold.bind(pot)}
              onClick={() => {
                if (!hold.wasHeld()) onPick(pot);
              }}
            >
              <span className="pot__name">{pot.name}</span>
              <span className="pot__total">{total}</span>
            </button>
            <span className="pot__contributions">{contributions || `${pot.name} is empty`}</span>
          </li>
        );
      })}
    </ul>
  );
}
