/**
 * One supplier's received (myDATA) documents — the table, the row actions and the three dialogs
 * they open.
 *
 * Extracted from `PartyInboundDocsCard` so the CRM record and Finance → Expenses by Supplier show
 * the SAME rows with the SAME behaviours. The alternative was a second copy of the action wiring
 * (dismiss, receive to warehouse, record payment, create order, the `ordered` set), which is
 * behaviour, not decoration — and the surfaces would have drifted the first time one of them
 * gained an action.
 *
 * Deliberately chrome-free: no Card, no heading. The host frames it, because one host is a card on
 * a company record and the other is a modal opened off a supplier row.
 *
 * A row OPENS — it does not navigate. Every dialog here (preview, receive, record payment, new
 * order) stacks on top of the host and leaves it mounted, so the errand runs without the operator
 * losing the list, the page they were on, or a form they had half filled in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { inboundOutcomes } from '@/modules/finance/components/inboundStatus';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import { InboundDocActionsMenu } from '@/modules/finance/components/InboundDocActionsMenu';
import { InboundDocPreviewDialog } from '@/modules/finance/components/InboundDocPreviewDialog';
import { ReceiveToWarehouseDialog } from '@/modules/finance/components/ReceiveToWarehouseDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewOrderModal } from '@/modules/finance/components/OrdersPanel';
import { orderLinesFromDoc, docsWithOrders } from '@/modules/finance/utils/inboundToOrder';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate } from '@/utils/datetime';
import { inboundDocumentNumber, invoicedTotal, isReverseCharged, selfAccountedVat } from '@/modules/finance/utils/inboundProvenance';

/** What the host needs to describe the list it is framing, without re-fetching it. */
export interface SupplierInboundCounts {
  /** Documents matching the CURRENT date window, as counted by the DB — not by the page. */
  total: number;
  /** How many of them are loaded here. Lower than `total` only when the cap bit. */
  loaded: number;
  /** Loaded documents that have not become an expense — so they reach neither Payables nor P&L. */
  notInBooks: number;
  /**
   * A date window is in force, so `total` is a count of the WINDOW and not of the supplier.
   * A host that hides itself on `total === 0` must read this, or narrowing to an empty month
   * makes the whole panel disappear as though the supplier had never sent anything.
   */
  windowed: boolean;
}

