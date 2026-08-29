// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Wallet, ShoppingBag, ShoppingCart, Banknote, CalendarClock, Plus, Coins } from 'lucide-react';
import { HubEmptyState } from '@/components/core/hub';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  financeService,
  formatMoney,
  type CustomerTopProductRow,
  type PartyProfitPosition,
  type PaymentWithAllocation,
} from '@/modules/finance/services/financeService';
import { ordersService, type PartyOrderPosition } from '@/modules/finance/services/ordersService';
import { StatementActions } from '@/modules/finance/components/StatementActions';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { PaymentRowActions } from '@/modules/finance/components/PaymentRowActions';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { ReleaseCreditDialog } from '@/modules/finance/components/ReleaseCreditDialog';
import { AllocatePartyProfitDialog } from '@/modules/finance/components/AllocatePartyProfitDialog';
import { CreditReleasesCard } from '@/modules/finance/components/CreditReleasesCard';
import { netPositionDirection, netPositionTotal, netPositionVisible } from '@/modules/finance/utils/netPosition';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';

// `customerName` is optional metadata used only to label the customer inside the
// create dialogs; the ids are what actually scope the created records.
type Target = { contactId?: string; companyId?: string; customerName?: string };

/**
 * Column counts for the account top strip, keyed by how many tiles actually render.
 *
 * Spelled out rather than interpolated because Tailwind only ships classes it can see as literal
 * strings — a computed `lg:grid-cols-${n}` compiles to nothing and the grid silently collapses to
 * one column.
 */
