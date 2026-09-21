import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Inbox, Loader2, PackageCheck } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { bookingStateCopy } from '@/modules/finance/pnlStatus';
import {
  inboundService,
  type InboundBacklogRow,
  type InboundBookableIssuerRow,
} from '@/modules/finance/services/inboundService';

const BATCH = 100;

/** The category this run would file to, or null to book without re-filing. */
const chosenCategory = (row: InboundBookableIssuerRow, choice: Record<string, string>) =>
  (row.issuer_vat ? choice[row.issuer_vat] : undefined) ?? row.learned_category_id ?? null;

/**
 * Whether Book can do anything. The enable test and the act test were different predicates, so a
 * supplier with categories but no issuer-default row got a button whose click did nothing.
 */
function blockedReason(row: InboundBookableIssuerRow, categoryCount: number): string {
  if (!row.issuer_vat) return 'These documents carry no ΑΦΜ — open them in the inbox and book each one.';
  if (categoryCount === 0) return 'Add an expense category first, in Finance → Settings.';
  return 'Pick a category first — otherwise these book as Uncategorized.';
}

function canBookRow(row: InboundBookableIssuerRow, choice: Record<string, string>): boolean {
  // Booking is BY ΑΦΜ. A document without one is booked individually from the inbox.
  if (!row.issuer_vat) return false;
  if (chosenCategory(row, choice)) return true;
  return row.category_pending === 0;
}

interface CategoryOption { id: string; name: string; kind?: string | null; is_system?: boolean | null }

interface Props {
  workspaceId: string;
  categories: CategoryOption[];
  /** Read-only personas see the backlog and the reasons, but cannot book. */
  canBook: boolean;
  /** Called after a booking run so the P&L above re-reads itself. */
  onBooked?: () => void;
}

/**
 * The received documents that have not become expenses, and for the rest, the reason. An expense
 * side that reads low is either a business that spent nothing or an inbox nobody has worked, and
 * those must not look the same. Nothing here runs on its own: every bill comes from an operator
 * pressing Book on a named supplier, in a bounded batch that reports what it did.
 */
