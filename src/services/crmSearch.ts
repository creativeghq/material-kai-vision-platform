/**
 * Searching CRM parties — the one way to do it.
 *
 * `crm_contacts` / `crm_companies` each carry a generated `search_fold` column holding every
 * searchable field of that party (name, first/last name, email, website, VAT), folded by
 * `public.crm_fold()`: lowercased, accents stripped, final sigma normalised. Match it with a
 * term folded the same way and Greek finally behaves — `Κώστας` finds `ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ`,
 * `societe` finds `Société`.
 *
 * Before this there were ~12 party pickers each `ilike`-ing its own subset of raw columns, all
 * of them accent-sensitive and most of them building a PostgREST `or()` string by hand. Do not
 * add a thirteenth: [tests/unit/crmPartySearch.test.ts](../../tests/unit/crmPartySearch.test.ts)
 * fails the build when a `src/` file ilikes a raw name/email/website/vat column on either table.
 *
 * ```ts
 * supabase.from('crm_companies').select('id, name')
 *   .eq('is_customer', true)
 *   .ilike(CRM_SEARCH_COLUMN, foldedLike(term))
 * ```
 */
import { foldForSearch } from '@/components/core/filters/types';
import { transliterateGreek } from '@/services/crm/greekTransliteration';

/**
 * The generated column to match. Same name on `crm_contacts` and `crm_companies`.
 *
 * `search_xscript`, not `search_fold` (#353 CRM-1). It holds the folded text AND its Greek→Latin
 * transliteration, so a query in either alphabet reaches a party stored in the other. The old
 * column is untouched and still correct for anything that wants strictly literal folding.
 */
export const CRM_SEARCH_COLUMN = 'search_xscript';

/** The dedupe key — the same idea applied to the name alone. */
export const CRM_NAME_COLUMN = 'name_xscript';

/**
 * Escape the LIKE metacharacters so a user typing `%` or `_` can't broaden their own search.
 * Mirrors `escapeLike` in the edge handler — same contract, different runtime.
 */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Build the `%…%` pattern for an `ilike` against `search_xscript`: fold, transliterate, escape.
 *
 * BOTH SIDES GO TO LATIN (#353 CRM-1). The column carries the transliteration next to the
 * original, and the query is transliterated the same way, so `μεταλλικα` finds `Metallika Erga`
 * and `papadopoulos` finds `Παπαδόπουλος`. Only Greek→Latin is attempted, because the reverse is
 * genuinely ambiguous — `Vasilis` could be `Βασίλης` or `Βασιλης`, and `v` is `β` in one word
 * and the `υ` of `αυ` in the next. Pushing both sides one way needs no such guess.
 *
 * Order matters twice. Fold before transliterating, because the mapping is written against
 * folded input (no accents, no final sigma). Escape LAST — escaping first would leave the
 * pattern's own metacharacters half-processed by the two passes that follow.
 */
export function foldedLike(term: string): string {
  return `%${escapeLike(transliterateGreek(foldForSearch(term)))}%`;
}

/**
 * The same value, unwrapped — for an EQUALITY match against `name_xscript`.
 *
 * The duplicate probe needs "is there already a party with this name", which is `=` and not
 * `ilike`; wrapping it in `%…%` would make every short name collide with every longer one.
 */
export function foldedName(term: string): string {
  return transliterateGreek(foldForSearch(term));
}

/**
 * Quote a value for use INSIDE a PostgREST `or(...)` filter string.
 *
 * That grammar is comma-delimited, so an unquoted value carrying a comma is re-parsed as
 * syntax — verified against the live API, the unquoted form returns 400. Greek business names
 * carry commas, and so do factory names lifted out of PDFs. Inside double quotes only `"` and
 * `\` need escaping.
 *
 * A DIFFERENT contract from `escapeHtml` (invariant 11) — PostgREST filter grammar, not HTML.
 * Twin of `quoteOrValue` in `crm-api/handlers/contacts-api-handler.ts`.
 */
export function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