const TOP_STRIP_SM: Record<number, string> = {
  1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2', 5: 'sm:grid-cols-3', 6: 'sm:grid-cols-3',
};
const TOP_STRIP_LG: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
};


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
  /** Orders roll-up, straight from `ordersService.partyOrderPosition`. `owedNet` is cash on
   *  un-invoiced orders, SIGNED by direction (sales positive, purchase negative) — it is a term of
   *  the account balance, not a tile of its own. `settledUninvoiced` IS a tile: it is the money
   *  the invoice figures below structurally cannot account for. */
  orders?: { count: number; ordered: number; owedNet: number; settledUninvoiced: number } | null;
  /** Cash of theirs we're holding that isn't settled against anything yet (unallocated money-in). */
  credit?: number | null;
  /**
   * Turn the "On account" tile's number into an action: stop holding it, keep it as income.
   * Omitted on read-only surfaces — the tile then just reports the balance as before.
   */
  onReleaseCredit?: () => void;
  /**
   * Whether that credit is actually theirs to keep. DERIVED IN SQL
   * (`vw_finance_parties.credit_releasable`) and passed in — never re-decided here. Money on
   * account while an invoice is still open is that invoice's payment arriving early, not a
   * windfall, and the two states have to read differently or the operator books a receivable
   * as profit.
   */
  creditReleasable?: boolean;
  /** Gross margin earned on this customer, from the invoice lines' cost snapshots. */
  profitability?: {
    revenue_net: number; cogs: number; gross_margin: number;
    gross_margin_pct: number | null; cost_coverage_pct: number | null;
  } | null;
  /**
   * What is TAKEABLE across this party's orders, from `get_party_profit_position` — an
   * aggregation of the same per-order derivation the order screen offers, so the party button and
   * the order button can never name different amounts for one margin.
   *
   * Deliberately NOT `profitability.profit_allocated / profit_unallocated`. Those come off the
   * P&L view (invoice lines + uninvoiced orders) and are a different quantity; printing one and
   * enforcing the other would put two answers to "how much may I take" on a single card.
   */
  profitPosition?: PartyProfitPosition | null;
  /** Turn that figure into the action. Omitted on read-only surfaces — it then just reports. */
  onAllocateProfit?: () => void;
  meta?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ customer, supplier, aging, orders, credit, onReleaseCredit, creditReleasable, profitability, profitPosition, onAllocateProfit, meta }) => {
  // Unallocated cash of theirs is a liability — we're holding money that isn't settled against
  // anything yet — so it pushes the net position into THEIR favour, exactly like a supplier
  // balance does. Leaving it out was why a customer who had overpaid still read "settled · €0".
  const heldCredit = Math.max(0, credit ?? 0);
  // Un-invoiced order cash is the FOURTH term, not a tile beside the balance. It used to print as
  // "Owed on orders" — a one-directional number on a page whose whole subject is a two-directional
  // account, so a customer who had paid ahead read €0 instead of "we hold theirs".
  const netTerms = {
    customerOutstanding: customer?.outstanding ?? 0,
    heldCredit,
    supplierOutstanding: supplier?.outstanding ?? 0,
    orderOutstanding: orders?.owedNet ?? 0,
  };
  const net = netPositionTotal(netTerms);
  const netDir = netPositionDirection(net);
  const netTone = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-destructive' : 'text-muted-foreground';
  const netRing = net > 0 ? 'ring-1 ring-emerald-500/25' : net < 0 ? 'ring-1 ring-destructive/30' : '';

  const cell = (label: string, value: React.ReactNode, danger = false, title?: string) => (
    <Card className={`dashboard-card border-0 ${danger ? 'ring-1 ring-destructive/40' : ''}`} title={title}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );

  // KPI cell with a leading icon — used for the consolidated top strip (orders + balance + info),
  // so every column reads the same way: icon · label · value.
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
    <Wallet className="h-3.5 w-3.5" />, <>Account balance <span className="normal-case text-[9px]">· {netDir}</span></>,
    formatMoney(Math.abs(net)),
    {
      tone: netTone,
      title: 'The whole account in one number: outstanding on issued invoices, PLUS cash still owed'
        + ' on orders nobody has invoiced yet, LESS money of theirs we hold on account, LESS'
        + ' anything outstanding to them as a supplier. Positive is due to us; negative sits in'
        + ' their favour.',
    },
  );
  const showCredit = heldCredit > 0.005;
  /**
   * The tile renders for every CUSTOMER, including at zero.
   *
   * Hiding it when empty made "there is nothing of theirs to release" and "this feature does not
   * exist on this screen" look identical, and a customer with €420 of gross margin and €0 on
   * account reads as the second. They are opposite facts: margin is profit you have ALREADY
   * earned and the P&L already counts it; on-account is cash of theirs you are still holding.
   * One €0.00 tile settles that question permanently; guessing cost more than the tile does.
   *
   * It still does not force the strip on by itself — that is the rule `showBalance` documents
   * above, and breaking it reprints the same number twice.
   *
   * `!!customer` alone was not "is this a customer" — it is "does `vw_customer_account_summary`
   * have a row", and that view is built from quotes and invoices. A business that sells straight
   * off orders has neither, so the tile disappeared for exactly the party whose money is hardest
   * to account for: the page then said nothing at all about whether their payment had been
   * allocated, which is the question the tile exists to answer.
   */
  const showCreditTile = !!customer || (!supplier && !!orders);
  /**
   * Two rows ("As customer" / "As supplier") only earn their keep when the party IS both and the
   * sides net off. With one role the split labels a distinction that doesn't exist, and the top
   * strip ends up restating the role row: Balance == that role's outstanding, and `Ordered`
   * appears in both. So: one role → one row, and the duplicated tiles are dropped rather than
   * repeated (Balance survives only when it says something the role row doesn't).
   */
  const bothRoles = !!customer && !!supplier;
  /**
   * Balance is a NET of three terms. Netting one term is not netting — it reprints that term with
   * a direction word beside it, which is how a party holding €1,373 of unallocated credit and
   * nothing else ended up showing "On account €1,373" next to "Balance · we owe them €1,373":
   * the same number twice, the second derived entirely from the first.
   *
   * `bothRoles || showCredit` was the culprit — credit alone forced the card on with nothing to
   * net against. The rule this restores is the one stated above: Balance appears only when it
   * says something the tiles beside it do not.
   */
  const showBalance = netPositionVisible(netTerms);
  const showTopStrip = !!orders || showBalance || (!!meta && meta.length > 0);
  /**
   * Cash that moved on orders nobody has invoiced yet. Rendered only when there IS some, because
   * it exists to answer a question that only arises then: "we received money and every invoice
   * figure on this page says zero — where did it go?". Excluded once the order is invoiced, or the
   * same euro would print here AND as "Paid" (see `partyOrderPosition`).
   */
  const showOrderCash = !!orders && Math.abs(orders.settledUninvoiced) > 0.005;
  /**
   * How many tiles the strip will ACTUALLY render. Never guess the column count: the contents
   * are five independent conditions — orders contributes two tiles plus a third when cash has
   * moved on un-invoiced ones, balance / credit / meta one each — so any guess leaves a hole at
   * the end of the row for the parties it does not match. Counting what is about to render fills
   * the width at 3, 4, 5 or 6 tiles alike.
   */
  const topTiles = (orders ? 2 : 0) + (showOrderCash ? 1 : 0) + (showCreditTile ? 1 : 0)
    + (showBalance ? 1 : 0) + (meta && meta.length > 0 ? 1 : 0);
  const balanceInCustomer = showBalance && !showTopStrip && !!customer;
  const balanceInSupplier = showBalance && !showTopStrip && !customer && !!supplier;
  /** The orders roll-up already shows what we ordered — don't print it again per role. */
  const showRoleOrdered = !orders;
  const gridCols: Record<number, string> = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' };
  const supplierCols = 3 + (balanceInSupplier ? 1 : 0) + (showRoleOrdered ? 1 : 0);
  // Profitability is earned on orders as well as invoices, so it must render even for a party
  // with no invoices at all (where `customer` is null) — it used to be nested inside that block.
  const showProfit = !!profitability && profitability.revenue_net > 0;

  return (
    <div className="space-y-3">
      {/* Consolidated top strip — orders roll-up + net balance + account meta, all as compact
          icon columns in one row. Rendered only when there's an orders roll-up or account meta;
          in the compact drill-down the Balance moves into the role row below (see below). */}
      {showTopStrip && (
        <div className={`grid grid-cols-2 gap-3 ${TOP_STRIP_SM[topTiles]} ${TOP_STRIP_LG[topTiles]}`}>
          {orders && stat(<ShoppingCart className="h-3.5 w-3.5" />, 'Orders', orders.count, { title: 'Active (non-cancelled) orders for this party' })}
          {orders && stat(<Banknote className="h-3.5 w-3.5" />, 'Ordered', formatMoney(orders.ordered), { title: 'Total value of those orders (incl. VAT)' })}
          {orders && showOrderCash && stat(
            <Coins className="h-3.5 w-3.5" />, 'Paid on orders', formatMoney(orders.settledUninvoiced),
            { title: 'Money that has actually moved on orders which have NOT been invoiced yet.'
              + ' An order is not a financial document, so this cash settles no invoice and appears'
              + ' in none of the invoice figures below — open the Orders list to see which order it'
              + ' went against.' },
          )}
          {showCreditTile && (
            <Card
              className="dashboard-card border-0"
              title="Their money we hold, unmatched to any order, invoice or bill."
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><Wallet className="h-3.5 w-3.5" />On account</div>
                <div className={`text-lg font-semibold ${showCredit ? 'text-amber-500' : 'text-muted-foreground'}`}>{formatMoney(heldCredit)}</div>
                {/* Three states, and the empty one is the point: it says WHY there is nothing to do
                    here, instead of leaving a blank where an action might have been. */}
                {!showCredit ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">Nothing held — every euro of theirs is matched</div>
                ) : creditReleasable === false ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">Held against their open invoices</div>
                ) : onReleaseCredit ? (
                  /* The way to stop holding it. Without this the balance had no exit other than
                     refunding the customer, so leftover money sat as a liability forever. */
                  <button type="button" onClick={onReleaseCredit}
                    title="Keep it as income instead of holding it."
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <Coins className="h-3 w-3" /> Release to Income
                  </button>
                ) : null}
              </CardContent>
            </Card>
          )}
          {showBalance && balanceStat}
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
          {bothRoles && <div className="text-[11px] font-medium text-muted-foreground">As customer</div>}
          <div className={`grid gap-3 ${balanceInCustomer ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
            {balanceInCustomer && balanceStat}
            {/* All three are INVOICE figures — they say nothing about an order that was never
                invoiced. Left unlabelled, a customer who ordered, paid and was never invoiced read
                "Invoiced €0 · Paid €0 · Outstanding €0" beside a payment of theirs on the same
                screen. The orders tiles above carry that cash; these titles say so. */}
            {cell('Invoiced', formatMoney(customer.invoiced), false,
              'Total of the invoices issued to this customer. Orders not yet invoiced are not in here.')}
            {cell('Paid', formatMoney(customer.paid), false,
              'Cash allocated to those invoices. Money received against an order that has not been'
              + ' invoiced yet settles no invoice, so it is reported by the orders tiles instead.')}
            {/* Reads as the third term of Invoiced − Paid, which is what it is. The old wording
                ("They owe us") stated the same number as an accusation on a page account managers
                open in front of the customer. */}
            {cell('Outstanding', formatMoney(customer.outstanding), customer.outstanding > 0,
              'Still due on issued invoices. What is owed on un-invoiced orders is in the account balance, not here.')}
          </div>
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

      {/* Profitability — what this customer is actually worth, not just what they bought. Revenue is
          net of VAT and COGS comes from each line's cost snapshot, so this is gross margin, not the
          cash position. Covers invoiced revenue AND un-invoiced sales orders, so a business that
          sells on orders alone still sees its margin. `cost_coverage_pct` is shown whenever some
          lines carry no cost, because those inflate the margin to 100%. */}
      {showProfit && profitability && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">Profitability</div>
          <div className="grid grid-cols-3 gap-3">
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
                {/* How much of it has actually been taken, and the way to take the rest. Rendered
                    only once there is something to say, so a party with no orders carries no
                    permanent "€0.00 taken" — but once one euro is either taken or takeable, both
                    halves are stated, because "€420 margin" alone stops being the whole answer the
                    moment part of it is spoken for.

                    Figures from `profitPosition`, never from `profitability`: the button's cap and
                    the printed number have to be the same derivation. */}
                {profitPosition && (profitPosition.allocated > 0.005 || profitPosition.available > 0.005) && (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span title="Margin you have taken as profit on this party's orders, and what is still on them. Taking it does not move cash and is not counted as income twice — the revenue and cost above already are the P&L.">
                      {profitPosition.allocated > 0.005
                        ? <>{formatMoney(profitPosition.allocated, profitPosition.currency)} taken</>
                        : <>none taken</>}
                      {profitPosition.available > 0.005
                        ? <> · {formatMoney(profitPosition.available, profitPosition.currency)} left</>
                        : <> · all of it</>}
                    </span>
                    {onAllocateProfit && profitPosition.available > 0.005 && (
                      <button type="button" onClick={onAllocateProfit}
                        className="ml-auto shrink-0 underline hover:text-foreground">
                        Allocate as profit
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {supplier && (
        <div className="space-y-1.5">
          {bothRoles && <div className="text-[11px] font-medium text-muted-foreground">As supplier</div>}
          <div className={`grid gap-3 grid-cols-2 ${gridCols[supplierCols] ?? 'md:grid-cols-4'}`}>
            {balanceInSupplier && balanceStat}
            {cell('Billed to us', formatMoney(supplier.billed), false,
              'Total of the supplier bills received. Purchase orders not yet billed are not in here.')}
            {cell('Paid to them', formatMoney(supplier.paid), false,
              'Cash allocated to those bills. Money paid against a purchase order that has not been'
              + ' billed yet settles no bill, so it is reported by the orders tiles instead.')}
            {cell('Outstanding', formatMoney(supplier.outstanding), supplier.outstanding > 0,
              'Still due on received bills. What is owed on un-billed purchase orders is in the account balance, not here.')}
            {showRoleOrdered && cell('Ordered', formatMoney(supplier.ordered ?? 0))}
          </div>
        </div>
      )}

    </div>
  );
};

/**
 * Consolidated account overview for the CRM party page: the shared PartyAccountSummary
 * (customer + supplier net position) + open orders / last payment meta + the customer's top
 * products to push + email-statement + an optional "View ledger in Finance" cross-link.
 */
export const CustomerAccountOverview: React.FC<Target & { isSupplier?: boolean; ledgerHref?: string }> = ({ contactId, companyId, customerName, isSupplier, ledgerHref }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ invoicedTotal: number; paidTotal: number; outstandingTotal: number; quoteCount: number } | null>(null);
  const [supplierAcct, setSupplierAcct] = useState<{ billedTotal: number; paidTotal: number; outstandingTotal: number; orderedTotal: number } | null>(null);
  const [lastPayment, setLastPayment] = useState<{ paid_at: string; amount: number; currency: string } | null>(null);
  const [openOrders, setOpenOrders] = useState(0);
  const [aging, setAging] = useState<{ not_due: number; due_0_30: number; due_31_90: number; due_90_plus: number } | null>(null);
  // Orders roll-up for the KPI strip. Receivables/payables now live PER ORDER (open an order),
  // not as a separate party-level section.
  const [orderStats, setOrderStats] = useState<PartyOrderPosition['stats'] | null>(null);
  // Their cash we hold that isn't settled against anything (overpayment / deposit on account).
  const [credit, setCredit] = useState(0);
  const [creditReleasable, setCreditReleasable] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [profitability, setProfitability] = useState<Awaited<ReturnType<typeof financeService.getCustomerProfitability>> | null>(null);
  // What is TAKEABLE across their orders — the allocate button's cap, and the figure printed
  // beside it. Separate from `profitability`, which is the P&L view; see the prop's own note.
  const [profitPosition, setProfitPosition] = useState<PartyProfitPosition | null>(null);
  const [allocateOpen, setAllocateOpen] = useState(false);

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

      // Orders roll-up — count, total ordered value, the still-owed amount on orders that haven't
      // been invoiced yet, and the cash already taken on them. Assembled by
      // `partyOrderPosition` so this KPI strip and the Finance → Parties drill-down report the
      // same position; it used to be rolled up here by hand and existed on this page only.
      if (activeWorkspaceId) {
        try {
          const pos = await ordersService.partyOrderPosition({ workspaceId: activeWorkspaceId, companyId, contactId });
          setOrderStats(pos.stats);
          setOpenOrders(pos.rows.filter((o) => o.status !== 'fulfilled').length);
        } catch { setOrderStats(null); }

        // Per-customer AR aging breakdown (skip for supplier-only views).
        // The view returns one row per (customer, CURRENCY) — it no longer sums a EUR and a USD
        // invoice into one currency-less total (audit #287 T2-8). The service orders by
        // total_outstanding DESC, so [0] is the customer's LARGEST exposure rather than an
        // arbitrary row. Every workspace is single-currency today so this picks the only row;
        // showing all currencies at once is a panel redesign, not a one-line change, and picking
        // deterministically beats picking silently.
        const buckets = await financeService.getCustomerAgingBuckets({ workspaceId: activeWorkspaceId, companyId, contactId });
        const b = buckets[0];
        if (buckets.length > 1) {
          console.warn(
            `[finance] ${companyId ?? contactId} has open balances in ${buckets.length} currencies `
            + `(${buckets.map((x) => x.currency).join(', ')}); the aging panel shows ${b.currency} only.`,
          );
        }
        setAging(b ? { not_due: Number(b.not_due), due_0_30: Number(b.due_0_30), due_31_90: Number(b.due_31_90), due_90_plus: Number(b.due_90_plus) } : null);

        // What we actually earned on this customer (revenue net − cost of goods on the lines).
        setProfitability(await financeService
          .getCustomerProfitability(activeWorkspaceId, { companyId, contactId })
          .catch(() => null));

        // Margin still on their orders. A failed read leaves this null, which renders as no
        // figure and no button — never as "nothing left to take", which would be a wrong answer
        // rather than an absent one.
        setProfitPosition(await financeService
          .getPartyProfitPosition(activeWorkspaceId, { companyId, contactId })
          .catch(() => null));

        // Unallocated money-in — cash of theirs sitting on account. Invisible before, so a
        // customer who had paid ahead of the paperwork showed a €0 "settled" balance.
        //
        // Read from `vw_finance_parties`, the same row the Parties list column, the order-close
        // prompt and the nightly sweep read — so the four surfaces cannot show four different
        // answers to "how much of theirs are we holding, and may we keep it?".
        const pos = await financeService
          .getPartyCreditPosition(activeWorkspaceId, { companyId, contactId })
          .catch(() => null);
        setCredit(Number(pos?.on_account_credit ?? 0));
        setCreditReleasable(!!pos?.credit_releasable);
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
      <SectionHeader
        title="Account Overview"
        actions={<>
          {ledgerHref && (
            <Link to={ledgerHref}><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5 mr-2" /> View ledger in finance</Button></Link>
          )}
          {partyId && (
            <StatementActions
              partyType={companyId ? 'company' : 'contact'}
              partyId={partyId}
              workspaceId={activeWorkspaceId}
              side={isSupplier && !account ? 'supplier' : 'customer'}
            />
          )}
        </>}
      />

      <PartyAccountSummary
        customer={account ? { invoiced: account.invoicedTotal, paid: account.paidTotal, outstanding: account.outstandingTotal } : null}
        supplier={supplierAcct ? { billed: supplierAcct.billedTotal, paid: supplierAcct.paidTotal, outstanding: supplierAcct.outstandingTotal, ordered: supplierAcct.orderedTotal } : null}
        aging={aging}
        orders={orderStats}
        credit={credit}
        creditReleasable={creditReleasable}
        onReleaseCredit={activeWorkspaceId ? () => setReleaseOpen(true) : undefined}
        profitability={profitability}
        profitPosition={profitPosition}
        onAllocateProfit={activeWorkspaceId ? () => setAllocateOpen(true) : undefined}
        meta={[
          { label: 'Open orders', value: openOrders },
          { label: 'Last payment', value: lastPayment ? formatDate(lastPayment.paid_at) : '—' },
        ]}
      />

      {/* What has already been kept off this party's account, with an Undo. Hides itself when
          there is nothing — the common case — so it costs a record with no releases one query.
          Deliberately on the CRM page too, not only in Finance: a release moves money out of a
          customer's account with no document issued to them, and the person looking at the
          customer is the one who needs to see that it happened. */}
      {activeWorkspaceId && (
        <CreditReleasesCard
          workspaceId={activeWorkspaceId}
          party={{ companyId: companyId ?? null, contactId: companyId ? null : (contactId ?? null) }}
          onChanged={() => void load()}
        />
      )}

      {activeWorkspaceId && (
        <ReleaseCreditDialog
          workspaceId={activeWorkspaceId}
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          party={{ companyId: companyId ?? null, contactId: companyId ? null : (contactId ?? null), name: customerName ?? null }}
          available={credit}
          onDone={() => void load()}
        />
      )}

      {activeWorkspaceId && (
        <AllocatePartyProfitDialog
          workspaceId={activeWorkspaceId}
          open={allocateOpen}
          onOpenChange={setAllocateOpen}
          party={{ companyId: companyId ?? null, contactId: companyId ? null : (contactId ?? null), name: customerName ?? null }}
          onDone={() => void load()}
        />
      )}

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
              <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
                <ShoppingBag className="h-3.5 w-3.5 mr-1" /> Add expense
              </Button>
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
          <HubEmptyState
            icon={Wallet}
            title="No payments recorded yet"
            description="Money that has actually moved with this party. You can record it here against the party as a whole, or against a specific order from the order itself."
            action={showCustomerActions ? (
              <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Record payment</Button>
            ) : undefined}
          />
        ) : (
          <>
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Direction</th>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right w-28"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {paginate(rows, page).map((p) => {
                const isIn = p.direction === 'in';
                return (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {isIn ? 'Received' : 'Paid'}
                      </span>
                    </td>
                    {/* Account, not method — the account is the fact; the method is derived from it. */}
                    <td className="px-4 py-2">{p.bank_account_name ?? '—'}</td>
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
          </div>
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
        <div className="table-scroll">
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
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Number(p.total_quantity))}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(p.revenue_net)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.order_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{formatNumber(Number(p.on_hand))}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{p.last_ordered ? formatDate(p.last_ordered) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>
  );
};

