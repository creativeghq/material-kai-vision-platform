import React from 'react';
import { AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { compact } from './seoMetrics';
import { statusPresentation } from './seoMetrics';
import { shareOf, type GaBreakdown, type GaBreakdownRow } from './gaBreakdowns';
import { Sparkline } from './Sparkline';

export interface GaColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (row: GaBreakdownRow, b: GaBreakdown) => React.ReactNode;
}

/** The column every breakdown is ranked by. */
export const sessionsColumn: GaColumn = {
  key: 'sessions',
  label: 'Sessions',
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
  render: (row) => {
    const v = row[key] as number | null;
    return <span className="tabular-nums">{v == null ? '—' : fmt(v)}</span>;
  },
});

export const trendColumn: GaColumn = {
  key: 'series',
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

/**
 * One breakdown, with its own verdict. A collector that FAILED renders as an explanation, never as
 * an empty table — emptiness reads as "nobody visited", which is a different claim entirely.
 */
export const GaBreakdownTable: React.FC<{
  title: string;
  description?: string;
  breakdown: GaBreakdown;
  /** The first column — the thing being ranked. */
  head: string;
  renderName: (row: GaBreakdownRow) => React.ReactNode;
  columns: GaColumn[];
  limit?: number;
  children?: React.ReactNode;
}> = ({ title, description, breakdown, head, renderName, columns, limit = 25, children }) => {
  const rows = breakdown.rows.slice(0, limit);
  const failed = breakdown.status === 'collector_failed';
  const present = statusPresentation(breakdown.status);

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {breakdown.status !== 'ok' && (
          <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            failed
              ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {failed && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>
              <span className="font-medium">{present.placeholder}</span>
              {' — '}
              {breakdown.note || present.explain}
            </span>
          </div>
        )}

        {children}

        {breakdown.status === 'ok' && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{head}</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.align === 'left' ? undefined : 'text-right'}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.value}>
                    <TableCell className="max-w-[320px]">{renderName(row)}</TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.align === 'left' ? undefined : 'text-right'}>
                        {c.render(row, breakdown)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {breakdown.status === 'ok' && breakdown.row_count > rows.length && (
          <p className="text-xs text-muted-foreground">
            Showing the top {rows.length} of {breakdown.row_count.toLocaleString()}. Shares are of the rows shown.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
