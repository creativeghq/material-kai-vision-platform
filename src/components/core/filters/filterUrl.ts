/**
 * How a filtered list view is spelled in a URL. ONE encoder, no React, no imports beyond a type.
 *
 * `useFilterValues` writes and reads this param; `filterUrl` is how any OTHER surface authors a
 * link into an already-filtered list. Both halves must agree byte-for-byte, which is why they are
 * the same function rather than two conventions that look alike.
 *
 * The failure this prevents is silent by construction: a hand-written `/finance?tab=doc_orders&
 * status=draft` is a perfectly valid URL that every route resolves and no list surface reads, so
 * it opens the right tab showing EVERYTHING and looks exactly like it worked. That is the same
 * shape as the dashboard's "View details" links, which pointed at `/finance` and landed on
 * whatever tab happened to be default.
 *
 * Dependency-free on purpose: the link registries that build deep links (and the guard test that
 * checks them) import this without dragging in React or the filter widgets.
 */
import type { FilterValues } from './types';

/** Drop cleared keys so the URL (and the active-filter count) never carry empty noise. */
export function cleanFilterValues(values: FilterValues): FilterValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  );
}

/**
 * Parse one `?<urlKey>=` param back into a values bag.
 *
 * Anything unparseable falls back rather than throwing: a filter that cannot be read must open
 * the list at `fallback`, never take the page down with it.
 */
export function readFilterParam(raw: string | null, fallback: FilterValues = {}): FilterValues {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FilterValues)
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Build a link that opens a list surface with a filter already applied.
 *
 * `path` may already carry its own params (`/finance?tab=doc_orders`) and they are preserved, so
 * one string states both which tab to open and what that tab should be showing.
 */
export function filterUrl(path: string, urlKey: string, values: FilterValues): string {
  const [base, existing = ''] = path.split('?');
  const p = new URLSearchParams(existing);
  const clean = cleanFilterValues(values);
  if (Object.keys(clean).length === 0) p.delete(urlKey);
  else p.set(urlKey, JSON.stringify(clean));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