export const ExpenseBacklogCard: React.FC<Props> = ({ workspaceId, categories, canBook, onBooked }) => {
  const { toast } = useToast();
  const [backlog, setBacklog] = useState<InboundBacklogRow[]>([]);
  const [issuers, setIssuers] = useState<InboundBookableIssuerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.is_system && (c.kind === 'expense' || c.kind === 'both')),
    [categories],
  );

  const load = useCallback(async (quiet = false) => {
    if (!workspaceId) return;
    if (!quiet) setLoading(true);
    try {
      const [rows, byIssuer] = await Promise.all([
        inboundService.bookingBacklog(workspaceId),
        inboundService.bookableByIssuer(workspaceId),
      ]);
      setBacklog(rows);
      setIssuers(byIssuer);
      setError(null);
    } catch (e) {
      if (!quiet) { setBacklog([]); setIssuers([]); }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage((p) => clampPage(p, issuers.length)); }, [issuers.length]);

  const bookable = backlog.find((b) => b.booking_state === 'bookable');
  const others = useMemo(
    () => backlog.filter((b) => b.booking_state !== 'bookable' && b.booking_state !== 'booked'),
    [backlog],
  );
  const booked = backlog.find((b) => b.booking_state === 'booked');

  const book = async (row: InboundBookableIssuerRow) => {
    if (!canBookRow(row, choice)) return;
    const vat = row.issuer_vat as string;
    setBusy(vat);
    try {
      // Null is legitimate: the server then books without re-filing.
      const res = await inboundService.bookIssuer(workspaceId, vat, {
        categoryId: chosenCategory(row, choice), limit: BATCH,
      });
      const parts = [`${res.booked} booked`];
      if (res.booked_total) parts.push(formatMoney(res.booked_total, 'EUR'));
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      if (res.failed) parts.push(`${res.failed} failed`);
      if (res.remaining) parts.push(`${res.remaining} still waiting`);
      toast({
        // A run that booked nothing must not read as done.
        title: res.booked > 0
          ? `Booked ${res.booked} document${res.booked === 1 ? '' : 's'} to Expenses`
          : 'Nothing was booked',
        description: [parts.join(' · '), res.first_error].filter(Boolean).join(' — '),
        variant: res.booked === 0 ? 'destructive' : undefined,
      });
      await load(true);
      onBooked?.();
    } catch (e) {
      toast({
        title: 'Could not book these documents',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Waiting to become expenses
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Documents suppliers filed against you in myDATA. Until one is booked it is in no
            report, no P&amp;L and no VAT return.
          </p>
        </div>
        {bookable && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums">{formatMoney(bookable.will_book_total, 'EUR')}</div>
            <div className="text-[11px] text-muted-foreground">{bookable.docs.toLocaleString()} documents</div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
            <span>Could not read the inbox — <span className="opacity-80">{error}</span>.</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the inbox…
          </div>
        ) : issuers.length === 0 ? (
          <HubEmptyState
            icon={PackageCheck}
            // A failed read cleared the rows and announced an empty inbox over 1,705 documents.
            title={error
              ? 'The inbox could not be read'
              : backlog.length === 0 ? 'Nothing has been filed against you' : 'Every document is accounted for'}
            description={
              error
                ? 'This is a failed read, not an empty inbox — retry above, or open it directly.'
                : backlog.length === 0
                  ? 'Once suppliers file invoices against your ΑΦΜ they arrive here, ready to book as expenses.'
                  : `${booked?.docs ?? 0} booked. Everything else is a document type that is not an expense — see the breakdown below.`
            }
            action={
              <Link to={financeTabUrl(FINANCE_TAB.expenseSuppliers)}>
                <Button variant="outline">Open the expenses inbox</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr className="border-b border-hairline">
                    <th className="px-4 py-2 text-left">Supplier</th>
                    <th className="px-4 py-2 text-right">Docs</th>
                    <th className="px-4 py-2 text-right">Will add</th>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    {canBook && <th className="px-4 py-2 text-right">Book</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginate(issuers, page).map((row) => {
                    const vat = row.issuer_vat;
                    const selected = (vat ? choice[vat] : undefined) ?? row.learned_category_id ?? '';
                    const bookable = canBookRow(row, choice);
                    return (
                      <tr key={vat ?? '__no_vat__'} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{row.issuer_name || vat || 'No ΑΦΜ on the document'}</span>
                            {row.crm_company_id && <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="In your CRM" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {vat ? `ΑΦΜ ${vat}` : 'Booking is by ΑΦΜ — open these in the inbox'}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.docs.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(row.will_book_total, 'EUR')}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-[11px] text-muted-foreground">
                          {row.first_issue_date ? formatDate(row.first_issue_date) : '—'}
                          {row.last_issue_date && row.last_issue_date !== row.first_issue_date && <> → {formatDate(row.last_issue_date)}</>}
                        </td>
                        <td className="px-4 py-2">
                          {row.learned_category_name && row.category_pending === 0 ? (
                            <Badge variant="neutral">{row.learned_category_name}</Badge>
                          ) : canBook && vat && expenseCategories.length > 0 ? (
                            <Select
                              value={selected}
                              onValueChange={(v) => setChoice((c) => ({ ...c, [vat]: v }))}
                            >
                              <SelectTrigger className="h-8 w-44 text-xs">
                                <SelectValue placeholder={row.learned_category_name ?? 'Pick a category'} />
                              </SelectTrigger>
                              <SelectContent>
                                {expenseCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : canBook && vat && expenseCategories.length === 0 ? (
                            // A tooltip the screen offers no way to satisfy is worse than none.
                            <Link to={financeTabUrl(FINANCE_TAB.settings)} className="text-[11px] font-medium text-primary hover:underline">
                              No expense categories yet — add one
                            </Link>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Not filed</span>
                          )}
                        </td>
                        {canBook && (
                          <td className="px-4 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={!bookable || busy === vat}
                              title={bookable ? undefined : blockedReason(row, expenseCategories.length)}
                              onClick={() => void book(row)}
                            >
                              {busy === vat
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : `Book ${Math.min(row.docs, BATCH)}`}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} total={issuers.length} onPageChange={setPage} label="suppliers" />
          </>
        )}

        {/* Without this a document nobody will ever book looks like work outstanding. */}
        {others.length > 0 && (
          <div className="border-t border-hairline px-5 py-3">
            <div className="text-[11px] font-semibold text-muted-foreground">Not bookable, and why</div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {others.map((o) => {
                const copy = bookingStateCopy(o.booking_state);
                return (
                  <li key={o.booking_state} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{copy.label}</div>
                      <div className="text-[11px] leading-relaxed text-muted-foreground">{copy.detail}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs tabular-nums">{o.docs.toLocaleString()}</div>
                      <div className="text-[10px] tabular-nums text-muted-foreground">{formatMoney(o.gross, 'EUR')}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
