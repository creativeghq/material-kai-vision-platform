import React from 'react';
import { ChevronRight } from 'lucide-react';

import { HubDataTable, type HubColumn, type HubSort } from '@/components/core/hub/HubDataTable';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { formatMoney } from '@/utils/decimal';
import { compact } from './seoMetrics';
import {
  GA_NAME_SORT, GA_WINDOWS, type GaWindow, countryFlag, countryName, formatDuration, prettyPath, shareOf,
  type GaBreakdown, type GaBreakdownRow, type GaSort,
} from './gaBreakdowns';
import { GA_BREAKDOWNS, type GaBreakdownKey } from './gaVocabulary';
import { Sparkline } from './Sparkline';

export interface GaColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortKey?: keyof GaBreakdownRow;
  render: (row: GaBreakdownRow, b: GaBreakdown) => React.ReactNode;
}

export const sessionsColumn: GaColumn = {
  key: 'sessions',
  label: 'Sessions',
  sortKey: 'sessions',
  render: (row, b) => {
    const pct = shareOf(row, b);
    return (
      <div className="flex items-center justify-end gap-2">
        {pct != null && (
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-sm bg-surface-sunken sm:block" aria-hidden="true">
            <span className="block h-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
          </span>
        )}
        <span className="tabular-nums">{row.sessions?.toLocaleString() ?? '—'}</span>
        {pct != null && <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>}
      </div>
    );
  },
};

export const num = (key: keyof GaBreakdownRow, label: string, fmt: (n: number) => string = compact): GaColumn => ({
  key: String(key),
  label,
  sortKey: key,
  render: (row) => {
    const v = row[key] as number | null;
    return <span className="tabular-nums">{v == null ? '—' : fmt(v)}</span>;
  },
});

export const TREND_KEY = 'series';

export const trendColumn: GaColumn = {
  key: TREND_KEY,
  label: 'Trend',
  render: (row) => {
    const pts = (row.series ?? []).map((p) => p.v).filter((v): v is number => v != null);
    if (pts.length < 2) return <span className="text-muted-foreground">—</span>;
    return (
      <Sparkline
        points={pts}
        className="ml-auto h-6 w-24"
        ariaLabel={`${row.value} sessions over the period`}
      />
    );
  },
};

const METRIC_COLUMN: Record<string, () => GaColumn> = {
  sessions: () => sessionsColumn,
  active_users: () => num('active_users', 'Users'),
  new_users: () => num('new_users', 'New'),
  engaged_sessions: () => num('engaged_sessions', 'Engaged'),
  screen_page_views: () => num('screen_page_views', 'Views'),
  event_count: () => num('event_count', 'Count'),
  conversions: () => num('conversions', 'Conv.'),
  total_revenue: () => num('total_revenue', 'Revenue', (n) => formatMoney(n)),
  engagement_secs: () => num('secs_per_session', 'Avg. time', (n) => formatDuration(n)),
  items_viewed: () => num('items_viewed', 'Viewed'),
  items_added_to_cart: () => num('items_added_to_cart', 'Added'),
  items_purchased: () => num('items_purchased', 'Bought'),
  ad_cost: () => num('ad_cost', 'Cost', (n) => formatMoney(n)),
  ad_clicks: () => num('ad_clicks', 'Clicks'),
  ad_impressions: () => num('ad_impressions', 'Impr.'),
  roas: () => num('roas', 'ROAS', (n) => `${n.toFixed(2)}×`),
};

export function gaColumnsFor(key: GaBreakdownKey): GaColumn[] {
  const spec = GA_BREAKDOWNS.find((b) => b.key === key);
  const seen = new Set<string>();
  const out: GaColumn[] = [];
  for (const m of spec?.metrics ?? []) {
    if (seen.has(m.ga) || !METRIC_COLUMN[m.col]) continue;
    seen.add(m.ga);
    out.push(METRIC_COLUMN[m.col]());
  }
  return out;
}

