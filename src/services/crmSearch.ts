/** Searching CRM parties — the one way to do it. */
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

/** Build the `%…%` pattern for an `ilike` against `search_xscript`: fold, transliterate, escape. */
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

/** Quote a value for use INSIDE a PostgREST `or(...)` filter string. */
export function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
