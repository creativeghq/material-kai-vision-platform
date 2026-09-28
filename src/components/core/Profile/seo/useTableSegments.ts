import { useMemo, useState } from 'react';

import {
  nextSort,
  segmentOptions,
  type TableSegment,
  type TableSort,
} from '@/components/core/ui/table-column-header';

type SortValue = number | string | null | undefined;

export interface FacetSpec<T> {
  valueOf: (row: T) => string | null | undefined;
  label: string;
  labels?: Record<string, string>;
  order?: readonly string[];
}

interface Options<T, K extends string, F extends string> {
  rows: T[];
  searchText?: (row: T) => (string | null | undefined)[];
  sorters: Record<K, (row: T) => SortValue>;
  initialSort: TableSort<K>;
  textKeys?: readonly K[];
  facets?: Record<F, FacetSpec<T>>;
}

/** Client-side search + column sort + multi-select column facets over rows already loaded. */
export function useTableSegments<T, K extends string, F extends string = never>({
  rows,
  searchText,
  sorters,
  initialSort,
  textKeys = [],
  facets,
}: Options<T, K, F>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort<K>>(initialSort);
  const [selected, setSelected] = useState<Partial<Record<F, string[]>>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (q && searchText && !searchText(row).some((s) => s?.toLowerCase().includes(q))) return false;
      if (facets) {
        for (const f of Object.keys(facets) as F[]) {
          const sel = selected[f];
          if (sel?.length && !sel.includes(facets[f].valueOf(row) ?? '')) return false;
        }
      }
      return true;
    });
    const get = sorters[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    // Rows with no value sort last in both directions: an absent figure is not the smallest one.
    return filtered.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const na = va == null || va === '';
      const nb = vb == null || vb === '';
      if (na || nb) return na === nb ? 0 : na ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return String(va).localeCompare(String(vb)) * sign;
    });
  }, [rows, query, searchText, facets, selected, sorters, sort]);

  const segment = (f: F): TableSegment => {
    const spec = facets![f];
    return {
      label: spec.label,
      options: segmentOptions(rows, spec.valueOf, spec.labels, spec.order),
      selected: selected[f] ?? [],
      onChange: (vals) => setSelected((prev) => ({ ...prev, [f]: vals })),
    };
  };

  const filterSelect = (f: F, allLabel: string) => {
    const seg = segment(f);
    return {
      label: facets![f].label,
      value: seg.selected[0] ?? 'all',
      options: [{ value: 'all', label: allLabel }, ...seg.options.map((o) => ({ value: o.value, label: `${o.label} (${o.count})` }))],
      onChange: (v: string) => seg.onChange(v === 'all' ? [] : [v]),
    };
  };

  const activeCount =
    (query.trim() ? 1 : 0) +
    Object.values<string[] | undefined>(selected).filter((v) => (v?.length ?? 0) > 0).length;

  const clear = () => {
    setQuery('');
    setSelected({});
  };

  return {
    query,
    setQuery,
    sort,
    setSort,
    onSort: (key: K) => setSort((s) => nextSort(s, key, textKeys)),
    segment,
    filterSelect,
    visible,
    activeCount,
    clear,
  };
}

export const AGE_WINDOW_LABELS: Record<string, string> = {
  '7d': 'Last 7 days',
  '30d': '8–30 days ago',
  '90d': '31–90 days ago',
  older: 'Older than 90 days',
};
export const AGE_WINDOW_ORDER = ['7d', '30d', '90d', 'older'] as const;

export function ageWindowOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (!Number.isFinite(days)) return null;
  return days <= 7 ? '7d' : days <= 30 ? '30d' : days <= 90 ? '90d' : 'older';
}

export const timeOf = (iso: string | null | undefined): number | null =>
  iso ? new Date(iso).getTime() : null;
