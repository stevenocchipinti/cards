import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { api } from "../../../../convex/_generated/api";
import { getDeviceId } from "../../../lib/device.ts";
import { errorMessage } from "../../../lib/errors.ts";
import { PlayScreen } from "../PlayScreen.tsx";
import { ringPlayers, targetName, type TargetRef } from "../targets.ts";
import { bearingMap, compassRingLayout, targetKey } from "./compassRing.ts";
import { ModeSwitch } from "./ModeSwitch.tsx";
import { useCompassMode } from "./useCompassMode.ts";
import "./compass.css";

type Props = Omit<
  ComponentProps<typeof PlayScreen>,
  "layout" | "modeSwitch" | "noTargetHint" | "onHold" | "overlay" | "feltNote"
>;

const TOAST_MS = 1600;

/**
 * The Play screen with compass mode (docs/PRD.md › Play screen › Compass mode) wired in:
 * the Compass/Tap switch, avatars placed by my Bearings and the heading, aiming to pick a
 * Target, and a long-press to lock a Bearing. In tap mode it's the plain Play screen.
 */
export function CompassPlayScreen(props: Props) {
  const { view } = props;
  const mode = useCompassMode();
  const { heading, live } = mode;
  const deviceId = getDeviceId();
  const roomId = view.room._id;

  // Subscribe once the compass has produced a heading, and stay subscribed through brief
  // gaps so the avatars don't jump back to tap slots and then reload.
  const hadHeading = useRef(false);
  if (heading != null) hadHeading.current = true;
  const bearings = useQuery(api.bearings.myBearings, live && hadHeading.current ? { deviceId, roomId } : "skip");
  const lock = useMutation(api.bearings.lockBearing);

  const headingRef = useRef(heading);
  headingRef.current = heading;

  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast((prev) => ({ text, n: (prev?.n ?? 0) + 1 }));

  const map = useMemo(() => bearingMap(bearings ?? []), [bearings]);
  const potIds = view.pots.map((p) => p._id);
  const layout = compassRingLayout({ bearings: map, heading, potIds });

  // Bearings to Targets still here (a Player who Left keeps their row but isn't shown).
  const targetKeys = [
    ...ringPlayers(view).map((p) => targetKey({ kind: "player", playerId: p._id })),
    ...potIds.map((potId) => targetKey({ kind: "pot", potId })),
  ];
  const placedCount = targetKeys.filter((k) => map.has(k)).length;

  async function onHold(t: TargetRef) {
    const name = targetName(view, t);
    const h = headingRef.current;
    if (!name) return;
    if (h == null) {
      say("Waiting for the compass…");
      return;
    }
    try {
      await lock({ deviceId, roomId, target: t, heading: h });
      navigator.vibrate?.([20, 40, 20]);
      say(`Locked ${name}`);
    } catch (err) {
      say(errorMessage(err));
    }
  }

  let note: string | null = mode.note;
  if (!note && live && heading != null && bearings !== undefined && placedCount === 0 && targetKeys.length > 0) {
    note = "Point at someone and hold their avatar to lock them in";
  }

  return (
    <PlayScreen
      {...props}
      layout={live ? layout : undefined}
      modeSwitch={<ModeSwitch chosen={mode.chosen} onChoose={mode.choose} />}
      noTargetHint={live ? "Aim or tap a Target" : undefined}
      onHold={live ? (t) => void onHold(t) : undefined}
      overlay={
        <>
          {live && <div className="aim-tick" aria-hidden="true" />}
          <div className="compass-toast-slot" role="status" aria-live="polite">
            {toast && (
              <span key={toast.n} className="compass-toast">
                {toast.text}
              </span>
            )}
          </div>
        </>
      }
      feltNote={note && <p className="compass-note">{note}</p>}
    />
  );
}
