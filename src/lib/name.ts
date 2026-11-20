// The display name typed last time, so New Room and Join can prefill it.

const KEY = "cards.name";

export function loadName(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {
    // Storage blocked: they'll just type it again next time.
  }
}

export const MAX_NAME_LENGTH = 24;
