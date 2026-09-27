/**
 * Every received document by kind x VAT x origin. Was a modal: eight columns in `max-w-5xl` at
 * 50vh hid the four that say what reached the books, and fitted no phone at all.
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { formatMoney } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';
import { inboundService } from '@/modules/finance/services/inboundService';
import {
  expenseKindCopy, vatTreatmentCopy, originLabel, sortExpenseSegments, totalExpenseSegments,
  byOrigin, byVatTreatment, type ExpenseSegmentRow,
} from '@/modules/finance/expenseSegments';

const YEARS = 4;

export const ExpenseKindsTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const thisYear = Number(todayLocalISO().slice(0, 4));
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
  const treatments = rows ? byVatTreatment(rows) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-hairline px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Every expense, by kind — {year}</CardTitle>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Until a document is booked it is in no report, no P&amp;L and no VAT return. Your own
                entries are the exception — they count from the document, because they can never
                become a bill.
              </p>
            </div>
            <div className="flex items-center gap-2">
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
          </div>
        </CardHeader>

        {error && (
          <CardContent className="pt-4">
            <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The breakdown could not be read — {error}. That is not a statement that nothing arrived.
            </p>
          </CardContent>
        )}

        {!error && rows && rows.length === 0 && (
          <CardContent className="pt-4">
            <p className="py-6 text-sm text-muted-foreground">
              No document was filed against your ΑΦΜ in {year}.
            </p>
          </CardContent>
        )}

        {!error && totals && segments.length > 0 && (
          <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
                {totals.waitingDocs > 0 && <Badge variant="warning" className="ml-2">action</Badge>}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Not an expense</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(totals.notExpenseNet, 'EUR')}</p>
              <p className="text-[11px] text-muted-foreground">credit notes, delivery notes, receipts</p>
            </div>
          </CardContent>
        )}
      </Card>

      {!error && segments.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-hairline px-5 py-3">
              <CardTitle className="text-sm">By where it came from</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-hairline px-5 py-3">
              <CardTitle className="text-sm">By VAT treatment</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                {treatments.map((t) => (
                  <div key={t.treatment}>
                    <p className="text-xs text-muted-foreground">{t.label}</p>
                    <p className="text-base font-semibold tabular-nums">{formatMoney(t.net, 'EUR')}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.docs.toLocaleString()} document{t.docs === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!error && segments.length > 0 && (
        <Card>
          <CardHeader className="border-b border-hairline px-5 py-3">
            <CardTitle className="text-sm">Every segment</CardTitle>
            <p className="pt-1 text-[11px] text-muted-foreground">
              One row per kind, VAT treatment and origin. <strong>In books</strong> is what reached
              the P&amp;L; <strong>waiting</strong> is what has not.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};
