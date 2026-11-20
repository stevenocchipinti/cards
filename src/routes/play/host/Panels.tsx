import { useMutation } from "convex/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ActivityHolder } from "../../../lib/activityText.ts";
import { getDeviceId } from "../../../lib/device.ts";
import { holderChips } from "../../../lib/hostTray.ts";
import type { RoomView } from "../../room/types.ts";
import type { TargetRef } from "../targets.ts";
import { AmountInput } from "./AmountInput.tsx";
import { HolderSelect } from "./HolderSelect.tsx";
import { useRun } from "./useRun.ts";

/** What every tray panel gets: the Room, the tray's selected Target, and how to finish. */
export type PanelProps = {
  view: RoomView;
  selected: TargetRef | null;
  /** Back to the tray's menu, saying what was done. */
  onDone: (message: string) => void;
  onBack: () => void;
};

function holderName(view: RoomView, h: ActivityHolder | null): string {
  if (!h) return "";
  if (h.kind === "bank") return "the Bank";
  if (h.kind === "pot") return view.pots.find((p) => p._id === h.potId)?.name ?? "the Pot";
  return view.players.find((p) => p._id === h.playerId)?.name ?? "them";
}

const fmt = (n: number) => n.toLocaleString("en");

/** Holders from the lib's string ids back to Convex ids, for the mutations. */
const asTarget = (h: ActivityHolder) => h as TargetRef;
const asHolder = (h: ActivityHolder) => h as TargetRef | { kind: "bank" };

/** A tray panel: a title, its fields, one submit button, and Back. */
function Panel({
  title,
  children,
  submitLabel,
  canSubmit,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  title: string;
  children: ReactNode;
  submitLabel: string;
  canSubmit: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit && !busy) onSubmit();
  }
  return (
    <form className="tray__panel" onSubmit={submit}>
      <h3 className="tray__panel-title">{title}</h3>
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--block" disabled={!canSubmit || busy}>
        {busy ? "Working…" : submitLabel}
      </button>
      <button type="button" className="btn btn--wood btn--small btn--block" disabled={busy} onClick={onBack}>
        Back
      </button>
    </form>
  );
}

/** Award: some or all of a Pot to a Player. The amount starts at the whole Pot. */
export function AwardPanel({ view, selected, onDone, onBack }: PanelProps) {
  const [pot, setPot] = useState<ActivityHolder | null>(() => {
    if (selected?.kind === "pot") return selected;
    const first = view.pots.find((p) => p.chips > 0) ?? view.pots[0];
    return first ? { kind: "pot", potId: first._id } : null;
  });
  const [player, setPlayer] = useState<ActivityHolder | null>(selected?.kind === "player" ? selected : null);
  const potChips = pot ? holderChips(pot, view) ?? 0 : 0;
  const [amount, setAmount] = useState(potChips);
  const award = useMutation(api.chips.award);
  const { busy, error, run } = useRun();

  async function submit() {
    if (pot?.kind !== "pot" || player?.kind !== "player") return;
    const ok = await run(() =>
      award({
        deviceId: getDeviceId(),
        roomId: view.room._id,
        potId: pot.potId as Id<"pots">,
        playerId: player.playerId as Id<"players">,
        amount,
      }),
    );
    if (ok) onDone(`Awarded ${fmt(amount)} from ${holderName(view, pot)} to ${holderName(view, player)}`);
  }

  return (
    <Panel
      title="Award"
      submitLabel={player ? `Award ${fmt(amount)} to ${holderName(view, player)}` : "Award"}
      canSubmit={pot !== null && player !== null && amount > 0}
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      onBack={onBack}
    >
      <HolderSelect
        label="From Pot"
        view={view}
        kinds={["pot"]}
        placeholder="Pick a Pot"
        value={pot}
        onChange={(h) => {
          setPot(h);
          setAmount(h ? holderChips(h, view) ?? 0 : 0);
        }}
      />
      <HolderSelect label="To Player" view={view} kinds={["player"]} placeholder="Pick a Player" value={player} onChange={setPlayer} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} max={potChips} />
    </Panel>
  );
}

/** Give: Chips from the Bank to a Player or Pot. */
export function GivePanel({ view, selected, onDone, onBack }: PanelProps) {
  const [to, setTo] = useState<ActivityHolder | null>(selected);
  const [amount, setAmount] = useState(0);
  const give = useMutation(api.chips.bankGive);
  const { busy, error, run } = useRun();

  async function submit() {
    if (!to || to.kind === "bank") return;
    const ok = await run(() => give({ deviceId: getDeviceId(), roomId: view.room._id, to: asTarget(to), amount }));
    if (ok) onDone(`Gave ${fmt(amount)} from the Bank to ${holderName(view, to)}`);
  }

  return (
    <Panel
      title="Give from Bank"
      submitLabel={to ? `Give ${fmt(amount)} to ${holderName(view, to)}` : "Give"}
      canSubmit={to !== null && amount > 0}
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      onBack={onBack}
    >
      <HolderSelect label="To" view={view} kinds={["player", "pot"]} placeholder="Pick a Player or Pot" value={to} onChange={setTo} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} max={Infinity} />
    </Panel>
  );
}

