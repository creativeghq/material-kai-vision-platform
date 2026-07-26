// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Wallet, ShoppingBag, ShoppingCart, Banknote, AlertCircle, CalendarClock, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  financeService,
  formatMoney,
  type CustomerTopProductRow,
  type PaymentWithAllocation,
} from '@/modules/finance/services/financeService';
import { ordersService } from '@/modules/finance/services/ordersService';
import { humanizeLabel } from '@/utils/humanize';
import { StatementActions } from '@/modules/finance/components/StatementActions';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { NewSupplierBillDialog } from '@/modules/finance/components/NewSupplierBillDialog';
import { PaymentRowActions } from '@/modules/finance/components/PaymentRowActions';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

// `customerName` is optional metadata used only to label the customer inside the
// create dialogs; the ids are what actually scope the created records.
type Target = { contactId?: string; companyId?: string; customerName?: string };


/**
 * Shared presentational account summary — the single source of layout for a party's money
 * position, used by BOTH the CRM Account tab and the Finance → Parties drill-down so they
 * look identical. Shows a net-position headline + an "As customer" and/or "As supplier"
 * section (each only when that role has data). Pure: callers pass already-resolved numbers.
 */
export const PartyAccountSummary: React.FC<{
  customer?: { invoiced: number; paid: number; outstanding: number } | null;
  supplier?: { billed: number; paid: number; outstanding: number; ordered?: number } | null;
  /** Per-customer AR aging breakdown (exclusive buckets, by days past due). */
  aging?: { not_due: number; due_0_30: number; due_31_90: number; due_90_plus: number } | null;
  /** Orders roll-up (count, total ordered value, amount still owed on un-invoiced orders). */
  orders?: { count: number; ordered: number; owedUninvoiced: number } | null;
  /** Gross margin earned on this customer, from the invoice lines' cost snapshots. */
  profitability?: {
    revenue_net: number; cogs: number; gross_margin: number;
    gross_margin_pct: number | null; cost_coverage_pct: number | null;
  } | null;
  meta?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ customer, supplier, aging, orders, profitability, meta }) => {
  const net = (customer?.outstanding ?? 0) - (supplier?.outstanding ?? 0);
  const netDir = net > 0 ? 'they owe us' : net < 0 ? 'we owe them' : 'settled';
  const netTone = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-destructive' : 'text-muted-foreground';
  const netRing = net > 0 ? 'ring-1 ring-emerald-500/25' : net < 0 ? 'ring-1 ring-destructive/30' : '';

  const cell = (label: string, value: React.ReactNode, danger = false) => (
    <Card className={`dashboard-card border-0 ${danger ? 'ring-1 ring-destructive/40' : ''}`}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );

  // KPI cell with a leading icon — used for the consolidated top strip (orders + balance + info),
  // so every column reads the same way (icon · label · value), like the old Balance row did.
  const stat = (icon: React.ReactNode, label: React.ReactNode, value: React.ReactNode, opts?: { danger?: boolean; tone?: string; title?: string }) => (
    <Card className={`dashboard-card border-0 ${opts?.danger ? 'ring-1 ring-destructive/40' : opts?.tone === netTone && netRing ? netRing : ''}`} title={opts?.title}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
        <div className={`text-lg font-semibold ${opts?.danger ? 'text-destructive' : opts?.tone ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );

  const agingCell = (label: string, value: number, danger = false) => (
    <div className={`rounded-md border border-border/50 px-2.5 py-1.5 ${danger && value > 0 ? 'border-destructive/40' : ''}`}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${danger && value > 0 ? 'text-destructive' : ''}`}>{formatMoney(value)}</div>
    </div>
  );

  // The net-balance headline. In the compact drill-down (no orders roll-up and no
  // account meta) it would sit alone on its own row above the role breakdown — so
  // there we fold it into the first role grid as the leading column instead of
  // leaving a lonely card. The full CRM Account tab keeps it in the top strip.
  const balanceStat = stat(
    <Wallet className="h-3.5 w-3.5" />, <>Balance <span className="normal-case text-[9px]">· {netDir}</span></>,
    formatMoney(Math.abs(net)),
    { tone: netTone, title: 'Net invoiced position: what they owe us on issued invoices minus what we owe them as a supplier. Separate from un-invoiced order cash (Owed on orders).' },
  );
  const showTopStrip = !!orders || (!!meta && meta.length > 0);
  const balanceInCustomer = !showTopStrip && !!customer;
  const balanceInSupplier = !showTopStrip && !customer && !!supplier;

  return (
    <div className="space-y-3">
      {/* Consolidated top strip — orders roll-up + net balance + account meta, all as compact
          icon columns in one row. Rendered only when there's an orders roll-up or account meta;
          in the compact drill-down the Balance moves into the role row below (see below). */}
      {showTopStrip && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {orders && stat(<ShoppingCart className="h-3.5 w-3.5" />, 'Orders', orders.count, { title: 'Active (non-cancelled) orders for this party' })}
          {orders && stat(<Banknote className="h-3.5 w-3.5" />, 'Ordered', formatMoney(orders.ordered), { title: 'Total value of those orders (incl. VAT)' })}
          {orders && stat(<AlertCircle className="h-3.5 w-3.5" />, 'Owed on orders', formatMoney(orders.owedUninvoiced), { danger: orders.owedUninvoiced > 0, title: 'Cash still owed on orders that have NOT been invoiced yet (order total − payments). Once invoiced, it moves into the Balance below.' })}
          {balanceStat}
          {meta && meta.length > 0 && (
            <Card className="dashboard-card border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Account</div>
                <div className="mt-1 space-y-0.5 text-xs">
                  {meta.map((m, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="text-foreground font-medium">{m.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {customer && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">As customer</div>
          <div className={`grid gap-3 ${balanceInCustomer ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
            {balanceInCustomer && balanceStat}
            {cell('Invoiced', formatMoney(customer.invoiced))}
            {cell('Paid', formatMoney(customer.paid))}
            {cell('They owe us', formatMoney(customer.outstanding), customer.outstanding > 0)}
          </div>
          {/* Profitability — what this customer is actually worth, not just what they bought.
              Revenue is net of VAT and COGS comes from each line's cost snapshot, so this is
              gross margin, not the cash position. `cost_coverage_pct` is shown whenever some
              lines carry no cost, because those inflate the margin to 100%. */}
          {profitability && profitability.revenue_net > 0 && (
            <div className="grid grid-cols-3 gap-3 pt-0.5">
              {cell('Revenue (net)', formatMoney(profitability.revenue_net))}
              {cell('Cost of goods', formatMoney(profitability.cogs))}
              <Card className="dashboard-card border-0">
                <CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross margin</div>
                  <div className={`text-lg font-semibold ${profitability.gross_margin < 0 ? 'text-destructive' : 'text-emerald-400'}`}>
                    {formatMoney(profitability.gross_margin)}
                    {profitability.gross_margin_pct != null && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{profitability.gross_margin_pct}%</span>
                    )}
                  </div>
                  {profitability.cost_coverage_pct != null && profitability.cost_coverage_pct < 99 && (
                    <div className="mt-0.5 text-[10px] text-amber-500" title="Lines with no cost snapshot count as pure margin, so the real figure is lower.">
                      only {profitability.cost_coverage_pct}% of revenue has a cost
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {aging && (aging.not_due + aging.due_0_30 + aging.due_31_90 + aging.due_90_plus) > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-0.5">
              {agingCell('Not due', aging.not_due)}
              {agingCell('1–30 days', aging.due_0_30)}
              {agingCell('31–90 days', aging.due_31_90)}
              {agingCell('90+ days', aging.due_90_plus, aging.due_90_plus > 0)}
            </div>
          )}
        </div>
      )}

      {supplier && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">As supplier</div>
          <div className={`grid gap-3 grid-cols-2 ${balanceInSupplier ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
            {balanceInSupplier && balanceStat}
            {cell('Billed to us', formatMoney(supplier.billed))}
            {cell('Paid to them', formatMoney(supplier.paid))}
            {cell('We owe', formatMoney(supplier.outstanding), supplier.outstanding > 0)}
            {cell('Ordered', formatMoney(supplier.ordered ?? 0))}
          </div>
        </div>
      )}

    </div>
  );
};

/**
 * #201 — consolidated account overview for the CRM party page: the shared PartyAccountSummary
 * (customer + supplier net position) + open orders / last payment meta + the customer's top
 * products to push + email-statement + an optional "View ledger in Finance" cross-link.
 */
export const CustomerAccountOverview: React.FC<Target & { isSupplier?: boolean; ledgerHref?: string }> = ({ contactId, companyId, isSupplier, ledgerHref }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ invoicedTotal: number; paidTotal: number; outstandingTotal: number; quoteCount: number } | null>(null);
  const [supplierAcct, setSupplierAcct] = useState<{ billedTotal: number; paidTotal: number; outstandingTotal: number; orderedTotal: number } | null>(null);
  const [lastPayment, setLastPayment] = useState<{ paid_at: string; amount: number; currency: string } | null>(null);
  const [openOrders, setOpenOrders] = useState(0);
  const [aging, setAging] = useState<{ not_due: number; due_0_30: number; due_31_90: number; due_90_plus: number } | null>(null);
  // Orders roll-up for the KPI strip. Receivables/payables now live PER ORDER (open an order),
  // not as a separate party-level section.
  const [orderStats, setOrderStats] = useState<{ count: number; ordered: number; owedUninvoiced: number } | null>(null);
  const [profitability, setProfitability] = useState<Awaited<ReturnType<typeof financeService.getCustomerProfitability>> | null>(null);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId, companyId, activeWorkspaceId, isSupplier]);

  const load = async () => {
    if (!contactId && !companyId) return;
    setLoading(true);
    try {
      const [acct, supAcct, payments] = await Promise.all([
        financeService.getCustomerAccount({ contactId, companyId }),
        isSupplier ? financeService.getSupplierAccount({ contactId, companyId }) : Promise.resolve(null),
        financeService.listPayments({ counterpartyContactId: contactId, counterpartyCompanyId: companyId, direction: 'in', limit: 1 }),
      ]);
      setAccount(acct ? { invoicedTotal: acct.invoicedTotal, paidTotal: acct.paidTotal, outstandingTotal: acct.outstandingTotal, quoteCount: acct.quoteCount } : null);
      setSupplierAcct(supAcct ? { billedTotal: supAcct.billedTotal, paidTotal: supAcct.paidTotal, outstandingTotal: supAcct.outstandingTotal, orderedTotal: supAcct.orderedTotal } : null);
      const p = payments[0];
      setLastPayment(p ? { paid_at: p.paid_at, amount: p.amount, currency: p.currency } : null);

      // Orders roll-up — count, total ordered value, and the still-owed amount on orders that
      // haven't been invoiced yet. This drives the KPI strip ("Orders" + "Owed on orders").
      if (activeWorkspaceId) {
        try {
          const ordersList = await ordersService.list({ workspaceId: activeWorkspaceId, companyId, contactId });
          const active = ordersList.filter((o) => o.status !== 'cancelled');
          const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId: activeWorkspaceId, companyId, contactId });
          setOrderStats({
            count: active.length,
            ordered: active.reduce((a, o) => a + Number(o.total), 0),
            owedUninvoiced: uninvoiced.reduce((a, o) => a + o.outstanding, 0),
          });
          setOpenOrders(active.filter((o) => o.status !== 'fulfilled').length);
        } catch { setOrderStats(null); }

        // Per-customer AR aging breakdown (skip for supplier-only views).
        const buckets = await financeService.getCustomerAgingBuckets({ workspaceId: activeWorkspaceId, companyId, contactId });
        const b = buckets[0];
        setAging(b ? { not_due: Number(b.not_due), due_0_30: Number(b.due_0_30), due_31_90: Number(b.due_31_90), due_90_plus: Number(b.due_90_plus) } : null);

        // What we actually earned on this customer (revenue net − cost of goods on the lines).
        setProfitability(await financeService
          .getCustomerProfitability(activeWorkspaceId, { companyId, contactId })
          .catch(() => null));
      }
    } catch (e) {
      console.error('account overview load failed', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;

  const partyId = companyId ?? contactId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-primary">Account overview</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {ledgerHref && (
            <Link to={ledgerHref}><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5 mr-2" /> View ledger in Finance</Button></Link>
          )}
          {partyId && (
            <StatementActions
              partyType={companyId ? 'company' : 'contact'}
              partyId={partyId}
              workspaceId={activeWorkspaceId}
              side={isSupplier && !account ? 'supplier' : 'customer'}
            />
          )}
        </div>
      </div>

      <PartyAccountSummary
        customer={account ? { invoiced: account.invoicedTotal, paid: account.paidTotal, outstanding: account.outstandingTotal } : null}
        supplier={supplierAcct ? { billed: supplierAcct.billedTotal, paid: supplierAcct.paidTotal, outstanding: supplierAcct.outstandingTotal, ordered: supplierAcct.orderedTotal } : null}
        aging={aging}
        orders={orderStats}
        profitability={profitability}
        meta={[
          { label: 'Open orders', value: openOrders },
          { label: 'Last payment', value: lastPayment ? new Date(lastPayment.paid_at).toLocaleDateString() : '—' },
        ]}
      />

      {/* Receivables & payables are managed PER ORDER now — open an order to add/see them.
          "Top items to push" renders separately (CustomerTopItemsCard) BELOW the orders list. */}
    </div>
  );
};

/**
 * Party-level payments list — every cash movement against this customer/supplier across ALL
 * their orders, money received (in) and paid out, newest first. The Account overview only shows
 * paid totals + the last-payment date; this card is the itemised history. Read-only — payments
 * are recorded per order (open an order to add one).
 */
export const PartyPaymentsCard: React.FC<Target & { roles?: { customer?: boolean; supplier?: boolean } }> = ({ contactId, companyId, customerName, roles }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PaymentWithAllocation[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [page, setPage] = useState(1);
  // Money IN from a customer only makes sense for a customer; money OUT (expense / bill) for a
  // supplier. With no role info (unknown) show both, preserving prior behavior.
  const showCustomerActions = !roles || roles.customer !== false;
  const showSupplierActions = !roles || roles.supplier === true;

  const reload = useCallback(async () => {
    if (!activeWorkspaceId || (!contactId && !companyId)) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await financeService.listPayments({
        // Paged client-side below — the cap is a safety ceiling, not a page size. At 50 a
        // long-standing customer's older payments were simply unreachable.
        workspaceId: activeWorkspaceId, counterpartyCompanyId: companyId, counterpartyContactId: contactId, limit: 500,
      });
      setRows(list);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [contactId, companyId, activeWorkspaceId]);

  useEffect(() => { void reload(); }, [reload]);
  // A different party is a different list; deleting a payment shrinks the current one.
  useEffect(() => { setPage(1); }, [contactId, companyId]);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-4 w-4" /> Payments
        </CardTitle>
        {activeWorkspaceId && (
          <div className="flex items-center gap-2">
            {/* Money OUT to this party (pay a supplier) is a cost → the expense flow (bill + payment). */}
            {showSupplierActions && (
              <>
                <Button size="sm" variant="outline" onClick={() => setBillOpen(true)}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Record bill
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
                  <ShoppingBag className="h-3.5 w-3.5 mr-1" /> Add expense
                </Button>
              </>
            )}
            {/* Money IN from a customer — hidden on a pure supplier where it doesn't apply. */}
            {showCustomerActions && (
              <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Record payment
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No payments recorded for this party yet. Use “Record payment” above to add one, or record it against a specific order.
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Direction</th>
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right w-28"></th>
              </tr>
            </thead>
            <tbody>
              {paginate(rows, page).map((p) => {
                const isIn = p.direction === 'in';
                return (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {isIn ? 'Received' : 'Paid'}
                      </span>
                    </td>
                    <td className="px-4 py-2">{p.method ? humanizeLabel(p.method) : '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.reference || '—'}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${isIn ? 'text-emerald-500' : ''}`}>
                      {isIn ? '+' : '−'}{formatMoney(Number(p.amount), p.currency)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <PaymentReceiptActions paymentId={p.id} direction={p.direction} />
                        {activeWorkspaceId && <PaymentRowActions payment={p} workspaceId={activeWorkspaceId} onChanged={reload} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePagination page={page} total={rows.length} onPageChange={setPage} label="payments" />
          </>
        )}
      </CardContent>
      {activeWorkspaceId && (
        <RecordPaymentDialog
          workspaceId={activeWorkspaceId}
          open={payOpen}
          onOpenChange={setPayOpen}
          onSaved={reload}
          initialCounterparty={{ contactId: contactId ?? null, companyId: companyId ?? null }}
        />
      )}
      {activeWorkspaceId && (
        <NewExpenseDialog
          workspaceId={activeWorkspaceId}
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          prefill={{ supplier: { companyId: companyId ?? null, contactId: companyId ? null : (contactId ?? null), name: customerName ?? null } }}
          onCreated={() => { setExpenseOpen(false); void reload(); }}
        />
      )}
      {activeWorkspaceId && (
        <NewSupplierBillDialog
          workspaceId={activeWorkspaceId}
          open={billOpen}
          onOpenChange={setBillOpen}
          prefill={{ supplier: { companyId: companyId ?? null, contactId: companyId ? null : (contactId ?? null), name: customerName ?? null } }}
          onCreated={() => { setBillOpen(false); void reload(); }}
        />
      )}
    </Card>
  );
};

/**
 * Standalone "Top items to push" card — the customer's repeat-buy history (invoice + un-invoiced
 * order lines) filtered to what's currently in warehouse stock, with on-hand qty. Rendered on the
 * CRM party page AFTER the orders list so it reads as a follow-up suggestion, not a header.
 */
export const CustomerTopItemsCard: React.FC<Target> = ({ contactId, companyId }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<CustomerTopProductRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspaceId || (!contactId && !companyId)) { setTopProducts([]); setLoading(false); return; }
      setLoading(true);
      try {
        const rows = await financeService.reportCustomerTopProducts({ workspaceId: activeWorkspaceId, companyId, contactId, limit: 6 });
        if (!cancelled) setTopProducts(rows);
      } catch { if (!cancelled) setTopProducts([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [contactId, companyId, activeWorkspaceId]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Top items to push <span className="text-[10px] font-normal text-muted-foreground">· in stock</span></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-right">Qty bought</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Last ordered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
            ) : topProducts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No previously-bought items are in stock to push right now.</td></tr>
            ) : (
              topProducts.map((p) => (
                <tr key={p.product_id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <div className="font-medium">{p.description || 'Product'}</div>
                    {p.sku && <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(p.total_quantity).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(p.revenue_net)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.order_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{Number(p.on_hand).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{p.last_ordered ? new Date(p.last_ordered).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

