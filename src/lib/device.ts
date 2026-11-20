// A Player is identified by their device, not an account (see GLOSSARY.md › Player).
// This random id is the device's secret; it is sent with every mutation and never shown.

const KEY = "cards.deviceId";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return (cached = existing);
  } catch {
    // Storage blocked (private mode etc.): fall through to an in-memory id.
  }
  const fresh = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, fresh);
  } catch {
    // Ignore: this device just won't be recognised after a reload.
  }
  return (cached = fresh);
}
