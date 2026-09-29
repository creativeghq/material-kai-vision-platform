import React from 'react';

import type { HubFilterOption } from './HubToolbar';
import type { HubSort } from './HubDataTable';

type Primitive = string | number | boolean | Date | null | undefined;

export interface HubTableField<Row> {
  id: string;
  /** Value compared when sorting by this column. Omit to make the column unsortable. */
  sortValue?: (row: Row) => Primitive;
  /** Value used to segment rows. Its distinct values become the filter chip's options. */
  filterValue?: (row: Row) => string | null | undefined;
  /** Chip label for the filter. Defaults to the id. */
  filterLabel?: string;
  /** Option label for a raw filter value (e.g. a status slug → its display name). */
  filterOptionLabel?: (value: string) => string;
  /** Text the search box matches against. */
  searchText?: (row: Row) => Primitive;
}

export const HUB_FILTER_ALL = 'all';
const NONE = '__none__';

const isEmpty = (v: Primitive) => v === null || v === undefined || v === '';

function compare(a: NonNullable<Primitive>, b: NonNullable<Primitive>): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Client-side search + segment filters + sort for a list already in memory. `fields` must be stable (module const or useMemo). */
export function useHubTable<Row>(
  rows: readonly Row[],
  fields: readonly HubTableField<Row>[],
  initialSort?: HubSort,
) {
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<HubSort | undefined>(initialSort);
  const [filters, setFilters] = React.useState<Record<string, string>>({});

  const setFilter = React.useCallback((id: string, value: string) => {
    setFilters((f) => ({ ...f, [id]: value }));
  }, []);

  const reset = React.useCallback(() => {
    setSearch('');
    setFilters({});
  }, []);

  const filterOptions = React.useMemo(() => {
    const out: Record<string, HubFilterOption[]> = {};
    for (const f of fields) {
      if (!f.filterValue) continue;
      const seen = new Set<string>();
      let hasNone = false;
      for (const r of rows) {
        const v = f.filterValue(r);
        if (v === null || v === undefined || v === '') hasNone = true;
        else seen.add(v);
      }
      const label = f.filterOptionLabel ?? ((v: string) => v);
      out[f.id] = [
        { value: HUB_FILTER_ALL, label: 'All' },
        ...[...seen]
          .sort((a, b) => label(a).localeCompare(label(b)))
          .map((v) => ({ value: v, label: label(v) })),
        ...(hasNone ? [{ value: NONE, label: 'Not set' }] : []),
      ];
    }
    return out;
  }, [rows, fields]);

  const activeFilterCount =
    Object.values(filters).filter((v) => v && v !== HUB_FILTER_ALL).length + (search.trim() ? 1 : 0);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const searchable = fields.filter((f) => f.searchText);
    let out = rows.filter((r) => {
      for (const f of fields) {
        const want = filters[f.id];
        if (!f.filterValue || !want || want === HUB_FILTER_ALL) continue;
        const v = f.filterValue(r);
        if (want === NONE ? !(v === null || v === undefined || v === '') : v !== want) return false;
      }
      if (!q || searchable.length === 0) return true;
      return searchable.some((f) => String(f.searchText!(r) ?? '').toLowerCase().includes(q));
    });
    const field = sort && fields.find((f) => f.id === sort.columnId);
    if (sort && field?.sortValue) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = field.sortValue!(a);
        const vb = field.sortValue!(b);
        // An absent value sorts last in both directions.
        if (isEmpty(va) || isEmpty(vb)) return Number(isEmpty(va)) - Number(isEmpty(vb));
        return compare(va!, vb!) * dir;
      });
    }
    return out;
  }, [rows, fields, filters, search, sort]);

  const toggleSort = React.useCallback((columnId: string) => {
    setSort((s) =>
      s?.columnId === columnId
        ? { columnId, direction: s.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId, direction: 'asc' },
    );
  }, []);

  return {
    rows: visible,
    total: rows.length,
    search,
    setSearch,
    sort,
    setSort,
    toggleSort,
    filters,
    setFilter,
    filterOptions,
    activeFilterCount,
    reset,
  };
}
