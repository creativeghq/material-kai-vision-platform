/**
 * Drain a paged list endpoint into a single array.
 *
 * Several browse screens (CRM, Orders) apply rich multi-field filtering client-side. Server-side
 * pagination is incompatible with that — the filter would only ever see the current page — so those
 * screens legitimately need the whole set in memory. What they must NOT do is fetch one arbitrary
 * page and pretend it's everything, which is what a bare `.limit(500)` did: the tail was silently
 * dropped and the filters quietly lied.
 *
 * This drains page by page until the source is exhausted, bounded by `maxRows` so a runaway table
 * can't hang the tab. `truncated` tells the caller it hit that ceiling, so the UI can say so instead
 * of silently under-reporting again.
 */
export interface FetchAllResult<T> {
  rows: T[];
  /** True when `maxRows` was reached before the source was exhausted. */
  truncated: boolean;
  /** Server-reported total when the endpoint provides one, else the number of rows drained. */
  total: number;
}

export async function fetchAllPages<T>(
  /** Fetch one page. Must return the page's rows and, when known, the server's total count. */
  fetchPage: (limit: number, offset: number) => Promise<{ data: T[]; count?: number | null }>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<FetchAllResult<T>> {
  const pageSize = opts.pageSize ?? 500;
  const maxRows = opts.maxRows ?? 10_000;

  const rows: T[] = [];
  let total = 0;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, count } = await fetchPage(pageSize, offset);
    const page = data ?? [];
    rows.push(...page);
    if (typeof count === 'number') total = count;

    // Short page means the source is exhausted — stop before spending a wasted round trip.
    if (page.length < pageSize) {
      return { rows, truncated: false, total: total || rows.length };
    }
    // Server told us the total and we've drained it.
    if (typeof count === 'number' && rows.length >= count) {
      return { rows, truncated: false, total: count };
    }
  }

  return { rows, truncated: true, total: total || rows.length };
}
