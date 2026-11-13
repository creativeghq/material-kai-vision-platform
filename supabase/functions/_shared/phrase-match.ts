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

const UNICODE_BOUNDARY = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;

/** Folds a stored pattern like the text; `\b` becomes a Unicode boundary (JS `\b` ignores Greek). Null if it does not compile. */
export function compileTellPattern(pattern: string): RegExp | null {
  const src = pattern.replace(/(\\[pP]\{[^}]*\}|\\.)|([^\\]+)/gu, (_m, esc: string | undefined, lit: string | undefined) =>
    esc !== undefined ? (esc === '\\b' ? UNICODE_BOUNDARY : esc) : foldText(lit ?? ''));
  try {
    return new RegExp(src, 'u');
  } catch {
    return null;
  }
}
