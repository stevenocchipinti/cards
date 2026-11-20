// Room Codes (GLOSSARY.md): 4 characters from an alphabet without look-alikes.
// Keep in step with CODE_ALPHABET in convex/rooms.ts.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

/** What someone typed, uppercased with anything outside the alphabet dropped, at most 4 characters. */
export function normalizeCode(typed: string): string {
  return [...typed.toUpperCase()]
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return code.length === CODE_LENGTH && normalizeCode(code) === code;
}
