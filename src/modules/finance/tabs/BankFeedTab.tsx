/**
 * Finance → Bank feed (#315): the unified transactions workspace across Revolut,
 * Stripe and Viva. Lives next to Payables — this is operational money data, not settings.
 *
 * Row semantics by provider:
 *   - revolut  — real bank lines; matchable (invoice for money-in, supplier bill for
 *     money-out) via the ⋯ menu or the auto-matcher.
 *   - stripe / viva — informational mirrors of money the provider webhooks already
 *     settled; shown for completeness, never re-matchable (double-booking guard).
 *
 * Status renders as plain colored words (design system: no badge pills for status).
 */
import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Landmark, Loader2, MoreHorizontal, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi } from '@/modules/banking-revolut/services/revolutConfigService';
import { formatDate } from '@/utils/datetime';
// One source (#391).
import { PAYMENT_PROVIDER_SLUGS, type PaymentProviderSlug } from '../paymentVocabulary';

interface FeedRow {
  id: string;
  provider: string;
  booked_at: string | null;
  counterparty_name: string | null;
  reference: string | null;
  amount: number;
  currency: string;
  direction: string | null;
  type: string | null;
  state: string;
  match_status: string;
  matched_invoice_id: string | null;
  suggested_invoice_ids: string[] | null;
}

interface InvoiceLite { id: string; internal_number: string; amount_due: number; currency: string }
interface BillLite { id: string; supplier_bill_number: string | null; supplier_name: string | null; amount_due: number; currency: string }
interface OrderLite { id: string; order_number: string | null }

// One source (#391) — `Record<PaymentProviderSlug, …>`, so a fourth provider is a
// typecheck failure here rather than a filter option nobody added.
const PROVIDER_LABEL: Record<PaymentProviderSlug, string> = { revolut: 'Revolut', stripe: 'Stripe', viva: 'Viva' };

const MatchWord: React.FC<{ row: FeedRow }> = ({ row }) => {
  if (row.provider !== 'revolut') {
    return row.match_status === 'matched'
      ? <span className="text-xs text-success">Settled</span>
      : <span className="text-xs text-muted-foreground">Info</span>;
  }
  if (row.state !== 'completed') return <span className="text-xs text-muted-foreground">{row.state}</span>;
  switch (row.match_status) {
    case 'matched': return <span className="text-xs text-success">Matched</span>;
    case 'suggested': return <span className="text-xs text-warning">Needs review</span>;
    case 'ignored': return <span className="text-xs text-muted-foreground">Ignored</span>;
    default: return row.direction === 'in'
      ? <span className="text-xs text-destructive">Unmatched</span>
      : <span className="text-xs text-muted-foreground">Unmatched</span>;
  }
};

