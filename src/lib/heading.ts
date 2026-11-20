// Pure compass maths, ported from legacy/compass-demo.html (which is proven on real phones).
// Nothing here touches the DOM, so it runs in tests; useHeading.ts wires it to browser events.
//
// Headings are compass degrees in [0, 360): 0 = north, clockwise.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type Vec3 = readonly [number, number, number];
/** The device's x, y and z axes, each expressed in Earth coordinates (East, North, Up). */
export type DeviceAxes = readonly [x: Vec3, y: Vec3, z: Vec3];

// ---------- angles ----------

/** Any angle in degrees -> [0, 360). */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r; // the ternary also turns -0 into 0
}

/**
 * Signed angle from `from` to `to`, in (-180, 180]. Positive means `to` is clockwise
 * (to the right) of `from`. Exactly opposite is +180, so callers get one stable answer.
 */
export function relativeAngle(to: number, from: number): number {
  const d = normalizeDegrees(to - from);
  return d > 180 ? d - 360 : d;
}

// ---------- orientation -> heading ----------

/**
 * Compass heading the phone is "pointing", given its axes in Earth coordinates and the
 * screen orientation angle (screen.orientation.angle: 0, 90, 180 or 270).
 * Flat: the top edge of the screen. Upright: the direction the back camera looks.
 * In between we blend by how far the screen's top edge is raised, so pitching up is
 * seamless and rolling the phone sideways doesn't skew the heading.
 * Returns null when the pose is degenerate (screen facing the ground, tilted back).
 */
export function headingFromAxes([X, Y, Z]: DeviceAxes, screenAngleDeg = 0): number | null {
  const a = screenAngleDeg * RAD;
  // The screen's "up" edge in Earth coordinates, rotated for landscape/upside-down.
  const up = [0, 1, 2].map((i) => Math.cos(a) * Y[i]! + Math.sin(a) * X[i]!) as [number, number, number];
  const w = Math.min(1, Math.max(0, up[2]));
  const e = (1 - w) * up[0] - w * Z[0];
  const n = (1 - w) * up[1] - w * Z[1];
  if (Math.hypot(e, n) < 0.15) return null;
  return normalizeDegrees(Math.atan2(e, n) * DEG);
}

/** W3C DeviceOrientation Euler angles (Z-X'-Y'', degrees) -> device axes in Earth frame. */
export function axesFromEuler(alpha: number, beta: number, gamma: number): DeviceAxes {
  const cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
  const cB = Math.cos(beta * RAD), sB = Math.sin(beta * RAD);
  const cG = Math.cos(gamma * RAD), sG = Math.sin(gamma * RAD);
  return [
    [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG],
    [-cB * sA, cA * cB, sB],
    [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG],
  ];
}

/** Quaternion [x, y, z, w] (device -> Earth ENU, as AbsoluteOrientationSensor gives) -> device axes. */
export function axesFromQuaternion([x, y, z, w]: readonly [number, number, number, number]): DeviceAxes {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

export function headingFromEuler(alpha: number, beta: number, gamma: number, screenAngleDeg = 0): number | null {
  return headingFromAxes(axesFromEuler(alpha, beta, gamma), screenAngleDeg);
}

// ---------- sources ----------

/**
 * Heading sources, most trustworthy first. All are tied to (magnetic) north.
 * Deliberately left out:
 * - GPS course over ground: only works while walking, useless at a table.
 * - Relative-only deviceorientation: not tied to north and resets between page loads,
 *   so Bearings stored against it would point the wrong way next time.
 */
export const HEADING_SOURCES = ["sensor", "webkit", "absEvent", "absFlag"] as const;
export type HeadingSource = (typeof HEADING_SOURCES)[number];

/** A reading older than this no longer counts, so a dead source hands over to the next. */
export const STALE_MS = 1000;

export type Reading = { heading: number; t: number };
export type LatestReadings = Partial<Record<HeadingSource, Reading>>;

/** The best source with a fresh reading, or null if none is fresh. */
export function pickSource(latest: LatestReadings, now: number, staleMs = STALE_MS): HeadingSource | null {
  for (const id of HEADING_SOURCES) {
    const r = latest[id];
    if (r && now - r.t < staleMs) return id;
  }
  return null;
}

/** The fields of a DeviceOrientationEvent we care about (iOS adds the webkit ones). */
export type OrientationSample = {
  type: string;
  absolute?: boolean | null;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number | null;
};

/**
 * Classify a deviceorientation(absolute) event into a source and heading, or null if
 * it carries no north-referenced heading (relative only, or a degenerate pose).
 */
export function readOrientationEvent(
  e: OrientationSample,
  screenAngleDeg: number,
): { source: HeadingSource; heading: number } | null {
  if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) {
    // iOS: already tilt-compensated and screen-relative, magnetic north, clockwise.
    return { source: "webkit", heading: normalizeDegrees(e.webkitCompassHeading) };
  }
  if (e.alpha == null || e.beta == null || e.gamma == null) return null;
  const source: HeadingSource | null =
    e.type === "deviceorientationabsolute" ? "absEvent" : e.absolute === true ? "absFlag" : null;
  if (!source) return null;
  const heading = headingFromEuler(e.alpha, e.beta, e.gamma, screenAngleDeg);
  return heading == null ? null : { source, heading };
}

// ---------- smoothing ----------

/** Running circular average, kept as a unit vector sum so 359° -> 1° doesn't swing through 180°. */
export type Smoothed = { sin: number; cos: number; heading: number };

/** Time constant of the smoothing: about how long a sudden turn takes to mostly show. */
export const SMOOTHING_MS = 120;

/**
 * Blend a new reading into the running average. Time-based (exponential), so it behaves
 * the same whether readings arrive at 10Hz or 60Hz. Pass `prev = null` to start fresh.
 */
export function smoothHeading(
  prev: Smoothed | null,
  heading: number,
  dtMs: number,
  tauMs = SMOOTHING_MS,
): Smoothed {
  const s = Math.sin(heading * RAD), c = Math.cos(heading * RAD);
  if (!prev) return { sin: s, cos: c, heading: normalizeDegrees(heading) };
  const k = tauMs <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  const sin = prev.sin * (1 - k) + s * k;
  const cos = prev.cos * (1 - k) + c * k;
  // Exactly opposing readings cancel out; keep the previous heading rather than jump.
  if (Math.hypot(sin, cos) < 1e-9) return prev;
  return { sin, cos, heading: normalizeDegrees(Math.atan2(sin, cos) * DEG) };
}
