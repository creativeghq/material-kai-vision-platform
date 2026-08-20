/**
 * Filter state for a list surface. Keeps the values bag, exposes a memoized filtered array,
 * and (optionally) mirrors the state into the URL so a filtered view is shareable and
 * survives a refresh — the same reason Finance already drives its tab off `?tab=`.
 *
 * The URL encoding itself lives in `./filterUrl` — shared with every surface that AUTHORS a
 * deep link into a filtered list, so a link and the list that reads it cannot spell the same
 * filter two ways.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyFilters, countActive, type FilterGroupDef, type FilterValues } from './types';
import { cleanFilterValues, readFilterParam } from './filterUrl';

export interface UseFiltersOptions {
  /** Seed values applied on first render (and whenever the URL param is absent). */
  initial?: FilterValues;
  /**
   * When set, the values bag is serialized into `?<paramKey>=` as JSON. Omit for surfaces
   * where a stale link would be confusing (e.g. modals).
   */
  urlKey?: string;
}

export type FilterValuesUpdater = FilterValues | ((prev: FilterValues) => FilterValues);

/**
 * The values half of `useFilters`, without the client-side filtering.
 *
 * For lists that filter on the SERVER (Orders, CRM contacts/companies): they cannot use
 * `applyFilters`, but they still need the same URL contract, or a deep link into them is
 * accepted by the router and then silently ignored by the list.
 */
export function useFilterValues(options: UseFiltersOptions = {}) {
  const { initial = {}, urlKey } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState<FilterValues>(initial);
  // `initial` is a fresh literal at most call sites; hold it in a ref so `setValues` can read it
  // without being re-created on every render.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const values = useMemo<FilterValues>(() => {
    if (!urlKey) return local;
    return readFilterParam(searchParams.get(urlKey), initialRef.current);
  }, [urlKey, searchParams, local]);

  const setValues = useCallback((next: FilterValuesUpdater) => {
    if (!urlKey) {
      setLocal((prev) => cleanFilterValues(typeof next === 'function' ? next(prev) : next));
      return;
    }
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      // Read the CURRENT param inside the updater rather than closing over `values` — two edits
      // in one tick would otherwise both apply to the same stale bag.
      const current = readFilterParam(p.get(urlKey), initialRef.current);
      const clean = cleanFilterValues(typeof next === 'function' ? next(current) : next);
      if (Object.keys(clean).length === 0) p.delete(urlKey);
      else p.set(urlKey, JSON.stringify(clean));
      return p;
    }, { replace: true });
  }, [urlKey, setSearchParams]);

  return { values, setValues };
}

export function useFilters<T>(rows: T[], groups: FilterGroupDef[], options: UseFiltersOptions = {}) {
  const { values, setValues } = useFilterValues(options);

  const filtered = useMemo(() => applyFilters(rows, groups, values), [rows, groups, values]);
  const previewCount = useCallback((v: FilterValues) => applyFilters(rows, groups, v).length, [rows, groups]);

  return {
    values,
    setValues,
    filtered,
    previewCount,
    activeCount: countActive(groups, values),
    reset: useCallback(() => setValues({}), [setValues]),
  };
}
