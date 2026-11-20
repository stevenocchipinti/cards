import { initials } from "../lib/initials.ts";

type Props = {
  name: string;
  /** The Player's colour from the server (a light colour; initials are drawn dark). */
  color: string;
  /** Diameter in px. */
  size?: number;
  /** Away (GLOSSARY.md): shown greyed out. */
  away?: boolean;
  /** A gold ring, e.g. for "you" or the current Target. */
  highlighted?: boolean;
};

/** A Player's avatar: a coloured circle with their initials. */
export function Avatar({ name, color, size = 56, away = false, highlighted = false }: Props) {
  const classes = ["avatar"];
  if (away) classes.push("avatar--away");
  if (highlighted) classes.push("avatar--highlighted");
  return (
    <span
      className={classes.join(" ")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: color }}
      title={away ? `${name} (Away)` : name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
