/** Attach a received document to orders, payments and other documents. Candidates are derived in SQL. */
import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Link2, Loader2, ShoppingCart, Wallet, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';
import {
  inboundService,
  type InboundDocAttachments,
  type InboundDocument,
  type InboundLinkableDocument,
  type InboundOrderSuggestion,
  type InboundPaymentCandidate,
} from '@/modules/finance/services/inboundService';

const docName = (d: { series?: string | null; aa?: string | null; mark?: string | null }) =>
  [d.series, d.aa].filter(Boolean).join(' ') || d.mark || 'Document';

const isDeliveryNote = (docType: string | null | undefined) => String(docType ?? '').split('.')[0] === '9';

const money = (value: string): number | undefined => {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const errorText = (e: unknown) => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? m : undefined;
};

export const InboundAttachDialog: React.FC<{
  doc: InboundDocument;
  attachments: InboundDocAttachments | null;
  financeBase: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}> = ({ doc, attachments, financeBase, open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const currency = doc.currency ?? 'EUR';
  const booked = !!attachments;
  const shipping = isDeliveryNote(doc.doc_type);
  const [tab, setTab] = React.useState(shipping ? 'documents' : 'payments');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [orders, setOrders] = React.useState<InboundOrderSuggestion[] | null>(null);
  const [payments, setPayments] = React.useState<InboundPaymentCandidate[] | null>(null);
  const [documents, setDocuments] = React.useState<InboundLinkableDocument[] | null>(null);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setReadError(null);
    const timer = setTimeout(() => {
      const read: Promise<void> = tab === 'orders'
        ? inboundService.suggestOrders(doc.id).then((r) => { if (live) setOrders(r); })
        : tab === 'payments'
          ? inboundService.suggestPayments(doc.id, query).then((r) => { if (live) setPayments(r); })
          : inboundService.searchLinkableDocuments(doc, query).then((r) => { if (live) setDocuments(r); });
      read.catch((e: unknown) => { if (live) setReadError(errorText(e) ?? 'Could not load the candidates.'); });
    }, query ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [open, tab, query, doc, attachments]);

  const run = async (key: string, title: string, fn: () => Promise<string | undefined>) => {
    setBusy(key);
    try {
      const description = await fn();
      toast({ title, description });
      onChanged();
    } catch (e: unknown) {
      toast({ title: 'That did not work', description: errorText(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const bookingNote = booked ? '' : ' This also adds the document to your expenses.';

  const attachPayment = (c: InboundPaymentCandidate, amount: number | undefined) => {
    if (!window.confirm(`Attach ${formatMoney(amount ?? c.unallocated, c.currency)} of this payment to ${docName(doc)}?${bookingNote}`)) return;
    void run(c.id, 'Payment attached', async () => {
      const out = await inboundService.attachPayment(doc.id, c, amount);
      if (out.already_attached) return 'This payment was already attached. Nothing changed.';
      const left = Number(out.payment_unallocated ?? 0);
      return `${formatMoney(Number(out.bill_due), c.currency)} still due on the invoice.${left > 0.005 ? ` ${formatMoney(left, c.currency)} of the payment is unassigned.` : ''}`;
    });
  };

  const attachOrder = (o: InboundOrderSuggestion, net: number | undefined) => {
    if (!window.confirm(`Attach ${o.order_number ?? 'this order'} to ${docName(doc)}? Any payment on the order moves onto the invoice.${bookingNote}`)) return;
    void run(o.order_id, 'Order attached', async () => {
      const out = await inboundService.attachOrder(doc.id, o.order_id, net);
      const carried = Number(out.carried_from_order ?? 0);
      return carried > 0
        ? `${formatMoney(carried, currency)} already paid on the order now settles this invoice.`
        : 'Nothing has been paid on this order yet.';
    });
  };

  const linkDocument = (other: InboundLinkableDocument) => {
    const [from, to] = isDeliveryNote(doc.doc_type) ? [other.id, doc.id] : [doc.id, other.id];
    void run(other.id, 'Documents linked', async () => {
      await inboundService.linkDocuments(from, to);
      return undefined;
    });
  };

  const attachedOrderIds = new Set((attachments?.orders ?? []).map((o) => o.order_id));
  const hasOrder = attachedOrderIds.size > 0;
  const openOrders = (orders ?? []).filter((o) => !attachedOrderIds.has(o.order_id)
    && (!query.trim() || `${o.order_number ?? ''} ${o.party_name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));
  const due = attachments ? Number(attachments.bill_due) : Number(doc.total_gross ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto text-left sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach to {docName(doc)}</DialogTitle>
          <DialogDescription>
            {doc.issuer_name ?? 'Supplier'} · myDATA {doc.doc_type ?? '—'} · {formatMoney(Number(doc.total_gross ?? 0), currency)}
            {shipping
              ? ' · a shipping document: payments and orders go on the invoice, so link it to the invoice here'
              : booked ? ` · ${formatMoney(due, currency)} still due` : ' · not in your expenses yet'}
          </DialogDescription>
        </DialogHeader>

        {!!attachments && (attachments.orders.length > 0 || attachments.payments.length > 0) && (
          <div className="divide-y divide-hairline rounded-sm border border-hairline">
            {attachments.orders.map((o) => (
              <div key={o.order_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Link to={`${financeBase}/orders/${o.order_id}`} className="min-w-0 flex-1 truncate text-primary hover:underline">
                  {o.order_number ?? 'Order'}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(o.net_amount, currency)} net</span>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7" disabled={!!busy} aria-label="Remove this order"
                  onClick={() => {
                    if (!window.confirm(`Remove ${o.order_number ?? 'this order'}? Any payment that came from it goes back to the order.`)) return;
                    void run(o.order_id, 'Order removed', async () => { await inboundService.detachOrder(doc.id, o.order_id); return undefined; });
                  }}
                ><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            {attachments.payments.map((p) => (
              <div key={p.allocation_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{p.paid_at ? formatDate(p.paid_at) : '—'}{p.reference ? ` · ${p.reference}` : ''}</span>
                <span className="text-xs tabular-nums">{formatMoney(p.amount, currency)}</span>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7" disabled={!!busy || !!p.via_order_id} aria-label="Remove this payment"
                  title={p.via_order_id ? 'This payment came from an attached order. Remove the order instead.' : undefined}
                  onClick={() => {
                    if (!window.confirm('Remove this payment from the invoice? The invoice goes back to owing that amount.')) return;
                    void run(p.allocation_id, 'Payment removed', async () => { await inboundService.detachPayment(p.allocation_id); return undefined; });
                  }}
                ><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setQuery(''); }}>
          <TabsList>
            {!shipping && <TabsTrigger value="payments">Payments</TabsTrigger>}
            {!shipping && <TabsTrigger value="orders">Orders</TabsTrigger>}
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          <Input
            className="mt-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'payments' ? 'Reference, payee or amount…' : tab === 'orders' ? 'Order number or supplier…' : 'Number, MARK or issuer…'}
          />
          {readError && <p className="mt-3 text-sm text-destructive">{readError}</p>}

          <TabsContent value="payments">
            {!readError && payments === null && <Loading />}
            {!!payments?.length && (
              <div className="divide-y divide-hairline">
                {payments.map((c) => {
                  const suggested = Math.min(Number(c.unallocated), due > 0 ? due : Number(c.unallocated));
                  return (
                    <div key={`${c.kind}:${c.id}`} className="flex flex-wrap items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{c.reference || c.party_name || 'Payment'}</span>
                          {c.exact_amount && <Badge variant="info">Exact</Badge>}
                          {c.same_supplier && <Badge variant="success">Same Supplier</Badge>}
                          {c.line_status === 'partial' && <Badge variant="warning">Part Matched</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.paid_at ? formatDate(c.paid_at) : '—'} · {c.party_name ?? 'No payee on the bank line'}
                          {` · ${formatMoney(Number(c.unallocated), c.currency)} free of ${formatMoney(Number(c.amount), c.currency)}`}
                        </div>
                      </div>
                      <Input
                        className="h-8 w-24 text-right text-xs tabular-nums" inputMode="decimal" aria-label="Amount to attach"
                        value={amounts[c.id] ?? suggested.toFixed(2)}
                        onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                      />
                      <AttachButton busy={busy === c.id} disabled={!!busy} onClick={() => attachPayment(c, money(amounts[c.id] ?? suggested.toFixed(2)))} />
                    </div>
                  );
                })}
              </div>
            )}
            {payments?.length === 0 && (
              <HubEmptyState
                icon={Wallet}
                variant={query ? 'filtered' : 'empty'}
                title={query ? 'No payment matches that search' : 'No unassigned payments in this currency'}
                description={query ? undefined : 'Payments appear here once the bank feed has them, or after you record one.'}
                action={query
                  ? <Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button>
                  : <Link to={`${financeBase}?tab=payments`}><Button size="sm" variant="outline">Open payments</Button></Link>}
              />
            )}
          </TabsContent>

          <TabsContent value="orders">
            {!readError && orders === null && <Loading />}
            {openOrders.length > 0 && (
              <div className="divide-y divide-hairline">
                {openOrders.map((o) => {
                  const unbilled = Math.max(Number(o.po_net) - Number(o.already_billed_net), 0);
                  return (
                    <div key={o.order_id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{o.order_number ?? 'Purchase order'}</span>
                          {o.same_supplier && <Badge variant="success">Same Supplier</Badge>}
                          {Math.abs(Number(o.net_delta)) < 0.01 && <Badge variant="info">Exact</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {o.party_name ?? '—'} · {formatMoney(Number(o.po_net), o.currency ?? currency)} ordered · {formatMoney(unbilled, o.currency ?? currency)} not billed yet
                        </div>
                      </div>
                      {hasOrder && (
                        <Input
                          className="h-8 w-24 text-right text-xs tabular-nums" inputMode="decimal" aria-label="Net amount of this document that belongs to this order"
                          title="How much of this document's net belongs to this order"
                          value={amounts[o.order_id] ?? unbilled.toFixed(2)}
                          onChange={(e) => setAmounts((a) => ({ ...a, [o.order_id]: e.target.value }))}
                        />
                      )}
                      <AttachButton
                        busy={busy === o.order_id} disabled={!!busy}
                        onClick={() => attachOrder(o, hasOrder ? money(amounts[o.order_id] ?? unbilled.toFixed(2)) : undefined)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {orders !== null && openOrders.length === 0 && (
              <HubEmptyState
                icon={ShoppingCart}
                variant={query ? 'filtered' : 'empty'}
                title={query ? 'No order matches that search' : 'No open purchase orders to attach'}
                description={query ? undefined : 'A purchase order appears here once it is confirmed.'}
                action={query
                  ? <Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button>
                  : <Link to={`${financeBase}?tab=orders`}><Button size="sm" variant="outline">Open orders</Button></Link>}
              />
            )}
          </TabsContent>

          <TabsContent value="documents">
            {!readError && documents === null && <Loading />}
            {!!documents?.length && (
              <div className="divide-y divide-hairline">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{docName(d)}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        myDATA {d.doc_type ?? '—'} · {d.issuer_name ?? '—'} · {d.issue_date ? formatDate(d.issue_date) : '—'} · {formatMoney(Number(d.total_gross ?? 0), d.currency ?? currency)}
                      </div>
                    </div>
                    <AttachButton busy={busy === d.id} disabled={!!busy} onClick={() => linkDocument(d)} />
                  </div>
                ))}
              </div>
            )}
            {documents?.length === 0 && (
              <HubEmptyState
                icon={FileText}
                variant="filtered"
                title="No other document found"
                description="Search by number, MARK or issuer to look beyond this supplier."
                action={query ? <Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button> : undefined}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

const Loading: React.FC = () => (
  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Looking…
  </div>
);

const AttachButton: React.FC<{ busy: boolean; disabled: boolean; onClick: () => void }> = ({ busy, disabled, onClick }) => (
  <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}>
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
    <span className="ml-1.5">Attach</span>
  </Button>
);

export default InboundAttachDialog;