export const SupplierInboundDocs: React.FC<{
  workspaceId: string;
  /** The supplier's ΑΦΜ — the only thing that ties a received document to them. */
  vatNumber: string | null | undefined;
  /** Their CRM company, when they have one. Absent → the row menu offers adding them. */
  companyId?: string | null;
  readOnly?: boolean;
  /** The supplier's first/last issue date, when the host already knows them — used to bound the
   *  date pickers and to say what "everything" would be. Purely a hint; absent is fine. */
  spanFrom?: string | null;
  spanTo?: string | null;
  /** Reported after every load, so a host can title the list without counting it a second time. */
  onCounts?: (counts: SupplierInboundCounts) => void;
}> = ({ workspaceId, vatNumber, companyId, readOnly, spanFrom, spanTo, onCounts }) => {
  const fieldId = React.useId();
  const { toast } = useToast();
  const [rows, setRows] = useState<InboundDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = useState<InboundDocument | null>(null);
  const [payDoc, setPayDoc] = useState<InboundDocument | null>(null);
  const [orderDoc, setOrderDoc] = useState<InboundDocument | null>(null);
  /** Documents that already produced an order — read via their expense's `order_id`. */
  const [ordered, setOrdered] = useState<Set<string>>(new Set());
  /**
   * The document being read. Opens OVER whatever is hosting this table — a card on a CRM record,
   * or the supplier modal — which stays mounted underneath, so closing it returns to the same
   * page of the same list rather than to the top of a re-fetched one.
   */
  const [previewDoc, setPreviewDoc] = useState<InboundDocument | null>(null);
  /**
   * The issue-date window. Empty by default and bounded by the supplier's own span, because a
   * prefilled window is a filter nobody set: it would silently drop any document carrying NO
   * issue date, and the header's all-time counts would stop agreeing with the table for a reason
   * the operator never chose. Applied SERVER-side, so narrowing reaches documents the row cap
   * would otherwise have cut off.
   */
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  /**
   * A date input reports every keystroke, so typing "2025" arrives as `0002-…` first. Sending
   * that is a query for the third century that returns nothing — i.e. a blank table flashing at
   * the operator mid-type, which reads as "this supplier has none". Only a plausible year counts
   * as a bound; anything else is treated as still being typed.
   */
  const bound = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900 ? v : null);
  const from = bound(range.from);
  const to = bound(range.to);
  const windowed = !!(from || to);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId || !vatNumber) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const { rows: docs, total: n } = await inboundService.listForIssuerVat(workspaceId, vatNumber, { from, to });
      setRows(docs);
      setTotal(n);
      setOrdered(await docsWithOrders(docs).catch(() => new Set<string>()));
    }
    catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [workspaceId, vatNumber, from, to]);

  useEffect(() => { void load(); }, [load]);
  // Categories only matter for the order form; fetched once so opening it is instant.
  useEffect(() => {
    if (!workspaceId) return;
    financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
  }, [workspaceId]);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);
  useEffect(() => {
    if (loading) return;
    onCounts?.({
      total,
      loaded: rows.length,
      notInBooks: rows.filter((d) => !d.created_supplier_bill_id && d.status !== 'dismissed').length,
      windowed,
    });
  }, [loading, rows, total, windowed, onCounts]);

  const dismiss = async (id: string) => {
    setBusy(id);
    try { await inboundService.dismiss(id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const clearRange = () => setRange({ from: '', to: '' });

  return (
    <>
      {/* The window sits ABOVE the loading state, not inside it: re-fetching on every edit would
          otherwise unmount the input being typed into and take the caret with it. */}
      <div className="flex flex-wrap items-end gap-3 border-b border-hairline bg-surface-sunken px-4 py-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[11px] font-semibold text-muted-foreground">Issued</span>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-from`} className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
          <Input
            id={`${fieldId}-from`}
            type="date"
            value={range.from}
            min={spanFrom ?? undefined}
            max={range.to || spanTo || undefined}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-to`} className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
          <Input
            id={`${fieldId}-to`}
            type="date"
            value={range.to}
            min={range.from || spanFrom || undefined}
            max={spanTo ?? undefined}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
        {windowed ? (
          <Button size="sm" variant="ghost" className="h-8" onClick={clearRange}>Clear</Button>
        ) : (
          <span className="pb-1 text-[11px] text-muted-foreground">
            {spanFrom
              ? `All of it — ${formatDate(spanFrom)}${spanTo && spanTo !== spanFrom ? ` to ${formatDate(spanTo)}` : ''}.`
              : 'All of it.'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : (
      <>
      {/* A truncated list looks exactly like a short one. */}
      {total > rows.length && (
        <p className="border-b border-hairline bg-surface-sunken px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Showing the {rows.length.toLocaleString()} most recent of {total.toLocaleString()} documents
          {windowed ? ' in this window' : ' from this supplier'}.
        </p>
      )}
      <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Number</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-right">Net</th>
            <th className="px-4 py-2 text-right">VAT</th>
            <th className="px-4 py-2 text-right">Payable</th>
            <th className="px-4 py-2 text-center">Handled</th>
            {!readOnly && <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={readOnly ? 7 : 8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                {/* Two different kinds of nothing, and they need opposite responses. */}
                {windowed ? (
                  <>
                    No documents issued in this window.{' '}
                    <button type="button" className="rounded text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={clearRange}>
                      Clear the dates
                    </button>
                  </>
                ) : 'Nothing has been filed against us under this ΑΦΜ.'}
              </td>
            </tr>
          )}
          {paginate(rows, page).map((d) => {
            const outcomes = inboundOutcomes(d, { ordered: ordered.has(d.id) });
            return (
              <tr
                key={d.id}
                className={`cursor-pointer border-b border-border/30 hover:bg-muted/30 ${d.status === 'dismissed' ? 'opacity-60' : ''}`}
                // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on
                // the Number cell. A <tr> cannot be made focusable correctly: tabIndex +
                // role="button" on a row is invalid ARIA and yields a focus stop with no name.
                onClick={() => setPreviewDoc(d)}
              >
                <td className="px-4 py-2">{d.issue_date ? formatDate(d.issue_date) : '—'}</td>
                <td className="px-4 py-2">
                  {/* Our own ΑΦΜ is not the supplier's invoice number — see
                      `inboundDocumentNumber`. */}
                  <button
                    type="button"
                    className="rounded text-left text-xs font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => { e.stopPropagation(); setPreviewDoc(d); }}
                    title="Open this document as AADE holds it"
                  >
                    {inboundDocumentNumber(d) ?? '—'}
                  </button>
                  {d.mark ? <div className="text-[10px] font-mono text-muted-foreground" title={`MARK ${d.mark}`}>{d.mark}</div> : null}
                </td>
                <td className="px-4 py-2"><MydataTypeLabel code={d.doc_type} /></td>
                <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_net ?? 0, d.currency)}</td>
                {/* Reverse charge: the supplier charged no VAT, so none is shown and the
                    total is what they actually invoiced. */}
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {isReverseCharged(d.doc_type)
                    ? <span title={`Reverse charge — ${formatMoney(selfAccountedVat(d) ?? 0, d.currency)} self-assessed and reclaimed in the same return.`}>—</span>
                    : formatMoney(d.total_vat ?? 0, d.currency)}
                </td>
                <td className="px-4 py-2 text-right font-medium">{formatMoney(invoicedTotal(d), d.currency)}</td>
                <td className="px-4 py-2 text-center">
                  {outcomes.length > 0
                    ? <span className="text-[10px]">
                        {outcomes.map((o, i) => (
                          <React.Fragment key={o.label}>
                            {i > 0 && <span className="text-muted-foreground/50"> · </span>}
                            <span className={o.tone}>{o.label}</span>
                          </React.Fragment>
                        ))}
                      </span>
                    : <span className="text-[10px] text-muted-foreground/50">Not in Books</span>}
                </td>
                {!readOnly && (
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <InboundDocActionsMenu
                        doc={d}
                        workspaceId={workspaceId}
                        busy={busy === d.id}
                        // Set when the issuer is already in CRM — the menu then offers the link
                        // rather than letting a duplicate be started.
                        crmCompanyId={companyId ?? undefined}
                        onRecordPayment={() => setPayDoc(d)}
                        onCreateOrder={() => setOrderDoc(d)}
                        hasOrder={ordered.has(d.id)}
                        onReceiveStock={() => setReceiveDoc(d)}
                        onDismiss={() => dismiss(d.id)}
                        onChanged={load}
                      />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <TablePagination page={page} total={rows.length} onPageChange={setPage} label="documents" />
      </>
      )}

      {/* Stacked ON TOP of whatever hosts this table, never instead of it — Radix layers each
          dialog's portal in mount order, so the host stays mounted and its state survives. */}
      {previewDoc && (
        <InboundDocPreviewDialog
          doc={previewDoc}
          open
          onOpenChange={(v) => { if (!v) setPreviewDoc(null); }}
        />
      )}
      {receiveDoc && (
        <ReceiveToWarehouseDialog
          doc={receiveDoc}
          workspaceId={workspaceId}
          onOpenChange={(v) => { if (!v) setReceiveDoc(null); }}
          onDone={() => { setReceiveDoc(null); void load(); }}
        />
      )}
      {orderDoc && (
        // The platform's ONE order form, seeded from the document. Everything stays editable, so
        // the order can be corrected before saving — the whole point of keeping them separate.
        // The party is only LOCKED when the issuer is in CRM; otherwise the form asks, which is
        // the same duplicate-safe path "Add issuer → CRM" takes.
        <NewOrderModal
          workspaceId={workspaceId}
          lockedCompanyId={companyId ?? undefined}
          preset={{ orderType: 'purchase', draft: false }}
          prefill={{ currency: orderDoc.currency, notes: `From myDATA ${orderDoc.series ?? ''}${orderDoc.aa ? ` ${orderDoc.aa}` : ''} · MARK ${orderDoc.mark}`.trim(), lines: orderLinesFromDoc(orderDoc), fromDocument: true, inboundDocumentId: orderDoc.id }}
          categories={categories}
          open
          onOpenChange={(v) => { if (!v) setOrderDoc(null); }}
          onCreated={() => { setOrderDoc(null); void load(); }}
        />
      )}
      {payDoc && (
        <RecordPaymentDialog
          workspaceId={workspaceId}
          presetExpenseId={payDoc.created_supplier_bill_id ?? undefined}
          open
          onOpenChange={(v) => { if (!v) setPayDoc(null); }}
          onSaved={() => { setPayDoc(null); void load(); }}
        />
      )}
    </>
  );
};
