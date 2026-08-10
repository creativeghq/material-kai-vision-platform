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

/** The generated column to match. Same name on `crm_contacts` and `crm_companies`. */
export const CRM_SEARCH_COLUMN = 'search_fold';

/**
 * Escape the LIKE metacharacters so a user typing `%` or `_` can't broaden their own search.
 * Mirrors `escapeLike` in the edge handler — same contract, different runtime.
 */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Build the `%…%` pattern for an `ilike` against `search_fold`: fold, then escape.
 *
 * Order matters — folding after escaping would lowercase the backslashes' neighbours but leave
 * the pattern's own metacharacters half-processed.
 */
export function foldedLike(term: string): string {
  return `%${escapeLike(foldForSearch(term))}%`;
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
