/** The whole expense picture, in the place the documents are. */
import React from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { formatMoney } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';
import { inboundService } from '@/modules/finance/services/inboundService';
import {
  expenseKindCopy, vatTreatmentCopy, originLabel, sortExpenseSegments, totalExpenseSegments,
  type ExpenseSegmentRow,
} from '@/modules/finance/expenseSegments';

const YEARS = 4;

function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export const ExpenseSegmentsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const thisYear = Number(todayLocalISO().slice(0, 4));
  const [year, setYear] = React.useState(thisYear);
  const [rows, setRows] = React.useState<ExpenseSegmentRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    const { from, to } = yearRange(year);
    try {
      setRows(await inboundService.expenseSegments(workspaceId, from, to));
      setError(null);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workspaceId, year]);

  React.useEffect(() => { void load(); }, [load]);

  const segments = rows ? sortExpenseSegments(rows) : [];
  const totals = rows ? totalExpenseSegments(rows) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-hairline px-5 py-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Every expense, by kind
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Until a document is booked it is in no report, no P&amp;L and no VAT return. Your own
            entries are the exception — they count from the document, because they can never
            become a bill.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger aria-label="Year" className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: YEARS }, (_, i) => thisYear - i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <p className="px-5 py-3 text-xs text-amber-800 dark:text-amber-300">
            The breakdown could not be read — {error}. That is not a statement that nothing arrived.
          </p>
        )}

        {!error && rows && rows.length === 0 && (
          <p className="px-5 py-6 text-xs text-muted-foreground">
            No document was filed against your ΑΦΜ in {year}.
          </p>
        )}

        {!error && totals && segments.length > 0 && (
          <>
            <div className="grid gap-3 border-b border-hairline bg-surface-sunken px-5 py-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Received</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(totals.net, 'EUR')}</p>
                <p className="text-[11px] text-muted-foreground">{totals.docs.toLocaleString()} documents</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">In the P&amp;L</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(totals.inPnlNet, 'EUR')}</p>
                <p className="text-[11px] text-muted-foreground">booked, plus your own entries</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Waiting on you</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${totals.waitingNet > 0 ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                  {formatMoney(totals.waitingNet, 'EUR')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {totals.waitingDocs.toLocaleString()} to book
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Not an expense</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(totals.notExpenseNet, 'EUR')}</p>
                <p className="text-[11px] text-muted-foreground">credit notes, delivery notes, receipts</p>
              </div>
            </div>

            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-5 py-2">Kind</th>
                    <th className="px-3 py-2">VAT</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">VAT amount</th>
                    <th className="px-3 py-2 text-right">Docs</th>
                    <th className="px-3 py-2 text-right">In books</th>
                    <th className="px-3 py-2 text-right">Waiting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {segments.map((r) => {
                    const kind = expenseKindCopy(r.expense_kind);
                    const vat = vatTreatmentCopy(r.vat_treatment);
                    return (
                      <tr key={`${r.expense_kind}-${r.vat_treatment}-${r.origin}`}>
                        <td className="px-5 py-2">
                          <span className="block font-medium">{kind.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{kind.detail}</span>
                        </td>
                        <td className="px-3 py-2" title={vat.detail}>{vat.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">{originLabel(r.origin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.net, 'EUR')}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {r.vat === 0 ? '—' : formatMoney(r.vat, 'EUR')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.docs}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {!r.in_pnl ? '—' : r.expense_kind === 'entity' ? r.docs : r.booked_docs}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.waiting_docs > 0 && r.in_pnl ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                          {!r.in_pnl || r.expense_kind === 'entity' ? '—' : r.waiting_docs}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