export const BankFeedTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<FeedRow[]>([]);
  const [invoices, setInvoices] = React.useState<Map<string, InvoiceLite>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // Filters
  const [provider, setProvider] = React.useState('');
  const [direction, setDirection] = React.useState('');
  const [statusF, setStatusF] = React.useState('');
  const [q, setQ] = React.useState('');
  const [qInput, setQInput] = React.useState('');
  React.useEffect(() => {
    // Debounce + sanitize: raw commas/parens break PostgREST .or() filter syntax, and
    // querying per keystroke flashes the table on every letter.
    const t = setTimeout(() => setQ(qInput.replace(/[,()%]/g, ' ').trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  // Pickers
  const [picking, setPicking] = React.useState<{ row: FeedRow; kind: 'invoice' | 'bill' | 'order' } | null>(null);
  const [pickQuery, setPickQuery] = React.useState('');
  const [pickInvoices, setPickInvoices] = React.useState<InvoiceLite[]>([]);
  const [pickBills, setPickBills] = React.useState<BillLite[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('revolut_bank_transactions')
        .select('id, provider, booked_at, counterparty_name, reference, amount, currency, direction, type, state, match_status, matched_invoice_id, suggested_invoice_ids')
        .eq('workspace_id', workspaceId)
        .order('booked_at', { ascending: false })
        .limit(100);
      if (provider) query = query.eq('provider', provider);
      if (direction) query = query.eq('direction', direction);
      // Review = anything reconcilable that found no home, BOTH directions: money paid
      // out by hand in the Revolut app needs a human as much as an unmatched receipt
      // does. `type=transfer` mirrors the matcher, so own-money lines (top-ups,
      // exchanges, fees) never turn up here asking to be matched to an invoice.
      if (statusF === 'review') {
        query = query
          .in('match_status', ['suggested', 'unmatched'])
          .eq('provider', 'revolut')
          .eq('type', 'transfer');
      }
      else if (statusF) query = query.eq('match_status', statusF);
      if (from) query = query.gte('booked_at', `${from}T00:00:00Z`);
      if (to) query = query.lte('booked_at', `${to}T23:59:59Z`);
      if (q.trim()) query = query.or(`counterparty_name.ilike.%${q.trim()}%,reference.ilike.%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const feed = (data ?? []).map((r) => ({
        ...r,
        suggested_invoice_ids: Array.isArray(r.suggested_invoice_ids) ? r.suggested_invoice_ids as string[] : null,
      })) as FeedRow[];
      setRows(feed);
      const ids = [...new Set(feed.flatMap((r) => [r.matched_invoice_id, ...(r.suggested_invoice_ids ?? [])]).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: invs } = await supabase.from('invoices').select('id, internal_number, amount_due, currency').in('id', ids);
        setInvoices(new Map((invs ?? []).map((i) => [i.id, i as InvoiceLite])));
      } else setInvoices(new Map());
    } catch (e) {
      toast({ title: 'Failed to load the bank feed', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, provider, direction, statusF, q, from, to, toast]);

  React.useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { toast({ title: `${label} failed`, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const syncNow = () => act('Sync', async () => {
    const out = await callRevolutApi<{ fetched: number }>('sync-now', workspaceId);
    toast({ title: 'Synced', description: `${out.fetched} Revolut transactions pulled.` });
  });
  const matchNow = () => act('Match', async () => {
    const out = await callRevolutApi<{ autoMatched: number; suggested: number; billsSettled?: number }>('reconcile', workspaceId);
    toast({ title: 'Matching complete', description: `${out.autoMatched} matched, ${out.suggested} for review, ${out.billsSettled ?? 0} bills settled.` });
  });

  const settleInvoice = (row: FeedRow, invoiceId: string) => act('Settle', async () => {
    const inv = invoices.get(invoiceId) ?? pickInvoices.find((i) => i.id === invoiceId);
    if (!window.confirm(`Record ${Number(row.amount).toFixed(2)} ${row.currency} against ${inv?.internal_number ?? 'this invoice'}? This books a payment.`)) return;
    await callRevolutApi('confirm-match', workspaceId, { transaction_row_id: row.id, invoice_id: invoiceId });
    setPicking(null);
    toast({ title: 'Invoice settled', description: 'Recorded through the normal payment path; any linked order updates via its invoice.' });
  });
  const settleBill = (row: FeedRow, billId: string) => act('Settle bill', async () => {
    if (!window.confirm(`Record ${Number(row.amount).toFixed(2)} ${row.currency} against this supplier bill? This books an outgoing payment.`)) return;
    await callRevolutApi('confirm-bill-match', workspaceId, { transaction_row_id: row.id, bill_id: billId });
    setPicking(null);
    toast({ title: 'Bill settled' });
  });
  const ignore = (row: FeedRow, ig: boolean) => act('Update', async () => {
    await callRevolutApi('ignore-transaction', workspaceId, { transaction_row_id: row.id, ignore: ig });
  });

  // Pickers: invoices (open), bills (open), orders → their open invoices.
  React.useEffect(() => {
    if (!picking) return;
    const run = async () => {
      const term = pickQuery.trim();
      if (picking.kind === 'bill') {
        let bq = supabase.from('supplier_bills')
          .select('id, supplier_bill_number, supplier_name, amount_due, currency')
          .eq('workspace_id', workspaceId).gt('amount_due', 0)
          .order('due_at', { ascending: true }).limit(10);
        if (term) bq = bq.or(`supplier_bill_number.ilike.%${term}%,supplier_name.ilike.%${term}%`);
        const { data } = await bq;
        setPickBills((data ?? []) as BillLite[]);
        return;
      }
      if (picking.kind === 'order') {
        // "Attach to order" = settle the order's open invoice; the allocation trigger
        // links the payment back to the order automatically.
        let oq = supabase.from('orders').select('id, order_number').eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }).limit(10);
        if (term) oq = oq.ilike('order_number', `%${term}%`);
        const { data: orders } = await oq;
        const orderIds = ((orders ?? []) as OrderLite[]).map((o) => o.id);
        if (orderIds.length === 0) { setPickInvoices([]); return; }
        const { data: invs } = await supabase.from('invoices')
          .select('id, internal_number, amount_due, currency, order_id')
          .eq('workspace_id', workspaceId).in('order_id', orderIds).gt('amount_due', 0).limit(10);
        const numById = new Map(((orders ?? []) as OrderLite[]).map((o) => [o.id, o.order_number]));
        setPickInvoices(((invs ?? []) as Array<InvoiceLite & { order_id: string }>).map((i) => ({
          ...i, internal_number: `${i.internal_number} (order ${numById.get(i.order_id) ?? '?'})`,
        })));
        return;
      }
      let iq = supabase.from('invoices').select('id, internal_number, amount_due, currency')
        .eq('workspace_id', workspaceId).in('status', ['issued', 'partially_paid', 'overdue'])
        .gt('amount_due', 0).order('created_at', { ascending: false }).limit(10);
      if (term) iq = iq.ilike('internal_number', `%${term}%`);
      const { data } = await iq;
      setPickInvoices((data ?? []) as InvoiceLite[]);
    };
    void run();
  }, [picking, pickQuery, workspaceId]);


  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Bank Feed</CardTitle>
            <CardDescription className="text-xs">
              Money movement across your connected providers. Revolut lines are matchable; Stripe and Viva
              lines mirror payments their webhooks already settled.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={matchNow} disabled={busy}>Match now</Button>
            <Button size="sm" variant="outline" onClick={syncNow} disabled={busy}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />Sync
            </Button>
          </div>
        </div>
        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={provider || 'all'} onValueChange={(v) => setProvider(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Provider filter" className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {PAYMENT_PROVIDER_SLUGS.map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={direction || 'all'} onValueChange={(v) => setDirection(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Direction filter" className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In & out</SelectItem>
              <SelectItem value="in">Money in</SelectItem>
              <SelectItem value="out">Money out</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusF || 'all'} onValueChange={(v) => setStatusF(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Match status filter" className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="review">Needs review</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
            </SelectContent>
          </Select>
          <label htmlFor="feed-from" className="flex items-center gap-1 text-xs text-muted-foreground">From
            <Input id="feed-from" type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label htmlFor="feed-to" className="flex items-center gap-1 text-xs text-muted-foreground">To
            <Input id="feed-to" type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="relative min-w-44 flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Counterparty or reference…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const matched = r.matched_invoice_id ? invoices.get(r.matched_invoice_id) : null;
              const suggestions = (r.suggested_invoice_ids ?? []).map((id) => invoices.get(id)).filter(Boolean) as InvoiceLite[];
              const revolut = r.provider === 'revolut';
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  {r.direction === 'in'
                    ? <ArrowDownLeft className="h-4 w-4 shrink-0 text-success" />
                    : <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{PROVIDER_LABEL[r.provider] ?? r.provider}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.counterparty_name || r.type || '—'}</span>
                      <MatchWord row={r} />
                      {matched && <span className="text-xs text-muted-foreground">→ {matched.internal_number}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.booked_at ? formatDate(r.booked_at) : '—'}{r.reference ? ` · ${r.reference}` : ''}
                    </div>
                  </div>
                  {suggestions.slice(0, 1).map((inv) => (
                    <Button key={inv.id} size="sm" variant="outline" className="text-xs" disabled={busy}
                      onClick={() => settleInvoice(r, inv.id)}>
                      Settle {inv.internal_number}
                    </Button>
                  ))}
                  <span className={`shrink-0 font-medium ${r.direction === 'in' ? 'text-success' : ''}`}>
                    {r.direction === 'in' ? '+' : '−'}{Number(r.amount).toFixed(2)} {r.currency}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Transaction actions"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs">{Number(r.amount).toFixed(2)} {r.currency} · {PROVIDER_LABEL[r.provider] ?? r.provider}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {revolut && r.direction === 'in' && r.match_status !== 'matched' && (
                        <>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'invoice' }); setPickQuery(''); }}>Match to invoice…</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'order' }); setPickQuery(''); }}>Attach to order…</DropdownMenuItem>
                        </>
                      )}
                      {revolut && r.direction === 'out' && r.match_status !== 'matched' && (
                        <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'bill' }); setPickQuery(''); }}>Match to supplier bill…</DropdownMenuItem>
                      )}
                      {revolut && r.match_status !== 'matched' && (
                        r.match_status === 'ignored'
                          ? <DropdownMenuItem onClick={() => ignore(r, false)}>Unignore</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => ignore(r, true)}>Ignore</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(r.reference ?? r.id); toast({ title: 'Reference copied' }); }}>
                        Copy reference
                      </DropdownMenuItem>
                      {!revolut && (
                        <DropdownMenuItem disabled>
                          Settled by {PROVIDER_LABEL[r.provider]} — informational
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
        {!loading && rows.length >= 100 && (
          <p className="border-t border-border/60 px-5 py-2 text-xs text-muted-foreground">
            Showing the latest 100 — narrow the filters or date range to see older lines.
          </p>
        )}
      </CardContent>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {picking?.kind === 'bill' ? 'Match to a Supplier Bill'
                : picking?.kind === 'order' ? 'Attach to an Order (Settles Its Open Invoice)'
                : 'Match to an Invoice'}
              {picking ? ` — ${Number(picking.row.amount).toFixed(2)} ${picking.row.currency}` : ''}
            </DialogTitle>
          </DialogHeader>
          <Input autoFocus value={pickQuery} onChange={(e) => setPickQuery(e.target.value)}
            placeholder={picking?.kind === 'bill' ? 'Bill number or supplier…' : picking?.kind === 'order' ? 'Order number…' : 'Invoice number…'} />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {picking?.kind === 'bill'
              ? pickBills.map((b) => (
                <button key={b.id} type="button" disabled={busy}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => picking && settleBill(picking.row, b.id)}>
                  <span className="font-medium">{b.supplier_bill_number || b.supplier_name || b.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground">due {Number(b.amount_due).toFixed(2)} {b.currency}</span>
                </button>
              ))
              : pickInvoices.map((inv) => (
                <button key={inv.id} type="button" disabled={busy}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => picking && settleInvoice(picking.row, inv.id)}>
                  <span className="font-medium">{inv.internal_number}</span>
                  <span className="text-xs text-muted-foreground">due {Number(inv.amount_due).toFixed(2)} {inv.currency}</span>
                </button>
              ))}
            {((picking?.kind === 'bill' && pickBills.length === 0) || (picking?.kind !== 'bill' && pickInvoices.length === 0)) && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {picking?.kind === 'order' ? 'No orders with an open invoice found.' : 'Nothing open found.'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