/** Reclaim: Chips from a Player or Pot back into the Bank. */
export function ReclaimPanel({ view, selected, onDone, onBack }: PanelProps) {
  const [from, setFrom] = useState<ActivityHolder | null>(selected);
  const [amount, setAmount] = useState(0);
  const reclaim = useMutation(api.chips.bankReclaim);
  const { busy, error, run } = useRun();
  const held = from ? holderChips(from, view) ?? 0 : 0;

  async function submit() {
    if (!from || from.kind === "bank") return;
    const ok = await run(() => reclaim({ deviceId: getDeviceId(), roomId: view.room._id, from: asTarget(from), amount }));
    if (ok) onDone(`Reclaimed ${fmt(amount)} from ${holderName(view, from)} to the Bank`);
  }

  return (
    <Panel
      title="Reclaim to Bank"
      submitLabel={from ? `Reclaim ${fmt(amount)} from ${holderName(view, from)}` : "Reclaim"}
      canSubmit={from !== null && amount > 0 && amount <= held}
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      onBack={onBack}
    >
      <HolderSelect
        label="From"
        view={view}
        kinds={["player", "pot"]}
        placeholder="Pick a Player or Pot"
        value={from}
        onChange={(h) => {
          setFrom(h);
          setAmount(0);
        }}
      />
      <AmountInput label="Amount" value={amount} onChange={setAmount} max={held} />
    </Panel>
  );
}

/** Correction: any amount from any holder to any other, for what a Reversal can't fix. */
export function CorrectionPanel({ view, selected, onDone, onBack }: PanelProps) {
  const [from, setFrom] = useState<ActivityHolder | null>(selected);
  const [to, setTo] = useState<ActivityHolder | null>(null);
  const [amount, setAmount] = useState(0);
  const correct = useMutation(api.chips.correct);
  const { busy, error, run } = useRun();
  const held = from ? holderChips(from, view) ?? 0 : 0;
  const same = from !== null && to !== null && JSON.stringify(from) === JSON.stringify(to);

  async function submit() {
    if (!from || !to) return;
    const ok = await run(() =>
      correct({ deviceId: getDeviceId(), roomId: view.room._id, from: asHolder(from), to: asHolder(to), amount }),
    );
    if (ok) onDone(`Corrected: ${fmt(amount)} from ${holderName(view, from)} to ${holderName(view, to)}`);
  }

  return (
    <Panel
      title="Correction"
      submitLabel={`Move ${fmt(amount)}`}
      canSubmit={from !== null && to !== null && !same && amount > 0 && amount <= held}
      busy={busy}
      error={same ? "Pick two different holders" : error}
      onSubmit={() => void submit()}
      onBack={onBack}
    >
      <HolderSelect
        label="From"
        view={view}
        kinds={["player", "pot", "bank"]}
        placeholder="Pick a holder"
        value={from}
        onChange={(h) => {
          setFrom(h);
          setAmount(0);
        }}
      />
      <HolderSelect label="To" view={view} kinds={["player", "pot", "bank"]} placeholder="Pick a holder" value={to} onChange={setTo} />
      <AmountInput label="Amount" value={amount} onChange={setAmount} max={held} />
    </Panel>
  );
}

/** Pot names: 1 to 24 characters (convex/chips.ts › createPot). */
const POT_NAME_MAX = 24;

/** New Pot: a named pile in the middle, such as a side pot. */
export function NewPotPanel({ view, onDone, onBack }: PanelProps) {
  const [name, setName] = useState(`Side pot ${view.pots.length}`);
  const createPot = useMutation(api.chips.createPot);
  const { busy, error, run } = useRun();
  const trimmed = name.trim();

  async function submit() {
    const ok = await run(() => createPot({ deviceId: getDeviceId(), roomId: view.room._id, name: trimmed }));
    if (ok) onDone(`Added the Pot "${trimmed}"`);
  }

  return (
    <Panel
      title="New Pot"
      submitLabel="Add Pot"
      canSubmit={trimmed.length > 0}
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      onBack={onBack}
    >
      <div className="field">
        <label htmlFor="new-pot-name">Name</label>
        <input
          id="new-pot-name"
          className="input"
          value={name}
          maxLength={POT_NAME_MAX}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </Panel>
  );
}
