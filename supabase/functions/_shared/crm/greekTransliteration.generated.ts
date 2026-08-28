// GENERATED MIRROR of src/services/crm/greekTransliteration.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * Greek → Latin transliteration for SEARCH, and nothing else (#353 CRM-1).
 *
 * `Παπαδόπουλος` folds to `παπαδοπουλος`; `Papadopoulos` folds to `papadopoulos`. Nothing in
 * this platform could ever match them, so a Greek CRM could hold the same party twice — once
 * per alphabet — and neither the pickers nor the duplicate probe could see it. Concrete misses
 * the audit listed: `ΜΕΤΑΛΛΙΚΑ ΕΡΓΑ Α.Ε.` vs `Metallika Erga SA`, `Νίκος Παπαδόπουλος` vs
 * `Nikos Papadopoulos`.
 *
 * ONE DIRECTION, ON PURPOSE. Greek → Latin is well defined (ELOT 743); Latin → Greek is not —
 * `Vasilis` could be `Βασίλης` or `Βασιλης` or `Βασίλις`, and `v` is `β` in one word and the
 * `υ` of `αυ` in the next. So BOTH sides of a comparison are pushed to Latin instead: the
 * stored column carries the transliteration alongside the original, and the query is
 * transliterated the same way. A Greek query then finds a Latin-stored name and vice versa,
 * without ever guessing at Greek spelling.
 *
 * THIS RUNS TWICE, AND THAT IS DELIBERATE. The twin is `public.crm_translit()` in Postgres,
 * because the column is GENERATED (SQL) and the query is built in the browser (TypeScript) —
 * the same split `crm_fold` / `foldForSearch` already live with. The two are held identical by
 * `tests/unit/greekTransliterationParity.test.ts`, which reads the mapping out of BOTH
 * implementations and compares them as data. That is the `escapeHtml` lesson: three copies
 * drifted to three different strengths precisely because nothing compared them.
 *
 * NOT A NORMALISER, NOT A DISPLAY NAME. The output exists to be matched against other output
 * of the same function. It is lossy (`η`, `ι`, `υ`, `οι`, `ει` all become `i`), which is
 * correct for search — those are homophones, and someone typing by ear should find the record.
 * Never show it to anyone, and never store it as a name.
 *
 * IMPORT-FREE, so the parity test can read it without booting anything.
 */

/**
 * Multi-character sequences, applied BEFORE the single letters.
 *
 * Order matters twice over. Digraphs first, because `ου` must become `ou` before `ο` and `υ`
 * are replaced separately (which would give `oy`). And within this list, longer sequences must
 * precede their own prefixes — `γγ` before `γ`, `αυ` before `α`.
 *
 * The awkward ones are the voiced stops. Greek writes /b/ as `μπ`, /d/ as `ντ` and /g/ as `γκ`,
 * so `Μπάμπης` is Babis and `Ντίνος` is Dinos. A letter-by-letter mapping gives `mpampis` and
 * `ntinos`, which match nothing a Latin-typing user would ever write.
 */
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