export const GaName: React.FC<{ dimension: GaBreakdownKey; row: GaBreakdownRow }> = ({ dimension, row }) => {
  switch (dimension) {
    case 'country':
      return (
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{countryFlag(row.value)}</span>
          <span className="truncate">{countryName(row.value, row.label)}</span>
        </span>
      );
    case 'page':
      return (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.label || prettyPath(row.value)}</span>
          {row.label && <span className="truncate text-xs text-muted-foreground">{prettyPath(row.value)}</span>}
        </span>
      );
    case 'landing_page':
      return <span className="block truncate">{prettyPath(row.value)}</span>;
    case 'event':
    case 'hostname':
      return <span className="block truncate font-mono text-xs">{row.value}</span>;
    case 'source':
      return (
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{row.value}</span>
          {row.label && <span className="shrink-0 text-xs text-muted-foreground">/ {row.label}</span>}
        </span>
      );
    case 'city':
    case 'item':
    case 'ads_campaign':
      return (
        <span className="flex items-center gap-2">
          <span className="truncate">{row.value}</span>
          {row.label && <span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>}
        </span>
      );
    default:
      return <span className="block truncate capitalize">{row.value}</span>;
  }
};

const WINDOW_OPTIONS = GA_WINDOWS.map((d) => ({ value: String(d) as `${GaWindow}`, label: `${d}d`, title: `Last ${d} days` }));

export const GaWindowControl: React.FC<{ value: GaWindow; onChange: (w: GaWindow) => void }> = ({ value, onChange }) => (
  <HubSegmented
    aria-label="Date range"
    options={WINDOW_OPTIONS}
    value={String(value) as `${GaWindow}`}
    onChange={(v) => onChange(Number(v) as GaWindow)}
  />
);

export const gaRowId =(row: GaBreakdownRow) => `${row.value}\u0000${row.label ?? ''}`;

export const GaRowsTable: React.FC<{
  rows: GaBreakdownRow[];
  breakdown: GaBreakdown;
  head: string;
  renderName: (row: GaBreakdownRow) => React.ReactNode;
  columns: GaColumn[];
  sort: GaSort | null;
  onSort: (s: GaSort) => void;
  onRowClick?: (row: GaBreakdownRow) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ rows, breakdown, head, renderName, columns, sort, onSort, onRowClick, loading, empty, footer }) => {
  const hubColumns: HubColumn<GaBreakdownRow>[] = [
    {
      id: GA_NAME_SORT,
      header: head,
      sortable: true,
      cell: (row) => <div className="max-w-[320px]">{renderName(row)}</div>,
    },
    ...columns.map((c): HubColumn<GaBreakdownRow> => ({
      id: c.sortKey ? String(c.sortKey) : c.key,
      header: c.label,
      align: c.align ?? 'right',
      sortable: !!c.sortKey,
      cell: (row) => c.render(row, breakdown),
    })),
  ];
  if (onRowClick) {
    hubColumns.push({
      id: '__drill',
      header: <span className="sr-only">Drill down</span>,
      align: 'right',
      width: 'w-8',
      cell: (row) => (
        <button
          type="button"
          aria-label="Break this row down further"
          onClick={(e) => { e.stopPropagation(); onRowClick(row); }}
          className="rounded-xs p-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ),
    });
  }
  const hubSort: HubSort | undefined = sort ? { columnId: sort.key, direction: sort.desc ? 'desc' : 'asc' } : undefined;

  return (
    <HubDataTable
      rows={rows}
      columns={hubColumns}
      rowId={gaRowId}
      onRowClick={onRowClick}
      sort={hubSort}
      onSortChange={(s) => {
        const fresh = s.columnId !== sort?.key;
        onSort({ key: s.columnId, desc: fresh ? s.columnId !== GA_NAME_SORT : s.direction === 'desc' });
      }}
      loading={loading}
      empty={empty}
      footer={footer}
    />
  );
};
