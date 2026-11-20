/**
 * Finance → Bank feed (#315): the unified transactions workspace across Revolut,
 * Stripe and Viva. Lives next to Payables — this is operational money data, not settings.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Copy, Landmark, Loader2, MoreHorizontal, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
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
import { ImportStatementDialog } from '@/modules/finance/components/ImportStatementDialog';
import { TablePagination, TABLE_PAGE_SIZE, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import { inboundService, type BankLineDocCandidate } from '@/modules/finance/services/inboundService';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { PAYMENT_PROVIDER_SLUGS, type PaymentProviderSlug } from '../paymentVocabulary';

interface FeedRow {
  id: string;
  provider: string;
  bank_account_id: string | null;
  revolut_account_id: string | null;
  transaction_id: string | null;
  leg_id: string | null;
  legs_total: number | null;
  match_method: string | null;
  matched_at: string | null;
  raw: Record<string, unknown> | null;
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
interface PartyLite { id: string; name: string; vat_number: string | null }
interface PlanCandidate {
  plan_id: string; title: string; amount: number; currency: string;
  scheduled_for: string; day_gap?: number; party_matches?: boolean; score: number;
}
interface PlanHint extends PlanCandidate { tx_id: string; candidates: number }

// One source (#391) — `Record<PaymentProviderSlug, …>`, so a fourth provider is a
// typecheck failure here rather than a filter option nobody added.
const PROVIDER_LABEL: Record<PaymentProviderSlug, string> = { revolut: 'Revolut', stripe: 'Stripe', viva: 'Viva' };

/** Revolut's transaction `type` values, as a reader names them. */
const TYPE_LABEL: Record<string, string> = {
  transfer: 'Transfer', card_payment: 'Card Payment', card_refund: 'Card Refund', card_chargeback: 'Card Chargeback',
  card_credit: 'Card Credit', exchange: 'Exchange', topup: 'Top-Up', topup_return: 'Top-Up Return', fee: 'Fee',
  refund: 'Refund', atm: 'ATM Withdrawal', loan: 'Loan', tax: 'Tax', tax_refund: 'Tax Refund',
  charge: 'Charge', charge_refund: 'Charge Refund',
};
const typeLabel = (t: string | null) => (t ? TYPE_LABEL[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

const STATE_LABEL: Record<string, string> = {
  created: 'Created', pending: 'Pending', completed: 'Completed', declined: 'Declined', failed: 'Failed', reverted: 'Reverted',
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** What the stored payload says about a line. Lines synced before the payload was kept read as nulls. */
function lineFacts(r: FeedRow) {
  const raw = obj(r.raw);
  const leg = obj(raw?.leg);
  const cp = obj(raw?.counterparty);
  const detail = obj(cp?.detail);
  const acc = obj(detail?.account);
  const merchant = obj(raw?.merchant);
  const card = obj(raw?.card);
  const bill = num(leg?.bill_amount);
  return {
    description: str(leg?.description),
    fee: num(leg?.fee),
    balanceAfter: num(leg?.balance),
    billAmount: bill === null ? null : Math.abs(bill),
    billCurrency: str(leg?.bill_currency),
    createdAt: str(raw?.created_at),
    completedAt: str(raw?.completed_at),
    requestId: str(raw?.request_id),
    relatedTx: str(raw?.related_transaction_id),
    cpKind: str(cp?.account_type),
    cpAccountId: str(cp?.account_id),
    cpName: str(detail?.name),
    cpProfile: str(detail?.profile_type),
    cpCountry: str(detail?.country) ?? str(acc?.bank_country),
    cpRevtag: str(detail?.revtag),
    iban: str(acc?.iban),
    bic: str(acc?.bic),
    accountNo: str(acc?.account_no),
    merchantName: str(merchant?.name),
    merchantCity: str(merchant?.city),
    merchantCountry: str(merchant?.country),
    merchantMcc: str(merchant?.category_code),
    cardNumber: str(card?.card_number),
    cardHolder: [str(card?.first_name), str(card?.last_name)].filter(Boolean).join(' ') || null,
  };
}

const CP_KIND_LABEL: Record<string, string> = { external: 'External Bank Account', revolut: 'Revolut Account', self: 'Own Account' };
const PROFILE_LABEL: Record<string, string> = { business: 'Business', personal: 'Individual' };
const compactIban = (iban: string) => iban.replace(/\s/g, '');
const ibanTail = (iban: string) => `${compactIban(iban).slice(0, 4)} … ${compactIban(iban).slice(-4)}`;
const shortId = (id: string | null) => (id ? id.slice(0, 8) : '—');

const MatchBadge: React.FC<{ row: FeedRow }> = ({ row }) => {
  if (row.provider !== 'revolut') {
    return row.match_status === 'matched'
      ? <Badge variant="success">Settled</Badge>
      : <Badge variant="neutral">Info</Badge>;
  }
  if (row.state !== 'completed') {
    return <Badge variant={row.state === 'pending' || row.state === 'created' ? 'info' : 'error'}>{STATE_LABEL[row.state] ?? row.state}</Badge>;
  }
  switch (row.match_status) {
    case 'matched': return <Badge variant="success">Matched</Badge>;
    case 'partial': return <Badge variant="warning" title="Part of this transfer is attached to expenses. The rest can still be matched.">Part Matched</Badge>;
    case 'suggested': return <Badge variant="warning">Needs Review</Badge>;
    case 'ignored': return <Badge variant="neutral">Ignored</Badge>;
    default: return <Badge variant={row.direction === 'in' ? 'error' : 'neutral'}>Unmatched</Badge>;
  }
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; copy?: string | null }> = ({ label, value, mono, copy }) => {
  const { toast } = useToast();
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`flex min-w-0 items-start gap-1.5 ${mono ? 'font-mono text-xs' : ''}`}>
        <span className="min-w-0 break-all">{value ?? '—'}</span>
        {copy && (
          <button type="button" aria-label={`Copy ${label}`} className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => { void navigator.clipboard.writeText(copy); toast({ title: `${label} copied` }); }}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t border-hairline pt-3">
    <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
    {children}
  </section>
);

export const BankFeedTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  // Accounts we reconcile that no integration feeds — the ones a statement has to be imported
  // for. `feed_kind` says which: a merchant settlement balance mirrors payments already settled
  // and must never receive one.
  const [importAccounts, setImportAccounts] = React.useState<Array<{ id: string; name: string }>>([]);
  const [importFor, setImportFor] = React.useState<{ id: string; name: string } | null>(null);
  const [accounts, setAccounts] = React.useState<Array<{ id: string; name: string; revolut_account_id: string | null }>>([]);
  React.useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .from('finance_bank_accounts')
      .select('id, name, revolut_account_id')
      .eq('workspace_id', workspaceId)
      .order('sort_order')
      .then(({ data }) => setAccounts((data ?? []) as Array<{ id: string; name: string; revolut_account_id: string | null }>));
  }, [workspaceId]);
  const accountOf = React.useCallback((bankAccountId: string | null, revolutAccountId: string | null) =>
    accounts.find((x) => x.id === bankAccountId)
      ?? accounts.find((x) => !!revolutAccountId && x.revolut_account_id === revolutAccountId)
      ?? null, [accounts]);
  const [detail, setDetail] = React.useState<FeedRow | null>(null);
  React.useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .from('finance_bank_accounts')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('feed_kind', 'bank_account')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setImportAccounts((data ?? []) as Array<{ id: string; name: string }>));
  }, [workspaceId]);
  const { toast } = useToast();
  const [rows, setRows] = React.useState<FeedRow[]>([]);
  const [invoices, setInvoices] = React.useState<Map<string, InvoiceLite>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // Filters
  const [provider, setProvider] = React.useState('');
  const [accountF, setAccountF] = React.useState('');
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
  const [picking, setPicking] = React.useState<{ row: FeedRow; kind: 'invoice' | 'bill' | 'order' | 'plan' | 'party' | 'expense' } | null>(null);
  const [pickDocs, setPickDocs] = React.useState<BankLineDocCandidate[] | null>(null);
  // A notification links one line (`?tx=`); the feed then shows that line until the user widens it.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusTx = searchParams.get('tx');
  const clearFocus = () => {
    const p = new URLSearchParams(searchParams);
    p.delete('tx');
    setSearchParams(p, { replace: true });
  };
  const [pickQuery, setPickQuery] = React.useState('');
  const [pickInvoices, setPickInvoices] = React.useState<InvoiceLite[]>([]);
  const [pickParties, setPickParties] = React.useState<PartyLite[]>([]);
  const [pickBills, setPickBills] = React.useState<BillLite[]>([]);
  const [pickPlans, setPickPlans] = React.useState<PlanCandidate[] | null>(null);
  const [planHints, setPlanHints] = React.useState<Map<string, PlanHint>>(new Map());
  const [hintsFailed, setHintsFailed] = React.useState(false);

  // Page is keyed to the filters, so changing any filter lands on page 1 without a second fetch.
  const filterKey = JSON.stringify([provider, accountF, direction, statusF, q, from, to, focusTx]);
  const [pageState, setPageState] = React.useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });
  const [total, setTotal] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const start = (page - 1) * TABLE_PAGE_SIZE;
      let query = supabase
        .from('revolut_bank_transactions')
        .select('id, provider, bank_account_id, revolut_account_id, transaction_id, leg_id, legs_total, match_method, matched_at, raw, booked_at, counterparty_name, reference, amount, currency, direction, type, state, match_status, matched_invoice_id, suggested_invoice_ids', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('booked_at', { ascending: false })
        .order('id', { ascending: false })
        .range(start, start + TABLE_PAGE_SIZE - 1);
      if (focusTx) query = query.eq('id', focusTx);
      if (provider) query = query.eq('provider', provider);
      if (accountF) {
        // Lines synced before an account was mapped carry only its Revolut id.
        const acc = accounts.find((a) => a.id === accountF);
        query = acc?.revolut_account_id
          ? query.or(`bank_account_id.eq.${acc.id},revolut_account_id.eq.${acc.revolut_account_id}`)
          : query.eq('bank_account_id', accountF);
      }
      if (direction) query = query.eq('direction', direction);
      // Review = reconcilable lines with no home, both directions, plus card spend waiting for its
      // receipt. Own-money lines (top-ups, exchanges, fees) never turn up asking to be matched.
      if (statusF === 'review') {
        query = query
          .in('match_status', ['suggested', 'unmatched', 'partial'])
          .eq('provider', 'revolut')
          .or('type.eq.transfer,and(direction.eq.out,type.eq.card_payment)');
      }
      else if (statusF) query = query.eq('match_status', statusF);
      if (from) query = query.gte('booked_at', `${from}T00:00:00Z`);
      if (to) query = query.lte('booked_at', `${to}T23:59:59Z`);
      if (q.trim()) query = query.or(`counterparty_name.ilike.%${q.trim()}%,reference.ilike.%${q.trim()}%,transaction_id.ilike.%${q.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      const n = count ?? 0;
      setTotal(n);
      if (n > 0 && (data ?? []).length === 0 && page > 1) {
        setPageState({ key: filterKey, page: clampPage(page, n) });
        return;
      }
      const feed = (data ?? []).map((r) => ({
        ...r,
        raw: r.raw && typeof r.raw === 'object' && !Array.isArray(r.raw) ? r.raw as Record<string, unknown> : null,
        suggested_invoice_ids: Array.isArray(r.suggested_invoice_ids) ? r.suggested_invoice_ids as string[] : null,
      })) as FeedRow[];
      setRows(feed);
      const ids = [...new Set(feed.flatMap((r) => [r.matched_invoice_id, ...(r.suggested_invoice_ids ?? [])]).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: invs } = await supabase.from('invoices').select('id, internal_number, amount_due, currency').in('id', ids);
        setInvoices(new Map((invs ?? []).map((i) => [i.id, i as InvoiceLite])));
      } else setInvoices(new Map());

      const openOut = feed
        .filter((r) => r.provider === 'revolut' && r.direction === 'out' && r.match_status !== 'matched' && r.match_status !== 'ignored')
        .map((r) => r.id);
      if (openOut.length) {
        const { data: hints, error: hintErr } = await supabase.rpc('bank_tx_plan_candidates_bulk', { p_tx_ids: openOut });
        setHintsFailed(!!hintErr);
        setPlanHints(hintErr ? new Map() : new Map(((hints ?? []) as PlanHint[]).map((h) => [h.tx_id, h])));
      } else { setPlanHints(new Map()); setHintsFailed(false); }
    } catch (e) {
      toast({ title: 'Failed to load the bank feed', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, provider, accountF, accounts, direction, statusF, q, from, to, toast, focusTx, page, filterKey]);

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
    if (!window.confirm(`Record what is left of this ${Number(row.amount).toFixed(2)} ${row.currency} transfer against this supplier bill? This books an outgoing payment.`)) return;
    const out = await callRevolutApi<{ payment_unallocated?: number }>('confirm-bill-match', workspaceId, { transaction_row_id: row.id, bill_id: billId });
    setPicking(null);
    const left = Number(out?.payment_unallocated ?? 0);
    toast({
      title: left > 0.005 ? 'Part of the transfer matched' : 'Bill settled',
      description: left > 0.005 ? `${left.toFixed(2)} ${row.currency} of this transfer is still unassigned. Match it to another bill.` : undefined,
    });
  });
  const settlePlan = (row: FeedRow, plan: PlanCandidate) => act('Close plan', async () => {
    if (!window.confirm(
      `Record ${Number(row.amount).toFixed(2)} ${row.currency} as the payment for "${plan.title}"? `
      + 'This books an outgoing payment and closes the plan.',
    )) return;
    const out = await callRevolutApi<{ outcome?: string }>('confirm-plan-match', workspaceId, {
      transaction_row_id: row.id, plan_id: plan.plan_id,
    });
    setPicking(null);
    toast({
      title: out?.outcome === 'already_paid' ? 'That plan was already settled' : 'Plan closed',
      description: out?.outcome === 'already_paid'
        ? 'Someone marked it paid before this ran — nothing was booked twice.'
        : `"${plan.title}" is paid, and the transfer is reconciled against it.`,
    });
  });
  const bookToParty = (row: FeedRow, party: PartyLite) => act('Book payment', async () => {
    const what = row.direction === 'in' ? `received from ${party.name}` : `paid to ${party.name}`;
    if (!window.confirm(`Record ${Number(row.amount).toFixed(2)} ${row.currency} as ${what}, on account? It lowers their balance and clears their oldest open items first.`)) return;
    await callRevolutApi('confirm-party-payment', workspaceId, { transaction_row_id: row.id, company_id: party.id });
    setPicking(null);
    toast({ title: 'Payment booked on account', description: `Shown on ${party.name}'s statement in Finance → Parties.` });
  });
  const payDocument = (row: FeedRow, doc: BankLineDocCandidate) => act('Attach', async () => {
    const who = doc.issuer_name ?? 'this supplier';
    if (!window.confirm(`Record this ${Number(row.amount).toFixed(2)} ${row.currency} payment against ${who}${doc.doc_number ? ` ${doc.doc_number}` : ''}? `
      + (doc.has_bill ? 'This books an outgoing payment.' : 'This books the document as an expense and records the payment.'))) return;
    const out = await inboundService.attachPayment(doc.doc_id, { kind: 'feed_line', id: row.id });
    setPicking(null);
    const left = Number(out?.payment_unallocated ?? 0);
    toast({
      title: left > 0.005 ? 'Part of the payment attached' : 'Expense paid',
      description: left > 0.005 ? `${left.toFixed(2)} ${row.currency} of this line is still unassigned. Attach it to another document.` : `${who} is settled by this line.`,
    });
  });
  const ignore = (row: FeedRow, ig: boolean) => act('Update', async () => {
    await callRevolutApi('ignore-transaction', workspaceId, { transaction_row_id: row.id, ignore: ig });
  });

  // Pickers: invoices (open), bills (open), orders → their open invoices.
  React.useEffect(() => {
    if (!picking) return;
    if (picking.kind === 'plan') setPickPlans(null);
    if (picking.kind === 'expense') setPickDocs(null);
    const run = async () => {
      const term = pickQuery.trim();
      if (picking.kind === 'expense') {
        try { setPickDocs(await inboundService.suggestDocsForBankLine(picking.row.id, term)); }
        catch (e) { setPickDocs([]); toast({ title: 'Could not load documents', description: (e as Error).message, variant: 'destructive' }); }
        return;
      }
      if (picking.kind === 'plan') {
        const { data } = await supabase.rpc('bank_tx_plan_candidates', { p_tx_id: picking.row.id, p_limit: 5 });
        setPickPlans((data ?? []) as PlanCandidate[]);
        return;
      }
      if (picking.kind === 'party') {
        let pq = supabase.from('crm_companies').select('id, name, vat_number')
          .eq('workspace_id', workspaceId).order('name').limit(10);
        if (term) pq = pq.ilike(CRM_SEARCH_COLUMN, foldedLike(term));
        const { data } = await pq;
        setPickParties((data ?? []) as PartyLite[]);
        return;
      }
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
  }, [picking, pickQuery, workspaceId, toast]);


  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Bank Feed</CardTitle>
            <CardDescription className="text-xs">
              Money movement across your accounts. Lines on a BANK account are matched against open
              invoices — whether they arrived from Revolut or from an imported statement. Stripe and Viva
              lines mirror payments their own webhooks already settled and are never re-matched.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {importAccounts.length > 0 && (
              <Select value="" onValueChange={(id) => {
                const a = importAccounts.find((x) => x.id === id);
                if (a) setImportFor(a);
              }}>
                <SelectTrigger aria-label="Import a statement" className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Import statement…" />
                </SelectTrigger>
                <SelectContent>
                  {importAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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
              <SelectItem value="all">All Providers</SelectItem>
              {PAYMENT_PROVIDER_SLUGS.map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {accounts.length > 1 && (
            <Select value={accountF || 'all'} onValueChange={(v) => setAccountF(v === 'all' ? '' : v)}>
              <SelectTrigger aria-label="Account filter" className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={direction || 'all'} onValueChange={(v) => setDirection(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Direction filter" className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In & Out</SelectItem>
              <SelectItem value="in">Money In</SelectItem>
              <SelectItem value="out">Money Out</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusF || 'all'} onValueChange={(v) => setStatusF(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Match status filter" className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Status</SelectItem>
              <SelectItem value="review">Needs Review</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="partial">Part Matched</SelectItem>
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
            <Input className="h-9 pl-8" placeholder="Counterparty, reference or transaction ID…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {focusTx && (
          <div className="flex items-center justify-between gap-2 border-b border-hairline bg-surface-sunken px-5 py-2 text-xs text-muted-foreground">
            <span>Showing the transaction from your notification.</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFocus}>Show all transactions</Button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="w-44">Account</TableHead>
                <TableHead className="w-24">Transaction ID</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {rows.map((r) => {
              const matched = r.matched_invoice_id ? invoices.get(r.matched_invoice_id) : null;
              const suggestions = (r.suggested_invoice_ids ?? []).map((id) => invoices.get(id)).filter(Boolean) as InvoiceLite[];
              const revolut = r.provider === 'revolut';
              const bankLine = revolut || r.provider === 'statement';
              const f = lineFacts(r);
              const own = f.cpKind === 'self' ? accountOf(null, f.cpAccountId) : null;
              const party = f.cpKind === 'self'
                ? (own?.name ?? 'Own account')
                : r.counterparty_name || f.cpName || f.merchantName || f.description || '—';
              const partySub = f.cpKind === 'self'
                ? 'Between own accounts'
                : [
                    f.iban ? ibanTail(f.iban) : f.accountNo,
                    f.merchantCity,
                    f.cpKind && !f.iban ? CP_KIND_LABEL[f.cpKind] : null,
                    (r.counterparty_name || f.cpName || f.merchantName) && f.description ? f.description : null,
                  ].filter(Boolean).join(' · ');
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.booked_at ? formatDate(r.booked_at) : '—'}
                    <div className="text-[11px]">{PROVIDER_LABEL[r.provider as PaymentProviderSlug] ?? (r.provider === 'statement' ? 'Statement' : r.provider)}</div>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <div className="flex items-center gap-1.5">
                      {r.direction === 'in'
                        ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-success" />
                        : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate font-medium">{party}</span>
                    </div>
                    {partySub && <div className="truncate pl-5 text-xs text-muted-foreground">{partySub}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{typeLabel(r.type)}</TableCell>
                  <TableCell className="max-w-56">
                    <div className="truncate text-xs" title={r.reference ?? undefined}>{r.reference ?? '—'}</div>
                    {matched && <div className="truncate text-xs text-muted-foreground">→ {matched.internal_number}</div>}
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-xs text-muted-foreground" title={accountOf(r.bank_account_id, r.revolut_account_id)?.name}>
                    {accountOf(r.bank_account_id, r.revolut_account_id)?.name ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground" title={r.transaction_id ?? undefined}>
                    {shortId(r.transaction_id)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1">
                      <MatchBadge row={r} />
                      {planHints.get(r.id) && (() => {
                        const h = planHints.get(r.id)!;
                        return h.candidates > 1 ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                            onClick={() => { setPicking({ row: r, kind: 'plan' }); setPickQuery(''); }}>
                            {h.candidates} plans match
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                            onClick={() => settlePlan(r, h)}>
                            Close “{h.title}”
                          </Button>
                        );
                      })()}
                      {suggestions.slice(0, 1).map((inv) => (
                        <Button key={inv.id} size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                          onClick={() => settleInvoice(r, inv.id)}>
                          Settle {inv.internal_number}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className={`whitespace-nowrap text-right font-medium tabular-nums ${r.direction === 'in' ? 'text-success' : ''}`}>
                    {r.direction === 'in' ? '+' : '−'}{Number(r.amount).toFixed(2)} {r.currency}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Transaction actions"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs">{Number(r.amount).toFixed(2)} {r.currency} · {PROVIDER_LABEL[r.provider as PaymentProviderSlug] ?? (r.provider === 'statement' ? 'Statement' : r.provider)}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDetail(r)}>View Details</DropdownMenuItem>
                      {/* `ignored` is how the auto-matcher stamps both legs of an internal pocket transfer (#351 D1); the server refuses matching those. */}
                      {revolut && r.direction === 'in' && r.match_status !== 'matched' && r.match_status !== 'ignored' && (
                        <>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'invoice' }); setPickQuery(''); }}>Match to Invoice…</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'order' }); setPickQuery(''); }}>Attach to Order…</DropdownMenuItem>
                        </>
                      )}
                      {revolut && r.direction === 'out' && r.match_status !== 'matched' && r.match_status !== 'ignored' && (
                        <>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'expense' }); setPickQuery(''); }}>Match to Expense Document…</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'bill' }); setPickQuery(''); }}>Match to Supplier Bill…</DropdownMenuItem>
                          {r.match_status !== 'partial' && (
                            <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'plan' }); setPickQuery(''); }}>Match to a Planned Payment…</DropdownMenuItem>
                          )}
                        </>
                      )}
                      {bankLine && (r.direction === 'in' || r.direction === 'out') && r.match_status !== 'matched' && r.match_status !== 'ignored' && r.match_status !== 'partial' && (
                        <DropdownMenuItem onClick={() => { setPicking({ row: r, kind: 'party' }); setPickQuery((r.counterparty_name ?? '').split(/\s+/)[0] ?? ''); }}>
                          {r.direction === 'in' ? 'Received from a Customer, on Account…' : 'Paid to a Supplier, on Account…'}
                        </DropdownMenuItem>
                      )}
                      {revolut && r.match_status !== 'matched' && r.match_status !== 'partial' && (
                        r.match_status === 'ignored'
                          ? <DropdownMenuItem onClick={() => ignore(r, false)}>Unignore</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => ignore(r, true)}>Ignore</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(r.reference ?? r.id); toast({ title: 'Reference copied' }); }}>
                        Copy Reference
                      </DropdownMenuItem>
                      {r.transaction_id && (
                        <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(r.transaction_id ?? ''); toast({ title: 'Transaction ID copied' }); }}>
                          Copy Transaction ID
                        </DropdownMenuItem>
                      )}
                      {!bankLine && (
                        <DropdownMenuItem disabled>
                          Settled by {PROVIDER_LABEL[r.provider as PaymentProviderSlug]} — Informational
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            </TableBody>
          </Table>
        )}
        {!loading && hintsFailed && (
          <p className="border-t border-border/60 px-5 py-2 text-xs text-amber-800 dark:text-amber-300">
            The open planned payments could not be read, so no line below is offering to close one.
            That is not a statement that none of them match.
          </p>
        )}
        {!loading && (
          <TablePagination page={page} total={total} onPageChange={setPage} label="transactions" />
        )}
      </CardContent>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {picking?.kind === 'expense' ? 'Match to an Expense Document'
                : picking?.kind === 'bill' ? 'Match to a Supplier Bill'
                : picking?.kind === 'party' ? (picking.row.direction === 'in' ? 'Received From — On Account' : 'Paid To — On Account')
                : picking?.kind === 'plan' ? 'Close a Planned Payment'
                : picking?.kind === 'order' ? 'Attach to an Order (Settles Its Open Invoice)'
                : 'Match to an Invoice'}
              {picking ? ` — ${Number(picking.row.amount).toFixed(2)} ${picking.row.currency}` : ''}
            </DialogTitle>
          </DialogHeader>
          {picking?.kind !== 'plan' && (
            <Input autoFocus value={pickQuery} onChange={(e) => setPickQuery(e.target.value)}
              placeholder={picking?.kind === 'expense' ? 'Supplier, VAT number or document number…' : picking?.kind === 'bill' ? 'Bill number or supplier…' : picking?.kind === 'party' ? 'Company name or VAT…' : picking?.kind === 'order' ? 'Order number…' : 'Invoice number…'} />
          )}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {picking?.kind === 'expense' ? (
              pickDocs === null
                ? <p className="px-3 py-2 text-xs text-muted-foreground">Looking for received documents…</p>
                : pickDocs.length === 0
                ? <p className="px-3 py-2 text-xs text-muted-foreground">
                    No open received document within 60 days of this line. If the receipt has not reached myDATA yet, it will appear here once it syncs. Search by supplier to look further back.
                  </p>
                : pickDocs.map((d) => (
                  <button key={d.doc_id} type="button" disabled={busy}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => picking && payDocument(picking.row, d)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.issuer_name ?? d.issuer_vat ?? 'Unknown supplier'}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[d.doc_number, d.issue_date ? formatDate(d.issue_date) : null, d.exact_amount ? 'same amount' : null, d.same_party ? 'same merchant' : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Number(d.due).toFixed(2)} {d.currency}</span>
                  </button>
                ))
            ) : picking?.kind === 'party' ? (
              pickParties.length === 0
                ? <p className="px-3 py-2 text-xs text-muted-foreground">No CRM company matches. Search by another part of the name, or by VAT number.</p>
                : pickParties.map((p) => (
                  <button key={p.id} type="button" disabled={busy}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => picking && bookToParty(picking.row, p)}>
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.vat_number ?? ''}</span>
                  </button>
                ))
            ) : picking?.kind === 'plan'
              ? (pickPlans ?? []).map((p) => (
                <button key={p.plan_id} type="button" disabled={busy}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => picking && settlePlan(picking.row, p)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      due {formatDate(p.scheduled_for)}
                      {p.party_matches ? ' · same counterparty' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{Number(p.amount).toFixed(2)} {p.currency}</span>
                </button>
              ))
              : picking?.kind === 'bill'
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
            {picking?.kind === 'party' || picking?.kind === 'expense' ? null : picking?.kind === 'plan' ? (
              pickPlans === null
                ? <p className="px-3 py-2 text-xs text-muted-foreground">Looking for open plans of this amount…</p>
                : pickPlans.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No open planned payment is for {Number(picking.row.amount).toFixed(2)} {picking.row.currency} within
                    45 days of this transfer. A plan is offered only when the amount matches — otherwise this is a
                    different payment, and closing a plan with it would report the wrong thing.
                  </p>
                )
            ) : ((picking?.kind === 'bill' && pickBills.length === 0) || (picking?.kind !== 'bill' && pickInvoices.length === 0)) && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {picking?.kind === 'order' ? 'No orders with an open invoice found.' : 'Nothing open found.'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (() => {
            const f = lineFacts(detail);
            const acct = accountOf(detail.bank_account_id, detail.revolut_account_id);
            const own = f.cpKind === 'self' ? accountOf(null, f.cpAccountId) : null;
            const matched = detail.matched_invoice_id ? invoices.get(detail.matched_invoice_id) : null;
            const synced = !!f.createdAt;
            return (
              <div className="space-y-3">
                <SheetHeader>
                  <SheetTitle className="font-sans">
                    {detail.direction === 'in' ? '+' : '−'}{formatMoney(Number(detail.amount), detail.currency)}
                  </SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2">
                    <span>{typeLabel(detail.type)} · {detail.direction === 'in' ? 'Money In' : 'Money Out'}</span>
                    <MatchBadge row={detail} />
                  </SheetDescription>
                </SheetHeader>

                {!synced && detail.provider === 'revolut' && (
                  <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                    This line was synced before full details were kept. Recipient and balance details show once it is pulled from Revolut again.
                  </p>
                )}

                <DetailSection title="Counterparty">
                  <DetailRow label="Name" value={f.cpKind === 'self' ? (own?.name ?? 'Own account') : (detail.counterparty_name || f.cpName || f.merchantName)} />
                  <DetailRow label="Account Type" value={f.cpKind ? CP_KIND_LABEL[f.cpKind] ?? f.cpKind : null} />
                  {f.cpProfile && <DetailRow label="Profile" value={PROFILE_LABEL[f.cpProfile] ?? f.cpProfile} />}
                  {f.iban && <DetailRow label="IBAN" value={compactIban(f.iban)} mono copy={compactIban(f.iban)} />}
                  {f.bic && <DetailRow label="BIC" value={f.bic} mono copy={f.bic} />}
                  {f.accountNo && <DetailRow label="Account Number" value={f.accountNo} mono copy={f.accountNo} />}
                  {f.cpRevtag && <DetailRow label="Revtag" value={`@${f.cpRevtag}`} />}
                  {f.cpCountry && <DetailRow label="Country" value={f.cpCountry} />}
                  {f.merchantName && (
                    <DetailRow label="Merchant" value={[f.merchantName, f.merchantCity, f.merchantCountry].filter(Boolean).join(', ')} />
                  )}
                  {f.merchantMcc && <DetailRow label="Merchant Category" value={f.merchantMcc} mono />}
                  {f.cardNumber && <DetailRow label="Card" value={[f.cardNumber, f.cardHolder].filter(Boolean).join(' · ')} />}
                  <DetailRow label="Description" value={f.description} />
                </DetailSection>

                <DetailSection title="Transaction">
                  <DetailRow label="Transaction ID" value={detail.transaction_id} mono copy={detail.transaction_id} />
                  <DetailRow label="Leg ID" value={detail.leg_id} mono copy={detail.leg_id} />
                  <DetailRow label="Reference" value={detail.reference} copy={detail.reference} />
                  <DetailRow label="State" value={STATE_LABEL[detail.state] ?? detail.state} />
                  <DetailRow label="Created" value={f.createdAt ? formatDate(f.createdAt, { withTime: true }) : null} />
                  <DetailRow label="Completed" value={f.completedAt ? formatDate(f.completedAt, { withTime: true }) : null} />
                  {detail.legs_total !== null && <DetailRow label="Legs" value={String(detail.legs_total)} />}
                  {f.requestId && <DetailRow label="Request ID" value={f.requestId} mono copy={f.requestId} />}
                  {f.relatedTx && <DetailRow label="Related Transaction" value={f.relatedTx} mono copy={f.relatedTx} />}
                </DetailSection>

                <DetailSection title="Money">
                  <DetailRow label="Account" value={acct?.name} />
                  <DetailRow label="Amount" value={formatMoney(Number(detail.amount), detail.currency)} />
                  {f.billAmount !== null && f.billCurrency && f.billCurrency !== detail.currency && (
                    <DetailRow label="Original Amount" value={formatMoney(f.billAmount, f.billCurrency)} />
                  )}
                  <DetailRow label="Fee" value={f.fee !== null ? formatMoney(f.fee, detail.currency) : null} />
                  <DetailRow label="Balance After" value={f.balanceAfter !== null ? formatMoney(f.balanceAfter, detail.currency) : null} />
                </DetailSection>

                <DetailSection title="Reconciliation">
                  <DetailRow label="Status" value={<MatchBadge row={detail} />} />
                  {matched && <DetailRow label="Invoice" value={matched.internal_number} />}
                  {detail.match_method && <DetailRow label="Matched By" value={typeLabel(detail.match_method)} />}
                  {detail.matched_at && <DetailRow label="Matched On" value={formatDate(detail.matched_at, { withTime: true })} />}
                </DetailSection>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {importFor && (
        <ImportStatementDialog
          bankAccountId={importFor.id}
          bankAccountName={importFor.name}
          open={!!importFor}
          onOpenChange={(v) => { if (!v) setImportFor(null); }}
          onImported={() => { setImportFor(null); void load(); }}
        />
      )}
    </Card>
  );
};
