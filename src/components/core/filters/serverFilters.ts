/**
 * Server-side half of the filter model: turns the SAME `FilterGroupDef[]` a surface hands
 * the modal into PostgREST predicates, so large tables keep SQL pushdown + exact counts
 * instead of over-fetching and filtering in the browser.
 *
 * A field is client-side or server-side, never both:
 *   - `accessor` set  → matched in-memory by `applyFilters`
 *   - `column` set    → pushed down here, and `applyFilters` passes it through untouched
 */
import { NONE_VALUE, isFieldActive, type DateRangeValue, type FilterGroupDef, type FilterValues, type RangeValue } from './types';

/**
 * PostgREST ilike-filter sanitizer — strips the characters that would break the `.or()`
 * grammar. NOT an HTML escaper (see src/utils/escapeHtml.ts) and NOT a CSV quoter; these
 * are three separate contracts, so never shorten this to `esc`.
 */
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[%,()]/g, ' ').trim();
}

/** Minimal shape we need off a supabase query builder — keeps this file client-agnostic. */
interface QueryLike {
  eq: (column: string, value: any) => any;
  in: (column: string, values: any[]) => any;
  is: (column: string, value: any) => any;
  gte: (column: string, value: any) => any;
  lte: (column: string, value: any) => any;
  or: (filters: string) => any;
}

/**
 * Compose every server-side field onto `query`. Returns the same builder so it chains:
 *   query = applyFiltersToQuery(query, groups, values).range(from, to)
 */
export function applyFiltersToQuery<Q extends QueryLike>(query: Q, groups: FilterGroupDef[], values: FilterValues): Q {
  let q: any = query;

  for (const field of groups.flatMap((g) => g.fields)) {
    const value = values[field.key];
    const column = (field as any).column as string | undefined;
    if (!column && !(field.type === 'text' && (field as any).columns)) continue;
    if (!isFieldActive(field, value)) continue;

    switch (field.type) {
      case 'text': {
        const term = sanitizeIlikeTerm(String(value));
        if (!term) break;
        const columns: string[] = (field as any).columns ?? [column];
        q = columns.length === 1
          ? q.ilike(columns[0], `%${term}%`)
          : q.or(columns.map((c) => `${c}.ilike.%${term}%`).join(','));
        break;
      }
      case 'select':
        q = value === NONE_VALUE ? q.is(column!, null) : q.eq(column!, value);
        break;
      case 'multi': {
        const vals = value as string[];
        const wantsNull = vals.includes(NONE_VALUE);
        const concrete = vals.filter((v) => v !== NONE_VALUE);
        if (wantsNull && concrete.length > 0) {
          // "Uncategorized OR one of these" — a single or() keeps it one predicate.
          q = q.or(`${column}.is.null,${column}.in.(${concrete.map((v) => `"${sanitizeIlikeTerm(v)}"`).join(',')})`);
        } else if (wantsNull) {
          q = q.is(column!, null);
        } else if (concrete.length > 0) {
          q = q.in(column!, concrete);
        }
        break;
      }
      case 'range': {
        const { min, max } = value as RangeValue;
        if (min != null) q = q.gte(column!, min);
        if (max != null) q = q.lte(column!, max);
        break;
      }
      case 'dateRange': {
        const { from, to } = value as DateRangeValue;
        if (from) q = q.gte(column!, from);
        // Inclusive end-of-day so a timestamp column doesn't drop the final day's rows.
        if (to) q = q.lte(column!, `${to}T23:59:59.999`);
        break;
      }
      case 'bool':
        q = q.eq(column!, Boolean(value));
        break;
    }
  }

  return q as Q;
}
