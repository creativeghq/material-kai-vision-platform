import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { formatMoney } from '@/utils/decimal';
import { aadeVerdict, booksVerdict } from '@/modules/finance/pnlStatus';
import type { PnlDayRow, PnlMonthRow } from '@/modules/finance/services/financeService';

type Source = 'books' | 'aade';

const SOURCE_LABEL: Record<Source, string> = { books: 'Your books', aade: 'ΑΑΔΕ book' };

interface MonthCell {
  month: string;
  label: string;
  currency: string;
  income: number | null;
  expenses: number | null;
  net: number | null;
  /** Null when both halves are real. Otherwise the word to render instead of a figure. */
  missing: string | null;
  unbookedDocs: number;
  unbookedNet: number;
}

interface BarCell {
  key: string;
  tick: string;
  range: string;
  currency: string;
  /** Null = this source has no per-day figure for it, so no bar is drawn. */
  income: number | null;
  expenses: number | null;
  missing: string | null;
}

export const pnlBucketDays = (from: string, to: string): number => {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return days <= 45 ? 1 : days <= 100 ? 3 : 7;
};

// LOCAL midnight. As UTC these render the previous day west of Greenwich.
const localDate = (iso: string) => new Date(`${iso}T00:00:00`);
const monthLabel = (iso: string) =>
  localDate(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const dayLabel = (iso: string) =>
  localDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function monthCells(rows: PnlMonthRow[], source: Source, fallbackCcy: string): MonthCell[] {
  return rows.map((r) => {
    if (source === 'books') {
      // A mixed-currency month has no single total, so SQL returns none rather than a sum.
      const verdict = booksVerdict(r.books_status);
      return {
        month: r.period_month, label: monthLabel(r.period_month),
        currency: r.books_currency && r.books_currency !== 'MIXED' ? r.books_currency : fallbackCcy,
        income: verdict.hasFigures ? Number(r.books_income ?? 0) : null,
        expenses: verdict.hasFigures ? Number(r.books_expenses ?? 0) : null,
        net: verdict.hasFigures ? Number(r.books_net ?? 0) : null,
        missing: verdict.hasFigures ? null : verdict.label,
        unbookedDocs: r.unbooked_docs ?? 0, unbookedNet: Number(r.unbooked_net ?? 0),
      };
    }
    const inc = aadeVerdict(r.aade_income_status);
    const exp = aadeVerdict(r.aade_expense_status);
    // A direction we could not read is UNKNOWN; a zero would claim the business had none.
    const missing = !inc.hasFigures || !exp.hasFigures
      ? (!inc.hasFigures ? inc.label : exp.label)
      : null;
    return {
      month: r.period_month, label: monthLabel(r.period_month),
      currency: 'EUR',
      income: missing ? null : Number(r.aade_income_net ?? 0),
      expenses: missing ? null : Number(r.aade_expense_net ?? 0),
      net: missing ? null : (r.aade_net == null ? null : Number(r.aade_net)),
      missing,
      unbookedDocs: r.unbooked_docs ?? 0, unbookedNet: Number(r.unbooked_net ?? 0),
    };
  });
}

function barCells(days: PnlDayRow[], source: Source, fallbackCcy: string): BarCell[] {
  return days.map((d) => {
    const single = d.bucket_start === d.bucket_end;
    const base = {
      key: d.bucket_start,
      tick: single ? String(localDate(d.bucket_start).getDate()) : dayLabel(d.bucket_start),
      range: single
        ? localDate(d.bucket_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : `${dayLabel(d.bucket_start)} – ${dayLabel(d.bucket_end)}`,
    };
    if (source === 'books') {
      const v = booksVerdict(d.books_status);
      return {
        ...base,
        currency: d.books_currency && d.books_currency !== 'MIXED' ? d.books_currency : fallbackCcy,
        income: v.hasFigures ? Number(d.books_income ?? 0) : null,
        expenses: v.hasFigures ? Number(d.books_expenses ?? 0) : null,
        missing: v.hasFigures ? null : v.label,
      };
    }
    const v = aadeVerdict(d.received_status);
    return {
      ...base,
      currency: 'EUR',
      income: null,
      expenses: v.hasFigures ? Number(d.received_net ?? 0) : null,
      missing: v.hasFigures ? null : v.label,
    };
  });
}

interface Props {
  rows: PnlMonthRow[];
  days: PnlDayRow[] | null;
  currency: string;
  loading?: boolean;
}

/**
 * Income against expenses under ONE named source at a time. The source is a toggle rather than
 * a merge: a chart that silently fell back from our documents to the ΑΑΔΕ book would hide the
 * gap between them, which is the one thing this screen exists to show.
 */
export const PnlTrendCard: React.FC<Props> = ({ rows, days, currency, loading }) => {
  const [source, setSource] = useState<Source>('books');
  const data = useMemo(() => monthCells(rows, source, currency), [rows, source, currency]);
  const bars = useMemo(() => barCells(days ?? [], source, currency), [days, source, currency]);
  const max = useMemo(
    () => Math.max(1, ...bars.flatMap((c) => [c.income ?? 0, c.expenses ?? 0])),
    [bars],
  );
  const hasAny = bars.some((c) => (c.income ?? 0) !== 0 || (c.expenses ?? 0) !== 0);
  const totalUnbooked = useMemo(() => data.reduce((a, c) => a + c.unbookedDocs, 0), [data]);
  const span = days?.[0] ? Math.round((Date.parse(days[0].bucket_end) - Date.parse(days[0].bucket_start)) / 86_400_000) + 1 : 1;
  const tickEvery = Math.max(1, Math.ceil(bars.length / 16));

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Monthly P&amp;L
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            {source === 'books'
              ? `Income and expenses ${span === 1 ? 'day by day' : `every ${span} days`}, from your books.`
              : `Expenses ${span === 1 ? 'day by day' : `every ${span} days`}, from documents received at ΑΑΔΕ.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(['books', 'aade'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={source === s ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setSource(s)}
            >
              {SOURCE_LABEL[s]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading && rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Reading the months…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No months in this period.</div>
        ) : (
          <>
            <div className="px-5 pt-4">
              {days === null ? (
                <p className="pb-3 text-xs text-muted-foreground">The day-by-day figures could not be read. The monthly table below is unaffected.</p>
              ) : !hasAny && (
                <p className="pb-3 text-xs text-muted-foreground">
                  {source === 'books'
                    ? 'Nothing has been issued or booked in these days. Switch to the ΑΑΔΕ book to see what was filed.'
                    : 'No documents received at ΑΑΔΕ in these days.'}
                </p>
              )}
              <div className="flex h-36 gap-[3px]">
                {bars.map((c, i) => (
                  <div key={c.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
                    {c.missing ? (
                      <div
                        className="flex w-full flex-1 items-end justify-center border-b border-dashed border-border pb-1 text-[9px] text-muted-foreground"
                        title={`${c.range}: ${c.missing}`}
                      >
                        ?
                      </div>
                    ) : (
                      <div
                        className="flex w-full flex-1 items-end justify-center gap-px"
                        title={[
                          c.range,
                          c.income != null ? `Income ${formatMoney(c.income, c.currency)}` : null,
                          `Expenses ${formatMoney(c.expenses, c.currency)}`,
                        ].filter(Boolean).join('\n')}
                      >
                        {c.income != null && (
                          <div
                            className="w-1/2 max-w-6 rounded-t-sm bg-emerald-600/70 transition-colors group-hover:bg-emerald-600 dark:bg-emerald-500/60 dark:group-hover:bg-emerald-500"
                            style={{ height: c.income ? `${Math.max(1, (c.income / max) * 100)}%` : 0 }}
                          />
                        )}
                        <div
                          className={`${c.income != null ? 'w-1/2' : 'w-3/4'} max-w-6 rounded-t-sm bg-red-600/60 transition-colors group-hover:bg-red-600 dark:bg-red-500/55 dark:group-hover:bg-red-500`}
                          style={{ height: c.expenses ? `${Math.max(1, (c.expenses / max) * 100)}%` : 0 }}
                        />
                      </div>
                    )}
                    <span className="h-3 w-full truncate text-center text-[9px] leading-3 text-muted-foreground">
                      {i % tickEvery === 0 ? c.tick : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[10px] text-muted-foreground">
                {source === 'books' && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-emerald-600/70 dark:bg-emerald-500/60" /> Income
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-red-600/60 dark:bg-red-500/55" /> Expenses
                </span>
                <span className="inline-flex items-center gap-1">? = not read, not zero</span>
                {source === 'aade' && (
                  <span>ΑΑΔΕ reports income only as a month total, so it is in the table, not the bars.</span>
                )}
              </div>
            </div>

            <div className="mt-3 border-t border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">To book</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c) => (
                    <TableRow key={c.month}>
                      <TableCell className="whitespace-nowrap">{c.label}</TableCell>
                      {c.missing ? (
                        <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">{c.missing}</TableCell>
                      ) : (
                        <>
                          <TableCell className="text-right tabular-nums">{formatMoney(c.income, c.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(c.expenses, c.currency)}</TableCell>
                          <TableCell className={`text-right font-medium tabular-nums ${(c.net ?? 0) < 0 ? 'text-red-700 dark:text-red-400' : ''}`}>
                            {formatMoney(c.net, c.currency)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                        {c.unbookedDocs > 0
                          ? `${c.unbookedDocs} · ${formatMoney(c.unbookedNet, 'EUR')}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalUnbooked > 0 && (
              <p className="border-t border-hairline px-5 py-2 text-[11px] text-muted-foreground">
                <strong>To book</strong> is received documents that have not become an expense yet — they are in
                neither the Income nor the Expenses column above.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
