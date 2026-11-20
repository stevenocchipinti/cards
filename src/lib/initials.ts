/** Avatar initials: first letters of the first and last word, or the first two letters of one word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]!];
  if (words.length === 1) return first.slice(0, 2).join("").toUpperCase();
  const last = [...words[words.length - 1]!];
  return (first[0]! + last[0]!).toUpperCase();
}
