import { useMutation } from "convex/react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { api } from "../../../convex/_generated/api";
import { LeaveDialog } from "../../components/LeaveDialog.tsx";
import { getDeviceId } from "../../lib/device.ts";
import { errorMessage } from "../../lib/errors.ts";
import { DESIGN_WIDTH, RING_CENTER_Y, RING_RADIUS } from "../../lib/ringLayout.ts";
import { cappedAmount, sendBarState } from "../../lib/sendBar.ts";
import { isAway, type RoomView } from "../room/types.ts";
import { ActivityTicker } from "./ActivityTicker.tsx";
import { HostTrayPlaceholder } from "./HostTrayPlaceholder.tsx";
import { Pots } from "./Pots.tsx";
import { Rail } from "./Rail.tsx";
import { Ring, SEAT_BELOW_CENTRE_PX } from "./Ring.tsx";
import { TopBar } from "./TopBar.tsx";
import { ringPlayers, sameTarget, tapRingLayout, targetName, type RingLayout, type TargetRef } from "./targets.ts";

/** What the dealer tray (#7) gets when the Host opens it. */
export type HostTrayContext = {
  view: RoomView;
  /** The Target tapped (or aimed at) on the Play screen, e.g. who to Award a Pot to. */
  target: TargetRef | null;
  clearTarget: () => void;
  close: () => void;
};

type Props = {
  view: RoomView;
  online: Set<string> | undefined;
  /** Where the ring's avatars go. Defaults to tap mode; compass mode (#9) passes its own. */
  layout?: RingLayout;
  /** The Compass/Tap switch (#9), shown in the top bar. */
  modeSwitch?: ReactNode;
  /** The send bar's hint with no Target; compass mode can say "Aim or tap a Target". */
  noTargetHint?: string;
  /** Compass mode (#9): a long-press on a Player or Pot, to lock its Bearing. */
  onHold?: (t: TargetRef) => void;
  /** Compass mode (#9): drawn over the screen (the aim marker, a toast). */
  overlay?: ReactNode;
  /** Compass mode (#9): a line on the felt under the Activity (a hint or why it fell back). */
  feltNote?: ReactNode;
  /** The dealer tray (#7). Until then, a placeholder. */
  renderHostTray?: (ctx: HostTrayContext) => ReactNode;
};

/**
 * In Play (docs/PRD.md › Play screen): the ring of other Players across the top, the Pots
 * and latest Activity on the felt, and my rail at the bottom. Pick an amount, pick a Target,
 * swipe up.
 */
export function PlayScreen({
  view,
  online,
  layout = tapRingLayout,
  modeSwitch,
  noTargetHint,
  onHold,
  overlay,
  feltNote,
  renderHostTray,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const width = useWidth(ref);
  const [leaving, setLeaving] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [selected, setSelected] = useState<TargetRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = useMutation(api.chips.send);

  const { slots, aimed } = layout(ringPlayers(view), width);
  // The felt starts below the ring's lowest avatar label, however the layout arranged them.
  const ringBottom = Math.max(RING_TOP_PX, ...slots.map((s) => s.y + SEAT_BELOW_CENTRE_PX * s.scale));
  // A tapped Target wins over an aimed one. One that's gone (Left, Removed) no longer counts.
  const tapped = targetName(view, selected) !== null ? selected : null;
  const target = tapped ?? aimed;
  const name = targetName(view, target);
  const myChips = view.me.chips;
  const bar = sendBarState({ targetName: name, amount, myChips, busy, noTargetHint });

  function pick(t: TargetRef) {
    setError(null);
    setSelected(sameTarget(tapped, t) ? null : t);
  }

  async function doSend() {
    const amt = cappedAmount(amount, myChips);
    if (!bar.canSend || !target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ deviceId: getDeviceId(), roomId: view.room._id, to: target, amount: amt });
      navigator.vibrate?.(20);
      setAmount(0);
      setSelected(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main ref={ref} className="play" style={{ "--ring-bottom": `${Math.round(ringBottom)}px` } as CSSProperties}>
      <TopBar
        code={view.room.code}
        modeSwitch={modeSwitch}
        onHost={view.isHost ? () => setHostOpen(true) : undefined}
        onLeave={() => setLeaving(true)}
      />
      <Ring
        width={width}
        slots={slots}
        isAway={(p) => isAway(online, view, p._id)}
        isTarget={(p) => target?.kind === "player" && target.playerId === p._id}
        onPick={(p) => pick({ kind: "player", playerId: p._id })}
        onHold={onHold && ((p) => onHold({ kind: "player", playerId: p._id }))}
      />
      <div className="play__felt">
        <Pots
          view={view}
          isTarget={(pot) => target?.kind === "pot" && target.potId === pot._id}
          onPick={(pot) => pick({ kind: "pot", potId: pot._id })}
          onHold={onHold && ((pot) => onHold({ kind: "pot", potId: pot._id }))}
        />
        <ActivityTicker view={view} />
        {feltNote}
      </div>
      <Rail
        myChips={myChips}
        amount={amount}
        onAmount={(n) => {
          setError(null);
          setAmount(n);
        }}
        targetName={name}
        bar={bar}
        onSend={() => void doSend()}
        error={error}
      />
      {overlay}
      <LeaveDialog view={view} open={leaving} onClose={() => setLeaving(false)} />
      {hostOpen &&
        (renderHostTray ?? ((ctx) => <HostTrayPlaceholder onClose={ctx.close} />))({
          view,
          target,
          clearTarget: () => setSelected(null),
          close: () => setHostOpen(false),
        })}
    </main>
  );
}

/** The top of the arc, where the felt would start with nobody else at the table. */
const RING_TOP_PX = RING_CENTER_Y - RING_RADIUS;

/** The screen's width in px, for the ring geometry (designed at 390, used at 360 to 430). */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(DESIGN_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
