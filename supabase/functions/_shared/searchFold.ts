/**
 * Search fold — the Deno twin.
 *
 * The CRM list endpoints match a folded query term against the `search_fold` generated column
 * on `crm_contacts` / `crm_companies`. The column is written by `public.crm_fold()` in SQL; the
 * TERM is folded here. If the two stop agreeing, the sides never meet and search silently
 * returns nothing — no error, no log.
 *
 * Three implementations of one algorithm, and they cannot share a module (Vite alias / Deno URL /
 * plpgsql):
 *   • src/components/core/filters/types.ts     — frontend (option-list search)
 *   • supabase/functions/_shared/searchFold.ts — this file (server-side list search)
 *   • public.crm_fold(text)                    — SQL (writes the stored column)
 *
 * They are held byte-equivalent by tests/unit/searchFoldParity.test.ts, not by convention —
 * convention is how the escapeHtml copies drifted to three different strengths.
 */

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
