/**
 * Filter state for a list surface. Keeps the values bag, exposes a memoized filtered array,
 * and (optionally) mirrors the state into the URL so a filtered view is shareable and
 * survives a refresh — the same reason Finance already drives its tab off `?tab=`.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyFilters, countActive, type FilterGroupDef, type FilterValues } from './types';

export interface UseFiltersOptions {
  /** Seed values applied on first render. */
  initial?: FilterValues;
  /**
   * When set, the values bag is serialized into `?<paramKey>=` as JSON. Omit for surfaces
   * where a stale link would be confusing (e.g. modals).
   */
  urlKey?: string;
}

export function useFilters<T>(rows: T[], groups: FilterGroupDef[], options: UseFiltersOptions = {}) {
  const { initial = {}, urlKey } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState<FilterValues>(initial);

  const values = useMemo<FilterValues>(() => {
    if (!urlKey) return local;
    const raw = searchParams.get(urlKey);
    if (!raw) return initial;
    try { return JSON.parse(raw) as FilterValues; } catch { return initial; }
    // `initial` is a literal at most call sites; keying on the serialized param is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, searchParams, local]);

  const setValues = useCallback((next: FilterValues) => {
    // Drop cleared keys so the URL (and the active count) never carry empty noise.
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
    if (!urlKey) { setLocal(clean); return; }
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (Object.keys(clean).length === 0) p.delete(urlKey);
      else p.set(urlKey, JSON.stringify(clean));
      return p;
    }, { replace: true });
  }, [urlKey, setSearchParams]);

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
