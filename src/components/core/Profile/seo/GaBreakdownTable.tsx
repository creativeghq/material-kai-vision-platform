import React, { useMemo, useState } from 'react';
import { AlertTriangle, SearchX } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubToolbar } from '@/components/core/hub/HubToolbar';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { statusPresentation } from './seoMetrics';
import {
  GA_NAME_SORT, GA_STORED_WINDOW, searchGaRows, sortGaRows,
  type GaBreakdown, type GaBreakdownRow, type GaSort, type GaWindow,
} from './gaBreakdowns';
import { GA_BREAKDOWNS, type GaBreakdownKey } from './gaVocabulary';
import { GaRowsTable, GaWindowControl, TREND_KEY, type GaColumn } from './gaColumns';
import { GaDrillSheet } from './GaDrillSheet';
import { useDebounced, useGaSlice, useGaWindow } from './useGaBreakdowns';

export { num, sessionsColumn, trendColumn, type GaColumn } from './gaColumns';

const LIVE_LIMIT = 50;

const segmentable = (b: GaBreakdown) => b.status !== 'not_supported' && b.status !== 'not_collected';

export function useWindowedBreakdown(
  websiteId: string, dimension: GaBreakdownKey, stored: GaBreakdown, days: GaWindow,
  opts: { search?: string; sort?: GaSort | null; limit?: number } = {},
): { breakdown: GaBreakdown | null; live: boolean; loading: boolean } {
  const metricCols = useMemo(
    () => new Set((GA_BREAKDOWNS.find((b) => b.key === dimension)?.metrics ?? []).map((m) => m.col)),
    [dimension],
  );
  const storedWindow = stored.window_days ?? GA_STORED_WINDOW;
  const truncated = stored.row_count > stored.rows.length;
  const serverSort = opts.sort && metricCols.has(opts.sort.key) ? opts.sort : null;
  const wantLive = segmentable(stored) && (
    days !== storedWindow || (truncated && (!!opts.search || !!serverSort))
  );
  const { data, loading } = useGaSlice(websiteId, wantLive ? {
    dimension,
    days,
    search: opts.search || undefined,
    orderBy: serverSort?.key,
    desc: serverSort ? serverSort.desc : true,
    limit: Math.max(opts.limit ?? 0, LIVE_LIMIT),
  } : null);
  return wantLive ? { breakdown: data, live: true, loading: loading || !data } : { breakdown: stored, live: false, loading: false };
}

/**
 * One breakdown, with its own verdict. A collector that FAILED renders as an explanation, never as
 * an empty table — emptiness reads as "nobody visited", which is a different claim entirely.
 */
export const GaBreakdownTable: React.FC<{
  websiteId: string;
  dimension: GaBreakdownKey;
  title: string;
  description?: string;
  breakdown: GaBreakdown;
  /** The first column — the thing being ranked. */
  head: string;
  renderName: (row: GaBreakdownRow) => React.ReactNode;
  columns: GaColumn[];
  limit?: number;
  children?: React.ReactNode;
}> = ({ websiteId, dimension, title, description, breakdown, head, renderName, columns, limit = 25, children }) => {
  const [days, setDays] = useGaWindow();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GaSort | null>(null);
  const [drill, setDrill] = useState<GaBreakdownRow | null>(null);
  const debounced = useDebounced(search.trim());

  const { breakdown: shown, live, loading } = useWindowedBreakdown(
    websiteId, dimension, breakdown, days, { search: debounced, sort, limit },
  );

  const rows = useMemo(
    () => sortGaRows(dimension, searchGaRows(dimension, shown?.rows ?? [], search), sort).slice(0, limit),
    [dimension, shown, search, sort, limit],
  );

  const status = shown?.status ?? 'ok';
  const failed = status === 'collector_failed';
  const present = statusPresentation(status);
  const searchedEmpty = !!debounced && status === 'no_data';
  const showBand = !loading && status !== 'ok' && !searchedEmpty;
  const cols = live ? columns.filter((c) => c.key !== TREND_KEY) : columns;
  const truncated = !!shown && shown.row_count > shown.rows.length;
  const clientOnlySort = !!sort && sort.key !== GA_NAME_SORT && truncated
    && !(GA_BREAKDOWNS.find((b) => b.key === dimension)?.metrics ?? []).some((m) => m.col === sort.key);

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {segmentable(breakdown) && (
          <div className="overflow-hidden rounded-md border border-hairline">
            <HubToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={`Search ${head.toLowerCase()}`}
              actions={<GaWindowControl value={days} onChange={setDays} />}
              className="border-b-0"
            />
          </div>
        )}

        {showBand && (
          <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            failed
              ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {failed && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>
              <span className="font-medium">{present.placeholder}</span>
              {' — '}
              {shown?.note || present.explain}
            </span>
          </div>
        )}

        {children}

        {!showBand && (
          <GaRowsTable
            rows={rows}
            breakdown={shown ?? breakdown}
            head={head}
            renderName={renderName}
            columns={cols}
            sort={sort}
            onSort={setSort}
            onRowClick={setDrill}
            loading={loading}
            empty={
              <HubEmptyState
                variant="filtered"
                icon={SearchX}
                title={`Nothing matches “${search}”`}
                action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}
              />
            }
            footer={shown && !loading ? (
              <span>
                Last {shown.window_days ?? days} days{live ? ', asked of Google live' : ''}.
                {' '}
                {shown.row_count > rows.length
                  ? `Showing ${rows.length} of ${shown.row_count.toLocaleString()}. `
                  : ''}
                Shares are of the {shown.rows.length} rows loaded.
                {clientOnlySort ? ' Sorted within those rows.' : ''}
                {' '}Click a row to break it down further.
              </span>
            ) : undefined}
          />
        )}
      </CardContent>

      {drill && (
        <GaDrillSheet
          key={`${drill.value}\u0000${drill.label ?? ''}`}
          websiteId={websiteId}
          root={{ dimension, row: drill }}
          days={days}
          onDaysChange={setDays}
          onClose={() => setDrill(null)}
        />
      )}
    </Card>
  );
};
