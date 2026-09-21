import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { aadeVerdict, booksVerdict } from '@/modules/finance/pnlStatus';
import type { PnlMonthRow } from '@/modules/finance/services/financeService';

type Source = 'books' | 'aade';

const SOURCE_LABEL: Record<Source, string> = { books: 'Your books', aade: 'ΑΑΔΕ book' };

interface MonthCell {
  month: string;
  label: string;
  currency: string;
  income: number | null;
  expenses: number | null;
  net: number | null;
  /** Null when both halves are real. Otherwise the word to render instead of a bar. */
  missing: string | null;
  unbookedDocs: number;
  unbookedNet: number;
}

const monthLabel = (iso: string) =>
  // LOCAL midnight. As UTC this renders the previous month west of Greenwich.
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

function cells(rows: PnlMonthRow[], source: Source, fallbackCcy: string): MonthCell[] {
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
    // A direction we could not read is UNKNOWN; a zero bar would claim the business had none.
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

interface Props {
  rows: PnlMonthRow[];
  currency: string;
  loading?: boolean;
}

/**
 * Income against expenses, month by month, under ONE named source at a time. The source is a
 * toggle rather than a merge: a chart that silently fell back from our documents to the ΑΑΔΕ book
 * would hide the gap between them, which is the one thing this screen exists to show.
 */
export const PnlTrendCard: React.FC<Props> = ({ rows, currency, loading }) => {
  const [source, setSource] = useState<Source>('books');
  const data = useMemo(() => cells(rows, source, currency), [rows, source, currency]);
  const max = useMemo(
    () => Math.max(1, ...data.flatMap((c) => [c.income ?? 0, c.expenses ?? 0])),
    [data],
  );
  const hasAny = data.some((c) => (c.income ?? 0) !== 0 || (c.expenses ?? 0) !== 0);
  const totalUnbooked = useMemo(() => data.reduce((a, c) => a + c.unbookedDocs, 0), [data]);

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Month by month
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Income against expenses, from {SOURCE_LABEL[source]}.
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
              {!hasAny && (
                <p className="pb-3 text-xs text-muted-foreground">
                  {source === 'books'
                    ? 'Nothing has been issued or booked in these months. Switch to the ΑΑΔΕ book to see what was filed.'
                    : 'No figures read from ΑΑΔΕ for these months.'}
                </p>
              )}
              <div className="flex h-32 items-end gap-2">
                {data.map((c) => (
                  <div key={c.month} className="group flex flex-1 flex-col items-center justify-end gap-1">
                    {c.missing ? (
                      <div
                        className="flex w-full flex-1 items-end justify-center border-b border-dashed border-border pb-1 text-[9px] text-muted-foreground"
                        title={c.missing}
                      >
                        ?
                      </div>
                    ) : (
                      <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                        <div
                          className="w-1/2 rounded-t bg-emerald-600/70 transition-colors group-hover:bg-emerald-600 dark:bg-emerald-500/60 dark:group-hover:bg-emerald-500"
                          style={{ height: `${Math.max(1, ((c.income ?? 0) / max) * 100)}%` }}
                          title={`${c.label} income: ${formatMoney(c.income, c.currency)}`}
                        />
                        <div
                          className="w-1/2 rounded-t bg-red-600/60 transition-colors group-hover:bg-red-600 dark:bg-red-500/55 dark:group-hover:bg-red-500"
                          style={{ height: `${Math.max(1, ((c.expenses ?? 0) / max) * 100)}%` }}
                          title={`${c.label} expenses: ${formatMoney(c.expenses, c.currency)}`}
                        />
                      </div>
                    )}
                    <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                      {c.label.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 pt-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-600/70 dark:bg-emerald-500/60" /> Income
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-red-600/60 dark:bg-red-500/55" /> Expenses
                </span>
                <span className="inline-flex items-center gap-1">? = not read, not zero</span>
              </div>
            </div>

            <div className="table-scroll mt-3 border-t border-hairline">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr className="border-b border-hairline">
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Expenses</th>
                    <th className="px-4 py-2 text-right">Net</th>
                    <th className="px-4 py-2 text-right">To book</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.month} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{c.label}</td>
                      {c.missing ? (
                        <td colSpan={3} className="px-4 py-2 text-right text-xs text-muted-foreground">{c.missing}</td>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.income, c.currency)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.expenses, c.currency)}</td>
                          <td className={`px-4 py-2 text-right font-medium tabular-nums ${(c.net ?? 0) < 0 ? 'text-red-700 dark:text-red-400' : ''}`}>
                            {formatMoney(c.net, c.currency)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {c.unbookedDocs > 0
                          ? `${c.unbookedDocs} · ${formatMoney(c.unbookedNet, 'EUR')}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
