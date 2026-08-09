/**
 * A supplier's myDATA received documents, on their CRM record.
 *
 * These are documents the supplier filed with AADE naming us as the counterparty. They arrive in
 * Finance → Documents → Expenses (the Inbox) and, until one is turned into an expense, they are
 * NOT in the books — so they show here with their state spelled out rather than silently missing.
 *
 * Matched live by ΑΦΜ (see `inboundService.listForIssuerVat`), so this needs no link column and
 * no backfill. Rows carry the SAME `InboundDocActionsMenu` as the Inbox — one menu, one set of
 * behaviours, wherever a received document is shown.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Loader2, Inbox as InboxIcon, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { inboundOutcomes } from '@/modules/finance/components/inboundStatus';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import { InboundDocActionsMenu } from '@/modules/finance/components/InboundDocActionsMenu';
import { ReceiveToWarehouseDialog } from '@/modules/finance/components/ReceiveToWarehouseDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewOrderModal } from '@/modules/finance/components/OrdersPanel';
import { orderLinesFromDoc, docsWithOrders } from '@/modules/finance/utils/inboundToOrder';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate } from '@/utils/datetime';

export const PartyInboundDocsCard: React.FC<{
  workspaceId: string;
  companyId: string;
  /** The company's VAT number — the only thing that ties a received document to them. */
  vatNumber: string | null | undefined;
  /** Deep link into the Expenses Inbox, for everything this card doesn't do. */
  inboxHref: string;
  readOnly?: boolean;
}> = ({ workspaceId, companyId, vatNumber, inboxHref, readOnly }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<InboundDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = useState<InboundDocument | null>(null);
  const [payDoc, setPayDoc] = useState<InboundDocument | null>(null);
  const [orderDoc, setOrderDoc] = useState<InboundDocument | null>(null);
  /** Documents that already produced an order — read via their expense's `order_id`. */
  const [ordered, setOrdered] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId || !vatNumber) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const docs = await inboundService.listForIssuerVat(workspaceId, vatNumber);
      setRows(docs);
      setOrdered(await docsWithOrders(docs).catch(() => new Set<string>()));
    }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, [workspaceId, vatNumber]);

  useEffect(() => { void load(); }, [load]);
  // Categories only matter for the order form; fetched once so opening it is instant.
  useEffect(() => {
    if (!workspaceId) return;
    financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
  }, [workspaceId]);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);

  const dismiss = async (id: string) => {
    setBusy(id);
    try { await inboundService.dismiss(id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  // Nothing to say when this party has no VAT number — they can't be matched to any document.
  if (!vatNumber) return null;
  if (!loading && rows.length === 0) return null;

  const notInBooks = rows.filter((d) => !d.created_supplier_bill_id && d.status !== 'dismissed').length;

  return (
    <>
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><InboxIcon className="h-4 w-4" /> Invoices</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What this supplier filed with AADE against us.
              {notInBooks > 0
                ? ` ${notInBooks} not in your books yet — until one is added to Expenses it doesn't reach Payables or the P&L.`
                : ' All of them are in Expenses.'}
            </p>
          </div>
          {/* Carry the supplier through, so the Inbox opens on THEIR documents rather than
              everyone's and the operator has to re-find them. */}
          <Link to={vatNumber ? `${inboxHref}${inboxHref.includes('?') ? '&' : '?'}issuer_vat=${encodeURIComponent(vatNumber)}` : inboxHref}>
            <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-2" /> Open inbox</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : (
            <>
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
                  {paginate(rows, page).map((d) => {
                    const outcomes = inboundOutcomes(d, { ordered: ordered.has(d.id) });
                    return (
                      <tr key={d.id} className={`border-b border-border/30 ${d.status === 'dismissed' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-2">{d.issue_date ? formatDate(d.issue_date) : '—'}</td>
                        <td className="px-4 py-2">
                          <div className="text-xs font-medium">{d.series ?? '—'}{d.aa ? ` ${d.aa}` : ''}</div>
                          <div className="text-[10px] font-mono text-muted-foreground" title={`MARK ${d.mark}`}>{d.mark}</div>
                        </td>
                        <td className="px-4 py-2"><MydataTypeLabel code={d.doc_type} /></td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_net ?? 0, d.currency)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_vat ?? 0, d.currency)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(d.total_gross ?? 0, d.currency)}</td>
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
                            : <span className="text-[10px] text-muted-foreground/50">Not in books</span>}
                        </td>
                        {!readOnly && (
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end">
                              <InboundDocActionsMenu
                                doc={d}
                                workspaceId={workspaceId}
                                busy={busy === d.id}
                                // We ARE on the issuer's record, so the CRM action is already done.
                                crmCompanyId={companyId}
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
              <TablePagination page={page} total={rows.length} onPageChange={setPage} label="documents" />
            </>
          )}
        </CardContent>
      </Card>

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
        <NewOrderModal
          workspaceId={workspaceId}
          lockedCompanyId={companyId}
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
