import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, SearchX } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { HubToolbar } from '@/components/core/hub/HubToolbar';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { statusPresentation } from './seoMetrics';
import {
  EMPTY_BREAKDOWN, GA_DIMENSION_NOUN, GA_NAME_SORT, drillTargets, gaRowText, searchGaRows, sortGaRows,
  type GaBreakdownRow, type GaDrillFilter, type GaSort, type GaWindow,
} from './gaBreakdowns';
import { GA_BREAKDOWN_KEYS, type GaBreakdownKey } from './gaVocabulary';
import { GaName, GaRowsTable, GaWindowControl, gaColumnsFor } from './gaColumns';
import { useDebounced, useGaSlice } from './useGaBreakdowns';

const DRILL_LIMIT = 100;

function nextTarget(from: GaBreakdownKey, crumbs: GaDrillFilter[]): GaBreakdownKey | null {
  const used = crumbs.map((c) => c.dimension);
  return drillTargets(from, used)[0] ?? GA_BREAKDOWN_KEYS.find((k) => !used.includes(k)) ?? null;
}

export const GaDrillSheet: React.FC<{
  websiteId: string;
  root: { dimension: GaBreakdownKey; row: GaBreakdownRow };
  days: GaWindow;
  onDaysChange: (w: GaWindow) => void;
  onClose: () => void;
}> = ({ websiteId, root, days, onDaysChange, onClose }) => {
  const [crumbs, setCrumbs] = useState<GaDrillFilter[]>([
    { dimension: root.dimension, value: root.row.value, label: root.row.label },
  ]);
  const [target, setTarget] = useState<GaBreakdownKey | null>(() => nextTarget(root.dimension, crumbs));
  const [sort, setSort] = useState<GaSort | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());

  const used = crumbs.map((c) => c.dimension);
  const last = crumbs[crumbs.length - 1];
  const suggested = drillTargets(last.dimension, used);
  const others = GA_BREAKDOWN_KEYS.filter((k) => !used.includes(k) && !suggested.includes(k));

  const serverSort = sort && sort.key !== GA_NAME_SORT && sort.key !== 'secs_per_session' ? sort : null;
  const { data, loading } = useGaSlice(websiteId, target ? {
    dimension: target,
    filters: crumbs,
    days,
    limit: DRILL_LIMIT,
    search: debounced || undefined,
    orderBy: serverSort?.key,
    desc: serverSort ? serverSort.desc : true,
  } : null);

  const rows = useMemo(
    () => (data && target ? sortGaRows(target, searchGaRows(target, data.rows, search), sort) : []),
    [data, target, search, sort],
  );

  const reset = (next: GaDrillFilter[], dim: GaBreakdownKey | null) => {
    setCrumbs(next);
    setTarget(dim);
    setSort(null);
    setSearch('');
  };

  const deeper = (row: GaBreakdownRow) => {
    if (!target) return;
    const next = [...crumbs, { dimension: target, value: row.value, label: row.label }];
    reset(next, nextTarget(target, next));
  };

  const failed = data?.status === 'collector_failed';
  const showBand = data && data.status !== 'ok' && !(debounced && data.status === 'no_data');
  const canGoDeeper = !!target && crumbs.length + 1 < GA_BREAKDOWN_KEYS.length;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{gaRowText(root.dimension, root.row)}</SheetTitle>
          <SheetDescription>
            Last {days} days, asked of Google Analytics live. Click a row to go one level deeper.
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Drill path" className="mt-4 flex flex-wrap items-center gap-1 text-xs">
          {crumbs.map((c, i) => {
            const text = `${GA_DIMENSION_NOUN[c.dimension]}: ${gaRowText(c.dimension, { value: c.value, label: c.label ?? null })}`;
            const current = i === crumbs.length - 1;
            return (
              <React.Fragment key={`${c.dimension}-${i}`}>
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                {current ? (
                  <span className="max-w-[260px] truncate font-semibold" aria-current="location">{text}</span>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto max-w-[260px] truncate p-0 text-xs"
                    onClick={() => { const next = crumbs.slice(0, i + 1); reset(next, nextTarget(c.dimension, next)); }}
                  >
                    {text}
                  </Button>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="mt-4 overflow-hidden rounded-md border border-hairline">
          <HubToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search this slice"
            filters={
              <Select
                value={target ?? undefined}
                onValueChange={(v) => { setTarget(v as GaBreakdownKey); setSort(null); setSearch(''); }}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Break down by">
                  <SelectValue placeholder="Break down by…" />
                </SelectTrigger>
                <SelectContent>
                  {[...suggested, ...others].map((k) => (
                    <SelectItem key={k} value={k}>By {GA_DIMENSION_NOUN[k].toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={<GaWindowControl value={days} onChange={onDaysChange} />}
            className="border-b-0"
          />
        </div>

        {showBand && data && !loading && (
          <div className={`mt-3 flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            failed
              ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {failed && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>
              <span className="font-medium">{statusPresentation(data.status).placeholder}</span>
              {' — '}
              {data.note || statusPresentation(data.status).explain}
            </span>
          </div>
        )}

        {target && (loading || !showBand) && (
          <div className="mt-3">
            <GaRowsTable
              rows={rows}
              breakdown={data ?? EMPTY_BREAKDOWN}
              head={GA_DIMENSION_NOUN[target]}
              renderName={(row) => <GaName dimension={target} row={row} />}
              columns={gaColumnsFor(target)}
              sort={sort}
              onSort={setSort}
              onRowClick={canGoDeeper ? deeper : undefined}
              loading={loading}
              empty={search ? (
                <HubEmptyState
                  variant="filtered"
                  icon={SearchX}
                  title="Nothing in this slice matches"
                  action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}
                />
              ) : (
                <span className="text-sm text-muted-foreground">Google Analytics had no rows for this slice.</span>
              )}
              footer={data && data.status === 'ok' ? (
                <span>
                  {data.row_count > data.rows.length
                    ? `Top ${data.rows.length} of ${data.row_count.toLocaleString()} rows. `
                    : `${data.rows.length} rows. `}
                  Shares are of the rows loaded.
                </span>
              ) : undefined}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
