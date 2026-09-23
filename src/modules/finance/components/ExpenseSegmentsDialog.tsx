/** The whole expense picture, behind one button, in the place the documents are. */
import React from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { formatMoney } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';
import { inboundService } from '@/modules/finance/services/inboundService';
import {
  expenseKindCopy, vatTreatmentCopy, originLabel, sortExpenseSegments, totalExpenseSegments,
  byOrigin, type ExpenseSegmentRow,
} from '@/modules/finance/expenseSegments';

const YEARS = 4;

export const ExpenseSegmentsDialog: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const thisYear = Number(todayLocalISO().slice(0, 4));
  const [open, setOpen] = React.useState(false);
  const [year, setYear] = React.useState(thisYear);
  const [rows, setRows] = React.useState<ExpenseSegmentRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      setRows(await inboundService.expenseSegments(workspaceId, `${year}-01-01`, `${year}-12-31`));
      setError(null);
    } catch (e) {
      // Kept null: an empty table under an error strip reads as "nothing arrived this year".
      setRows(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workspaceId, year]);

  React.useEffect(() => { void load(); }, [load]);

  const segments = rows ? sortExpenseSegments(rows) : [];
  const totals = rows ? totalExpenseSegments(rows) : null;
  const origins = rows ? byOrigin(rows) : [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9">
        <Inbox className="mr-1.5 h-3.5 w-3.5" /> Every expense, by kind
        {totals && totals.waitingDocs > 0 && (
          <Badge variant="warning" className="ml-2">{totals.waitingDocs.toLocaleString()} to book</Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Every expense, by kind</DialogTitle>
            <DialogDescription>
              Until a document is booked it is in no report, no P&amp;L and no VAT return. Your own
              entries are the exception — they count from the document, because they can never
              become a bill.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-2">
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

          {error && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              The breakdown could not be read — {error}. That is not a statement that nothing arrived.
            </p>
          )}

          {!error && rows && rows.length === 0 && (
            <p className="py-6 text-xs text-muted-foreground">
              No document was filed against your ΑΦΜ in {year}.
            </p>
          )}

          {!error && totals && segments.length > 0 && (
            <>
              <div className="grid gap-3 rounded-md border border-hairline bg-surface-sunken p-4 sm:grid-cols-4">
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
                  <p className="text-[11px] text-muted-foreground">{totals.waitingDocs.toLocaleString()} to book</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Not an expense</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(totals.notExpenseNet, 'EUR')}</p>
                  <p className="text-[11px] text-muted-foreground">credit notes, delivery notes, receipts</p>
                </div>
              </div>

              {origins.length > 0 && (
                <div className="rounded-md border border-hairline p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total expenses, by where they came from
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
                    {origins.map((o) => (
                      <div key={o.origin}>
                        <p className="text-xs text-muted-foreground">{o.label}</p>
                        <p className="text-base font-semibold tabular-nums">{formatMoney(o.net, 'EUR')}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {o.docs.toLocaleString()} document{o.docs === 1 ? '' : 's'}
                        </p>
                      </div>
                    ))}
                    <div className="border-l border-hairline pl-8">
                      <p className="text-xs font-medium">All expenses</p>
                      <p className="text-base font-semibold tabular-nums">
                        {formatMoney(origins.reduce((s, o) => s + o.net, 0), 'EUR')}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {origins.reduce((s, o) => s + o.docs, 0).toLocaleString()} documents
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="table-scroll max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken">
                    <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                      <th className="px-3 py-2">Kind</th>
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
                          <td className="px-3 py-2">
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
        </DialogContent>
      </Dialog>
    </>
  );
};
