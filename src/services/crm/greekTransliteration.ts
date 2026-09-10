/** Greek → Latin transliteration for SEARCH, and nothing else (#353 CRM-1). */

/** Multi-character sequences, applied BEFORE the single letters. */
export const GREEK_DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['γγ', 'ng'],
  ['γξ', 'nx'],
  ['γχ', 'nch'],
  ['γκ', 'g'],
  ['μπ', 'b'],
  ['ντ', 'd'],
  ['τσ', 'ts'],
  ['τζ', 'tz'],
  ['ου', 'ou'],
  ['αυ', 'av'],
  ['ευ', 'ev'],
  ['ηυ', 'iv'],
  ['αι', 'e'],
  ['ει', 'i'],
  ['οι', 'i'],
  ['υι', 'i'],
];

/**
 * Single letters, ELOT 743 with the search-friendly simplifications.
 *
 * `η`, `υ` → `i` rather than `i`/`y`: they are homophones of `ι` in modern Greek, and a search
 * that distinguishes them fails exactly the case it exists for. `ω` → `o` for the same reason.
 *
 * The input is ALREADY folded — lowercased, accents stripped, final sigma normalised — so
 * neither accented vowels nor `ς` appear here. `ς` is included anyway, defensively: this
 * function must not silently pass a raw character through if a caller ever forgets to fold.
 */
export const GREEK_LETTERS: ReadonlyArray<readonly [string, string]> = [
  ['α', 'a'], ['β', 'v'], ['γ', 'g'], ['δ', 'd'], ['ε', 'e'], ['ζ', 'z'],
  ['η', 'i'], ['θ', 'th'], ['ι', 'i'], ['κ', 'k'], ['λ', 'l'], ['μ', 'm'],
  ['ν', 'n'], ['ξ', 'x'], ['ο', 'o'], ['π', 'p'], ['ρ', 'r'], ['σ', 's'],
  ['ς', 's'], ['τ', 't'], ['υ', 'i'], ['φ', 'f'], ['χ', 'ch'], ['ψ', 'ps'],
  ['ω', 'o'],
];

/**
 * Transliterate Greek text to Latin for matching.
 *
 * Expects ALREADY-FOLDED input (see `foldForSearch` / `crm_fold`). Text with no Greek in it
 * comes back unchanged, which is what makes it safe to apply to everything: a Latin name
 * transliterates to itself, so one code path serves both alphabets.
 */
export function transliterateGreek(input: string): string {
  let out = input;
  for (const [from, to] of GREEK_DIGRAPHS) out = out.split(from).join(to);
  for (const [from, to] of GREEK_LETTERS) out = out.split(from).join(to);
  return out;
}
