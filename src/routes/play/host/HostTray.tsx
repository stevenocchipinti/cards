import { useMutation } from "convex/react";
import { useEffect, useId, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { getDeviceId } from "../../../lib/device.ts";
import { holderChips } from "../../../lib/hostTray.ts";
import type { HostTrayContext } from "../PlayScreen.tsx";
import { targetName, type TargetRef } from "../targets.ts";
import { ActivityLog } from "./ActivityLog.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { HolderSelect } from "./HolderSelect.tsx";
import { AwardPanel, CorrectionPanel, GivePanel, NewPotPanel, ReclaimPanel, type PanelProps } from "./Panels.tsx";
import { useModal } from "./useModal.ts";
import { useRun } from "./useRun.ts";

const PANELS = {
  award: AwardPanel,
  give: GivePanel,
  reclaim: ReclaimPanel,
  correct: CorrectionPanel,
  newPot: NewPotPanel,
} satisfies Record<string, (p: PanelProps) => unknown>;
type PanelName = keyof typeof PANELS;
type Confirm = "remove" | "handOver" | "end";

/**
 * The dealer tray (docs/PRD.md › Host powers): the Bank, Awards, Corrections, Pots, Removing
 * a Player, handing over Host, Ending the Room, and the Activity log. Only the Host sees it,
 * and the Bank lives only here. It starts from the Target tapped on the Play screen, and the
 * Host can pick another without closing it.
 */
export function HostTray({ view, target, clearTarget, close }: HostTrayContext) {
  const ref = useModal();
  const titleId = useId();
  const [selected, setSelected] = useState<TargetRef | null>(target);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const removePlayer = useMutation(api.rooms.removePlayer);
  const handOverHost = useMutation(api.rooms.handOverHost);
  const endRoom = useMutation(api.rooms.endRoom);
  const confirmRun = useRun();

  // Hosting moved on (handed over elsewhere): the tray is no longer ours to show.
  useEffect(() => {
    if (!view.isHost) close();
  }, [view.isHost, close]);

  // A Target that has Left or been Removed no longer counts.
  const sel = selected && targetName(view, selected) !== null ? selected : null;
  const selName = targetName(view, sel);
  const selChips = sel ? holderChips(sel, view) ?? 0 : 0;
  const otherPlayer = sel?.kind === "player" && sel.playerId !== view.me._id ? sel : null;
  const potsWithChips = view.pots.filter((p) => p.chips > 0).length;
  const roomArgs = { deviceId: getDeviceId(), roomId: view.room._id };

  function open(p: PanelName) {
    setDone(null);
    setPanel(p);
  }

  async function doConfirm() {
    if (confirm === "end") {
      await confirmRun.run(() => endRoom(roomArgs));
      // The Room page swaps to "This Room has ended" by itself.
      return;
    }
    if (!otherPlayer) return;
    const name = selName;
    if (confirm === "remove") {
      const ok = await confirmRun.run(() => removePlayer({ ...roomArgs, playerId: otherPlayer.playerId }));
      if (ok) {
        setConfirm(null);
        setSelected(null);
        clearTarget();
        setDone(`Removed ${name}. Their Chips went back to the Bank.`);
      }
    } else if (confirm === "handOver") {
      const ok = await confirmRun.run(() => handOverHost({ ...roomArgs, playerId: otherPlayer.playerId }));
      if (ok) close();
    }
  }

  const Panel = panel ? PANELS[panel] : null;

  return (
    <dialog ref={ref} className="tray" aria-labelledby={titleId} onClose={close}>
      <header className="tray__head">
        <h2 id={titleId} className="tray__title">
          DEALER TRAY
        </h2>
        <button type="button" className="round-btn" aria-label="Close dealer tray" onClick={close}>
          ×
        </button>
      </header>
      <p className="tray__bank">
        Bank: {(view.bank?.chipsOut ?? 0).toLocaleString("en")} Chips out · unlimited
      </p>

      {Panel ? (
        <Panel
          view={view}
          selected={sel}
          onBack={() => setPanel(null)}
          onDone={(message) => {
            setPanel(null);
            setDone(message);
          }}
        />
      ) : (
        <div className="tray__menu">
          <HolderSelect
            label="Selected"
            view={view}
            kinds={["player", "pot"]}
            placeholder="Nobody: tap a Player or Pot"
            value={sel}
            onChange={(h) => {
              setDone(null);
              setSelected(h && h.kind !== "bank" ? (h as TargetRef) : null);
            }}
          />
          {done && (
            <p className="tray__done" role="status">
              {done}
            </p>
          )}
          <div className="tray__grid">
            <button type="button" className="tray-btn tray-btn--gold" disabled={potsWithChips === 0} onClick={() => open("award")}>
              {sel?.kind === "player" ? `Award a Pot to ${selName}` : "Award a Pot"}
            </button>
            <button type="button" className="tray-btn tray-btn--mint" onClick={() => open("give")}>
              {sel ? `Give from Bank to ${selName}` : "Give from Bank"}
            </button>
            <button type="button" className="tray-btn" disabled={sel !== null && selChips === 0} onClick={() => open("reclaim")}>
              {sel ? `Reclaim from ${selName}` : "Reclaim to Bank"}
            </button>
            <button type="button" className="tray-btn" onClick={() => open("correct")}>
              Correction
            </button>
            <button type="button" className="tray-btn" onClick={() => open("newPot")}>
              New Pot
            </button>
            <button type="button" className="tray-btn" onClick={() => setLogOpen(true)}>
              Activity log
            </button>
          </div>
          <div className="tray__grid">
            <button type="button" className="tray-btn" disabled={!otherPlayer} onClick={() => setConfirm("handOver")}>
              {otherPlayer ? `Make ${selName} Host` : "Hand over Host"}
            </button>
            <button type="button" className="tray-btn tray-btn--danger" disabled={!otherPlayer} onClick={() => setConfirm("remove")}>
              {otherPlayer ? `Remove ${selName}` : "Remove a Player"}
            </button>
          </div>
          {!otherPlayer && <p className="tray__hint">Pick another Player to hand over Host or Remove them.</p>}
          <button type="button" className="tray-btn tray-btn--danger" onClick={() => setConfirm("end")}>
            End Room
          </button>
        </div>
      )}

      {logOpen && <ActivityLog view={view} onClose={() => setLogOpen(false)} />}
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "end" ? "End the Room?" : confirm === "remove" ? `Remove ${selName}?` : `Make ${selName} the Host?`
          }
          confirmLabel={confirm === "end" ? "End the Room for everyone" : confirm === "remove" ? `Remove ${selName}` : `Make ${selName} Host`}
          busy={confirmRun.busy}
          error={confirmRun.error}
          onConfirm={() => void doConfirm()}
          onCancel={() => {
            confirmRun.setError(null);
            setConfirm(null);
          }}
        >
          {confirm === "end" && <p>Chips stop moving and the Room Code is freed. This can't be undone.</p>}
          {confirm === "remove" && (
            <p>
              {selName}'s {selChips.toLocaleString("en")} Chips go back to the Bank, and they lose their seat. If they join
              again they'll be a new Player with no Chips.
            </p>
          )}
          {confirm === "handOver" && (
            <p>They'll control the Bank and Pots, and you'll be a Player. Only they can hand it back.</p>
          )}
        </ConfirmDialog>
      )}
    </dialog>
  );
}
