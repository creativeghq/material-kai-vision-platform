/** Search fold — the Deno twin. */

/**
 * Case- AND diacritic-insensitive fold.
 *
 * `toLowerCase()` alone is not enough for a Greek CRM: `Κώστας` and `ΚΩΣΤΑΣ` differ only by
 * accents, and the final sigma `ς` is a different codepoint from `σ`, so a name typed the way
 * it is spelled missed the row entirely.
 *
 * Not a transliterator — `Trendafil` will not find `Трендафил`. That is
 * `_shared/transliterate.ts`, a different problem with a different answer.
 */
export function foldForSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents: ά→α, é→e
    .toLowerCase()
    .replace(/ς/g, 'σ'); // final sigma ς folds onto the medial σ
}

/** Escape PostgREST ilike wildcards so a value carrying `%` or `_` cannot broaden the match. */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}
