/**
 * Where Quotes lives in the URL — one answer, imported by everything that links into it.
 *
 * `/quotes` is the list; `/quotes/:id` opens one quote (that is the address `QuotesPage` itself
 * navigates to on a row click, so anything else linking to a quote must use the same one).
 * `?tab=requests` / `?tab=settings` are the two extra panes, and they only render for a
 * network-node persona — a link that names one for anyone else falls back to the list.
 */
export const QUOTES_BASE = '/quotes';

/** The `?tab=` keys QuotesPage renders panes for. `quotes` is the default and omits the param. */
export const QUOTES_TAB = { quotes: 'quotes', requests: 'requests', settings: 'settings' } as const;

/** `?<key>=` param the quotes list reads its filter bag out of (see `filterUrl`). */
export const QUOTES_FILTER_KEY = 'qf';

/** One quote's own page. */
export function quoteUrl(quoteId: string): string {
  return `${QUOTES_BASE}/${quoteId}`;
}
