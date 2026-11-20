// React wiring for the compass: listens to every heading source the browser offers,
// picks the best fresh one each frame, and smooths it so avatars don't jitter.
// The maths lives in heading.ts (pure, tested); this file only touches browser APIs.
// Behaviour mirrors legacy/compass-demo.html, minus GPS and relative-only orientation.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  axesFromQuaternion,
  headingFromAxes,
  pickSource,
  readOrientationEvent,
  relativeAngle,
  smoothHeading,
  type HeadingSource,
  type LatestReadings,
  type Smoothed,
} from "./heading";

export type HeadingStatus =
  /** No orientation API at all (most laptops), or not a secure context. Use tap mode. */
  | "unsupported"
  /** iOS: call requestPermission() from a tap before anything arrives. */
  | "needs-permission"
  /** The user said no to motion & orientation access. Use tap mode. */
  | "denied"
  /** Listening, waiting for the first reading. */
  | "starting"
  /** `heading` is live. */
  | "active"
  /** Listening but no north-referenced heading is arriving (or it stopped). Use tap mode. */
  | "no-data";

export type HeadingState = {
  /** Smoothed compass heading in [0, 360), or null unless status is "active". */
  heading: number | null;
  source: HeadingSource | null;
  status: HeadingStatus;
  /**
   * Ask for sensor access. On iOS this must be called directly from a user gesture
   * (a click/tap handler). Elsewhere it's a harmless no-op that resolves immediately.
   */
  requestPermission: () => Promise<void>;
};

/** How long to wait for a first reading before declaring "no-data". */
const NO_DATA_AFTER_MS = 3000;
/** Skip re-renders for heading changes smaller than this. */
const MIN_CHANGE_DEG = 0.1;

type PermissionCtor = { requestPermission?: () => Promise<"granted" | "denied" | "default"> };

// The Generic Sensor API isn't in TypeScript's DOM lib.
type OrientationSensor = EventTarget & {
  quaternion?: readonly [number, number, number, number] | null;
  start(): void;
  stop(): void;
};
type OrientationSensorCtor = new (opts: { frequency: number; referenceFrame: "device" | "screen" }) => OrientationSensor;

function screenAngle(): number {
  if (typeof screen !== "undefined" && typeof screen.orientation?.angle === "number") return screen.orientation.angle;
  const legacy = (window as { orientation?: unknown }).orientation; // old iOS
  return typeof legacy === "number" ? ((legacy % 360) + 360) % 360 : 0;
}

function initialStatus(): HeadingStatus {
  if (typeof window === "undefined" || !window.isSecureContext) return "unsupported";
  const hasEvents = "DeviceOrientationEvent" in window;
  if (!hasEvents && !("AbsoluteOrientationSensor" in window)) return "unsupported";
  const ctor = hasEvents ? (window.DeviceOrientationEvent as unknown as PermissionCtor) : undefined;
  return typeof ctor?.requestPermission === "function" ? "needs-permission" : "starting";
}

export function useHeading({ enabled = true }: { enabled?: boolean } = {}): HeadingState {
  const [status, setStatus] = useState<HeadingStatus>(initialStatus);
  const [reading, setReading] = useState<{ heading: number | null; source: HeadingSource | null }>({
    heading: null,
    source: null,
  });
  const statusRef = useRef(status);
  statusRef.current = status;

  const requestPermission = useCallback(async () => {
    const ctor = (window as { DeviceOrientationEvent?: PermissionCtor }).DeviceOrientationEvent;
    if (typeof ctor?.requestPermission !== "function") return;
    // Call before any await: iOS only honours it inside the gesture's call stack.
    const pending = ctor.requestPermission();
    let granted = false;
    try {
      granted = (await pending) === "granted";
    } catch {
      granted = false; // thrown when not called from a gesture, or on an insecure origin
    }
    setStatus(granted ? "starting" : "denied");
  }, []);

  // Listening is only possible once we're past the permission gate.
  const listening = enabled && (status === "starting" || status === "active" || status === "no-data");

  useEffect(() => {
    if (!listening) return;
    const latest: LatestReadings = {};
    const startedAt = performance.now();
    let everHadData = false;

    const onOrientation = (e: DeviceOrientationEvent) => {
      const r = readOrientationEvent(e as DeviceOrientationEvent & { webkitCompassHeading?: number }, screenAngle());
      if (r) latest[r.source] = { heading: r.heading, t: performance.now() };
    };
    window.addEventListener("deviceorientationabsolute" as "deviceorientation", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);

    let sensor: OrientationSensor | null = null;
    const Sensor = (window as { AbsoluteOrientationSensor?: OrientationSensorCtor }).AbsoluteOrientationSensor;
    if (Sensor) {
      try {
        const s = new Sensor({ frequency: 60, referenceFrame: "device" });
        s.addEventListener("reading", () => {
          if (!s.quaternion) return;
          const h = headingFromAxes(axesFromQuaternion(s.quaternion), screenAngle());
          if (h != null) latest.sensor = { heading: h, t: performance.now() };
        });
        // Permission or hardware errors: the event sources below still work.
        s.addEventListener("error", () => {});
        s.start();
        sensor = s;
      } catch {
        // SecurityError / ReferenceError: fall back to events.
      }
    }

    let smoothed: Smoothed | null = null;
    let lastT = 0;
    let shown: { heading: number | null; source: HeadingSource | null } = { heading: null, source: null };
    let raf = 0;

    const frame = () => {
      const now = performance.now();
      const source = pickSource(latest, now);
      let next: HeadingStatus;
      if (source) {
        everHadData = true;
        smoothed = smoothHeading(smoothed, latest[source]!.heading, now - lastT);
        lastT = now;
        next = "active";
        const h = smoothed.heading;
        const moved = shown.heading == null || Math.abs(relativeAngle(h, shown.heading)) >= MIN_CHANGE_DEG;
        if (moved || shown.source !== source) {
          shown = { heading: h, source };
          setReading(shown);
        }
      } else {
        smoothed = null; // after a gap, snap to the new heading rather than drift from the old one
        next = !everHadData && now - startedAt < NO_DATA_AFTER_MS ? "starting" : "no-data";
        if (shown.heading != null) {
          shown = { heading: null, source: null };
          setReading(shown);
        }
      }
      if (statusRef.current !== next) setStatus(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("deviceorientationabsolute" as "deviceorientation", onOrientation);
      window.removeEventListener("deviceorientation", onOrientation);
      try {
        sensor?.stop();
      } catch {
        // already stopped
      }
      setReading({ heading: null, source: null });
    };
  }, [listening]);

  const active = enabled && status === "active";
  return {
    heading: active ? reading.heading : null,
    source: active ? reading.source : null,
    status,
    requestPermission,
  };
}
