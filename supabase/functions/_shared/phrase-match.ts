/** Accent-, case- and final-sigma-insensitive phrase matching. Import-free so a unit test can load it. */

export const foldText = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function phrasePattern(phrase: string): string | null {
  const words = foldText(phrase).split(/\s+/).filter(Boolean).map(escapeRe);
  return words.length ? words.join('\\s+') : null;
}

/** True when `phrase` occurs in `text` as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = phrasePattern(phrase);
  if (!p) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, 'u').test(foldText(text ?? ''));
}

/** True when `text` starts with `phrase` as whole words, ignoring leading whitespace and punctuation. */
export function startsWithPhrase(text: string, phrase: string): boolean {
  const p = phrasePattern(phrase);
  if (!p) return false;
  return new RegExp(`^[^\\p{L}\\p{N}]*${p}(?![\\p{L}\\p{N}])`, 'u').test(foldText(text ?? ''));
}
