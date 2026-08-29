import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, FileText, Receipt, Printer, BookOpen, Coins, Users, Banknote,
  ChevronDown, Mail, Download, Copy, RotateCcw, ExternalLink, RefreshCw, ShoppingCart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { escapeHtml } from '@/utils/escapeHtml';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import {
  financeService, formatMoney, type PartyRow, type Invoice, type SupplierBill,
  type PaymentWithAllocation, type PartyLedgerRow, type CustomerAgingBuckets,
  type PartyProfitPosition,
} from '@/modules/finance/services/financeService';
import {
  ordersService, ORDER_STATUS_LABEL, ORDER_PAYMENT_LABEL, type PartyOrderPosition,
} from '@/modules/finance/services/ordersService';
import { PartyAccountSummary } from '@/modules/finance/components/CustomerFinanceTabs';
import { netPositionDirection } from '@/modules/finance/utils/netPosition';
import { usePartyStatementActions } from '@/modules/finance/components/StatementActions';
import { ReleaseCreditDialog } from '@/modules/finance/components/ReleaseCreditDialog';
import { AllocatePartyProfitDialog } from '@/modules/finance/components/AllocatePartyProfitDialog';
import { CreditReleasesCard } from '@/modules/finance/components/CreditReleasesCard';
import { ExpensePaymentsDialog } from '@/modules/finance/components/ExpensePaymentsDialog';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone, directionTone } from '@/utils/statusTone';
import { TablePagination, paginate, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, NONE_VALUE, useFilters, type FilterGroupDef } from '@/components/core/filters';
import { useCompanyResearch } from '@/modules/crm/components/RefreshResearchButton';
import { formatDate } from '@/utils/datetime';

const LEDGER_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', payment: 'Payment', receipt: 'Receipt',
  supplier_bill: 'Supplier bill', supplier_credit_note: 'Supplier credit note',
  // Not a document — an expectation. Labelled so it can never be mistaken for one on a printed
  // Καρτέλα. (`manual_receivable`/`manual_payable` used to sit here; nothing has ever emitted
  // them, so they were two labels for rows that do not exist.)
  order: 'Order (un-invoiced)',
};
/** Greek labels for the printed Καρτέλα — the print is the surface an accountant reads. */
const LEDGER_KIND_LABEL_EL: Record<string, string> = {
  invoice: 'Τιμολόγιο', credit_note: 'Πιστωτικό', payment: 'Πληρωμή', receipt: 'Απόδειξη',
  supplier_bill: 'Τιμολόγιο προμηθευτή', supplier_credit_note: 'Πιστωτικό προμηθευτή',
  order: 'Παραγγελία (χωρίς τιμολόγιο)',
};

const SEGMENT_LABELS: Record<string, string> = {
  b2b: 'B2B', retail: 'Retail', wholesale: 'Wholesale', public_sector: 'Public sector',
};

type PartyRole = 'customer' | 'supplier' | 'both';

/**
 * `role` carries NO accessor on purpose — it is pushed down to `listParties({role})` and
 * re-fetches, so `applyFilters` must pass it through instead of matching it again in memory.
 * Everything else narrows the loaded page client-side.
 */
function buildPartyFilters(rows: PartyRow[]): FilterGroupDef[] {
  const bound = (pick: (r: PartyRow) => number) => {
    const max = rows.reduce((m, r) => Math.max(m, Number(pick(r)) || 0), 0);
    return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
  };
  const receivable = bound((r) => r.receivable_outstanding);
  const payable = bound((r) => r.payable_outstanding);
  const onAccount = bound((r) => r.on_account_credit);

  return [
    {
      key: 'general', label: 'General', icon: Users,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search', placeholder: 'Name or email',
          accessor: (r: PartyRow) => [r.display_name, r.email],
        },
        {
          key: 'role', type: 'select', label: 'Role',
          description: 'Applied server-side — changing it reloads the list.',
          options: [
            { value: 'customer', label: 'Customers' },
            { value: 'supplier', label: 'Suppliers' },
            { value: 'both', label: 'Both (customer + supplier)' },
          ],
        },
        {
          key: 'segment', type: 'multi', label: 'Segment',
          options: [
            ...Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label })),
            { value: NONE_VALUE, label: 'Unsegmented' },
          ],
          accessor: (r: PartyRow) => r.contact_group ?? undefined,
        },
        {
          key: 'over_limit', type: 'bool', label: 'Credit limit',
          description: 'Outstanding receivable exceeds the party’s credit limit.',
          trueLabel: 'Over credit limit', falseLabel: 'Within credit limit',
          accessor: (r: PartyRow) => r.over_credit_limit,
        },
        {
          // The whole point of surfacing `credit_releasable`: "who is holding money we could
          // simply keep?" was a question with no answer short of opening every party in turn.
          key: 'credit_releasable', type: 'bool', label: 'Money on account',
          description: 'Cash of theirs settled against nothing, with nothing outstanding on their side — it can be released to income.',
          trueLabel: 'Releasable credit', falseLabel: 'Nothing to release',
          accessor: (r: PartyRow) => r.credit_releasable,
        },
      ],
    },
    {
      key: 'balances', label: 'Balances', icon: Coins,
      fields: [
        {
          key: 'receivable_outstanding', type: 'range', label: 'Receivable',
          min: receivable.min, max: receivable.max, accessor: (r: PartyRow) => r.receivable_outstanding,
        },
        {
          key: 'payable_outstanding', type: 'range', label: 'Payable',
          min: payable.min, max: payable.max, accessor: (r: PartyRow) => r.payable_outstanding,
        },
        {
          key: 'on_account_credit', type: 'range', label: 'On account',
          min: onAccount.min, max: onAccount.max, accessor: (r: PartyRow) => r.on_account_credit,
        },
      ],
    },
  ];
}

interface Props { workspaceId: string; statementsEnabled: boolean; autoOpenParty?: string | null; financeBase?: string }

export const PartiesTab: React.FC<Props> = ({ workspaceId, statementsEnabled, autoOpenParty, financeBase }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [agingMap, setAgingMap] = useState<Record<string, CustomerAgingBuckets>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PartyRow | null>(null);
  const [page, setPage] = useState(1);

  const filterGroups = useMemo(() => buildPartyFilters(rows), [rows]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<PartyRow>(rows, filterGroups);
  // The only server-side dimension: it changes what we fetch, not how we filter what we hold.
  const role = (filterValues.role as PartyRole | undefined) ?? 'all';

  useEffect(() => { void load(); }, [workspaceId, role]);

  // Deep-link from another surface (e.g. the CRM Account tab → "View ledger in Finance")
  // pre-opens that party's drill-down once the list has loaded. A brand-new party with no finance
  // rows won't be in the list — tell the user rather than silently landing on the bare list.
  const handledAutoOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenParty || loading || handledAutoOpen.current === autoOpenParty) return;
    const [t, id] = autoOpenParty.split(':');
    const match = rows.find((r) => r.party_type === t && r.party_id === id);
    handledAutoOpen.current = autoOpenParty;
    if (match) setSelected(match);
    else toast({ title: 'Nothing to show yet', description: 'This party has no invoices, orders or payments in this workspace yet.' });
  }, [autoOpenParty, rows, loading, toast]);

  const load = async () => {
    try {
      setLoading(true);
      const [r, aging] = await Promise.all([
        financeService.listParties({ workspaceId, role }),
        financeService.getCustomerAgingBuckets({ workspaceId }),
      ]);
      setRows(r);
      // One row per (customer, CURRENCY) since audit #287 T2-8. A plain `map[key] = a` was
      // LAST-WRITE-WINS across currencies, so a customer holding EUR and USD balances showed
      // whichever row the view happened to return last — nondeterministic, and silently dropping
      // the other. Keep the largest exposure instead: deterministic, and the number shown is at
      // least the worst one rather than a coin flip.
      const map: Record<string, CustomerAgingBuckets> = {};
      for (const a of aging) {
        const key = a.customer_company_id ? `company:${a.customer_company_id}` : a.customer_contact_id ? `contact:${a.customer_contact_id}` : null;
        if (!key) continue;
        const prev = map[key];
        if (!prev || Number(a.total_outstanding) > Number(prev.total_outstanding)) map[key] = a;
      }
      setAgingMap(map);
    } catch (err: any) {
      toast({ title: 'Failed to load parties', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Any filter change narrows the list — start the narrowed set at its first page.
  useEffect(() => { setPage(1); }, [filterValues]);
  // …and clamp on reload so a shrunken list can't leave an empty page showing.
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  const agingFor = (r: PartyRow) => agingMap[`${r.party_type}:${r.party_id}`];

  const totals = useMemo(() => {
    let rcv = 0, pay = 0, due_0_30 = 0, due_31_90 = 0, due_90_plus = 0;
    for (const r of filtered) {
      rcv += Number(r.receivable_outstanding || 0);
      pay += Number(r.payable_outstanding || 0);
      const a = agingMap[`${r.party_type}:${r.party_id}`];
      if (a) { due_0_30 += Number(a.due_0_30); due_31_90 += Number(a.due_31_90); due_90_plus += Number(a.due_90_plus); }
    }
    return { rcv, pay, due_0_30, due_31_90, due_90_plus };
  }, [filtered, agingMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total customers owe</div>
          <div className={`text-lg font-semibold ${totals.rcv > 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.rcv)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding due within the last 30 days"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 1–30 days</div>
          <div className="text-lg font-semibold">{formatMoney(totals.due_0_30)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding 31–90 days past due"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 31–90 days</div>
          <div className={`text-lg font-semibold ${totals.due_31_90 > 0 ? 'text-amber-500' : ''}`}>{formatMoney(totals.due_31_90)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding more than 90 days past due"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 90+ days</div>
          <div className={`text-lg font-semibold ${totals.due_90_plus > 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.due_90_plus)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">We owe suppliers</div>
          <div className="text-lg font-semibold">{formatMoney(totals.pay)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Customers &amp; Suppliers
          </CardTitle>
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            searchPlaceholder="Name or email"
            title="Filter parties"
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No parties match.</div>
          ) : (
            <>
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Party</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-right">Invoiced</th>
                  {/* Neutral ledger terms rather than "They owe us" / "We owe them" — these sit
                      side by side, so they also need to stay distinguishable. */}
                  <th className="px-4 py-2 text-right">Receivable</th>
                  <th className="px-4 py-2 text-right">Payable</th>
                  {/* Their money we are sitting on. It is not a receivable and not a payable —
                      it is a liability with no document, which is exactly why it never appeared
                      on this table and could sit for a year without anyone noticing. */}
                  <th className="px-4 py-2 text-right">On account</th>
                  <th className="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filtered, page).map((r) => (
                  <tr
                    key={`${r.party_type}-${r.party_id}`}
                    className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                    // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                    // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                    // row is invalid ARIA and yields a focus stop with no name.
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(r); }} className="font-medium text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.display_name}</button>
                        {r.over_credit_limit && (
                          <span className="text-[10px] font-medium text-destructive" title={`Outstanding ${formatMoney(Number(r.receivable_outstanding || 0))} exceeds credit limit ${formatMoney(Number(r.credit_limit || 0))}`}>Over limit</span>
                        )}
                      </div>
                      {r.email && <div className="text-[10px] text-muted-foreground">{r.email}</div>}
                    </td>
                    {/* Roles as plain words (colour on the text, not a pill background) — Customer /
                        Supplier read at a glance without the tag look. Segment trails in muted text. */}
                    <td className="px-4 py-2">
                      <span className="text-xs">
                        {r.is_customer && <span className="text-emerald-600 dark:text-emerald-400">Customer</span>}
                        {r.is_customer && r.is_supplier && <span className="text-muted-foreground"> · </span>}
                        {r.is_supplier && <span className="text-sky-600 dark:text-sky-400">Supplier</span>}
                        {!r.is_customer && !r.is_supplier && <span className="text-muted-foreground">—</span>}
                        {r.contact_group && <span className="text-muted-foreground"> · {SEGMENT_LABELS[r.contact_group] ?? r.contact_group}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.invoiced_total || 0))}</td>
                    <td className={`px-4 py-2 text-right ${Number(r.receivable_outstanding) > 0 ? 'text-destructive font-medium' : ''}`}>
                      {formatMoney(Number(r.receivable_outstanding || 0))}
                      {(() => {
                        const a = agingFor(r);
                        if (!a || (Number(a.due_0_30) + Number(a.due_31_90) + Number(a.due_90_plus)) <= 0) return null;
                        return (
                          <div className="mt-0.5 flex justify-end gap-1.5 text-[9px] font-normal tabular-nums">
                            {Number(a.due_0_30) > 0 && <span className="text-muted-foreground" title="1–30 days past due">30d {formatMoney(Number(a.due_0_30))}</span>}
                            {Number(a.due_31_90) > 0 && <span className="text-amber-500" title="31–90 days past due">90d {formatMoney(Number(a.due_31_90))}</span>}
                            {Number(a.due_90_plus) > 0 && <span className="text-destructive" title="More than 90 days past due">90+ {formatMoney(Number(a.due_90_plus))}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.payable_outstanding || 0))}</td>
                    {/* Amber only when it is actually releasable: money on account while an
                        invoice is still open is not a windfall, it is the payment for that
                        invoice arriving early, and colouring it as an opportunity would push the
                        operator to book a receivable as profit. */}
                    <td className={`px-4 py-2 text-right ${r.credit_releasable ? 'text-amber-500 font-medium' : Number(r.on_account_credit) > 0.005 ? '' : 'text-muted-foreground'}`}>
                      {Number(r.on_account_credit) > 0.005 ? formatMoney(Number(r.on_account_credit)) : '—'}
                      {r.credit_releasable && (
                        <div className="text-[9px] font-normal text-muted-foreground">can be released</div>
                      )}
                    </td>
                    {/* No "Open" column: the whole row opens the party, and the name in the first
                        cell is a real <button> — so the trailing one was a third way to do the same
                        thing, and the only one that cost a column. Keyboard/AT reach the party
                        through that name button, which is why this can go. */}
                    <td className={`px-4 py-2 text-right font-medium ${Number(r.net_position) < 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.net_position || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="parties" />
            </>
          )}
        </CardContent>
      </Card>

      <PartyDetailDialog
        party={selected}
        aging={selected ? agingMap[`${selected.party_type}:${selected.party_id}`] ?? null : null}
        open={selected !== null}
        onClose={() => setSelected(null)}
        statementsEnabled={statementsEnabled}
        financeBase={financeBase ?? '/finance'}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

interface DetailProps {
  party: PartyRow | null;
  aging: CustomerAgingBuckets | null;
  open: boolean;
  onClose: () => void;
  statementsEnabled: boolean;
  /** Always `FINANCE_BASE` — every in-app document link is built off it. */
  financeBase: string;
}

/**
 * One party's whole finance position, as a document with TABS rather than a scroll of stacked
 * tables: with real data those lists are hundreds of rows each and the ledger below them is
 * unreachable.
 *
 * Two rules this surface holds to:
 *  • Every document NUMBER is a link when a target exists — an invoice/credit note opens its
 *    page, a supplier bill (which has no page) opens the same settlement dialog Payables opens,
 *    the party name opens its CRM record. A number you cannot follow is a dead end.
 *  • Every action lives in ONE "Actions" menu in the header. The work behind them stays in
 *    `usePartyStatementActions` / `useCompanyResearch`, shared with the button-row surfaces.
 */
const PartyDetailDialog: React.FC<DetailProps> = ({ party, aging, open, onClose, statementsEnabled, financeBase }) => {
  const { toast } = useToast();
  // `/crm/companies/:id` — the one CRM address, reachable by anyone with crm.view. The branch
  // that used to pick an `/admin/crm` twin here keyed off a finance base that never existed, and
  // the twin itself is now a redirect.
  const crmBase = '/crm';
  const crmHref = party ? `${crmBase}/${party.party_type === 'company' ? 'companies' : 'contacts'}/${party.party_id}` : '';
  const [tab, setTab] = useState<'invoices' | 'bills' | 'orders' | 'payments' | 'ledger'>('invoices');
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [payments, setPayments] = useState<PaymentWithAllocation[]>([]);
  /**
   * The party's orders + their settlement position. An order is not a financial document, so it is
   * absent from the ledger and from `vw_finance_parties` by design — which left the money taken on
   * an un-invoiced order visible NOWHERE on this page except as an unexplained payment.
   */
  const [orderPos, setOrderPos] = useState<PartyOrderPosition | null>(null);
  /** What we EARNED on this party, from the same RPC the CRM Account tab reads. */
  const [profitability, setProfitability] = useState<Awaited<ReturnType<typeof financeService.getCustomerProfitability>> | null>(null);
  /** Their cash we hold that isn't settled against anything yet (unallocated money-in). */
  const [credit, setCredit] = useState(0);
  const [releaseOpen, setReleaseOpen] = useState(false);
  // Margin still takeable across their orders — the allocate button's cap. See the prop's note on
  // why this is not `profitability.profit_unallocated`.
  const [profitPosition, setProfitPosition] = useState<PartyProfitPosition | null>(null);
  const [allocateOpen, setAllocateOpen] = useState(false);
  /** Bumped after a credit release so the drill-down re-reads the balance it just changed. */
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * The supplier bill whose settlement detail is open. A bill has no page of its own, so its
   * number opens the SAME dialog the Payables list opens rather than dead-ending as plain text.
   */
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  /**
   * Which party the research line below the header belongs to. The hook holds its last summary
   * for as long as this dialog is mounted (it is mounted once, for every party) — without this
   * the report from the party you just closed captions the next one you open.
   */
  const [researchParty, setResearchParty] = useState<string | null>(null);
  // Each drill-down list pages independently. A bare `.slice(0, N)` here silently hides every
  // older invoice/bill/payment with no way to reach it.
  const [invPage, setInvPage] = useState(1);
  const [billPage, setBillPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  // Running ledger (καρτέλα)
  const [ledgerSide, setLedgerSide] = useState<'customer' | 'supplier'>('customer');
  /**
   * Which BASIS the running balance is on.
   *
   * On (default): un-invoiced orders count as entries, so the balance answers "where does this
   * relationship stand" — the €3,000 they ordered and the €3,000 they paid cancel out.
   * Off: documents only, which is the AR/AP balance that `vw_finance_parties`, the aging buckets
   * and the emailed statement report. Both are correct answers to different questions, so the
   * basis is stated on screen and on the print rather than silently chosen.
   */
  const [includeOrders, setIncludeOrders] = useState(true);
  const [ledger, setLedger] = useState<PartyLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [opening, setOpening] = useState(0);
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(`${thisYear}-12-31`);

  // Which roles this party actually holds — the same predicate the summary tiles use, so a
  // supplier-only party is never offered an empty "Invoices" tab. The `*_total > 0` terms catch
  // a party whose role flag was never set but who has documents anyway; the list-length terms
  // catch documents the totals exclude (drafts), so nothing loaded is unreachable.
  const showCustomer = !!party && (party.is_customer || Number(party.invoiced_total) > 0 || Number(party.receivable_outstanding) > 0 || invoices.length > 0);
  const showSupplier = !!party && (party.is_supplier || Number(party.billed_total) > 0 || Number(party.payable_outstanding) > 0 || bills.length > 0);

  // Default the ledger side to whichever role the party holds.
  useEffect(() => {
    if (!party) return;
    setLedgerSide(party.is_customer ? 'customer' : party.is_supplier ? 'supplier' : 'customer');
    // Land on the first list this party actually has. Keyed off the party row alone, so it
    // agrees with the triggers rendered on the very first frame, before the lists load.
    setTab(party.is_customer || Number(party.invoiced_total) > 0 || Number(party.receivable_outstanding) > 0
      ? 'invoices'
      : party.is_supplier || Number(party.billed_total) > 0 || Number(party.payable_outstanding) > 0
        ? 'bills'
        : 'payments');
    setResearchParty(null);
    setInvPage(1); setBillPage(1); setOrderPage(1); setPayPage(1); setLedgerPage(1);
  }, [party]);

  // A new side/date range/basis is a new ledger — don't land the user mid-way through it.
  useEffect(() => { setLedgerPage(1); }, [ledgerSide, fromDate, toDate, includeOrders]);

  useEffect(() => {
    if (!party) { setLedger([]); setOpening(0); return; }
    void (async () => {
      try {
        setLedgerLoading(true);
        const common = {
          workspaceId: party.workspace_id, side: ledgerSide,
          companyId: party.party_type === 'company' ? party.party_id : null,
          contactId: party.party_type === 'contact' ? party.party_id : null,
        };
        // Same basis on both halves — they are summed into one running balance.
        const [rows, open] = await Promise.all([
          financeService.getPartyLedger({ ...common, from: fromDate, to: toDate, includeOrders }),
          financeService.getPartyOpeningBalance({ ...common, before: fromDate, includeOrders }),
        ]);
        setLedger(rows); setOpening(open);
      } catch (err: any) {
        toast({ title: 'Failed to load ledger', description: err?.message, variant: 'destructive' });
        setLedger([]); setOpening(0);
      } finally { setLedgerLoading(false); }
    })();
  }, [party, ledgerSide, fromDate, toDate, includeOrders, toast]);

  // Chronological entries with progressive debit/credit totals + a running balance
  // seeded from the opening (carry-forward) balance — full Καρτέλα shape.
  const ledgerWithBalance = useMemo(() => {
    let pd = 0, pc = 0;
    return ledger.map((r) => {
      pd += Number(r.debit || 0); pc += Number(r.credit || 0);
      return { ...r, progrDebit: pd, progrCredit: pc, balance: opening + pd - pc };
    });
  }, [ledger, opening]);
  const totalDebit = ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].progrDebit : 0;
  const totalCredit = ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].progrCredit : 0;
  const ledgerClosing = opening + totalDebit - totalCredit;
  /**
   * A running balance across currencies is not a balance (#351 D5).
   *
   * Every figure below — the progressive totals, the closing, the printed Kartela — was summed
   * across whatever currencies the party's documents happened to carry, and then formatted with
   * the currency of the FIRST row that had one. Adding dollars to euros produces a confident
   * number in no currency at all, and the one artefact this screen exports is handed to the
   * counterparty as a statement of their account.
   *
   * So a mixed ledger states the reason instead of the number: the per-row amounts still print in
   * their own currency (which they always should have), the derived columns show nothing, and the
   * export is refused rather than issued wrong.
   */
  const ledgerCurrencies = useMemo(
    () => [...new Set(ledger.map((r) => r.currency).filter(Boolean) as string[])].sort(),
    [ledger],
  );
  const ledgerCurrency = ledgerCurrencies[0];
  const mixedCurrency = ledgerCurrencies.length > 1;
  const m = (n: number) => formatMoney(n, ledgerCurrency);
  /** A derived figure: shown only when it is one currency's worth of money. */
  const md = (n: number) => (mixedCurrency ? '—' : formatMoney(n, ledgerCurrency));
  /** A row's own amount, in the currency the row is actually in. */
  const mr = (n: number, ccy?: string | null) => formatMoney(n, ccy ?? ledgerCurrency);
  /** Same tone rule as the account-balance tile above, so one position never reads two ways. */
  const closingTone = ledgerClosing > 0 ? 'text-emerald-600 dark:text-emerald-400'
    : ledgerClosing < 0 ? 'text-destructive' : 'text-muted-foreground';

  /**
   * Where a ledger line leads. `doc_id` is the row's own record; `related_id` is what it settles
   * (a credit note's invoice, a supplier credit note's bill) and carries the kinds that have no
   * surface of their own. Returns null when nothing is reachable — the cell then renders plain
   * text rather than a link that goes nowhere.
   */
  const ledgerHref = (r: PartyLedgerRow): string | null => {
    if (r.doc_kind === 'invoice' && r.doc_id) return `${financeBase}/invoices/${r.doc_id}`;
    if (r.doc_kind === 'credit_note' && r.related_id) return `${financeBase}/invoices/${r.related_id}`;
    if (r.doc_kind === 'order' && r.doc_id) return `${financeBase}/orders/${r.doc_id}`;
    return null;
  };
  const ledgerBillId = (r: PartyLedgerRow): string | null => {
    if (r.doc_kind === 'supplier_bill') return r.doc_id;
    if (r.doc_kind === 'supplier_credit_note') return r.related_id;
    return null;
  };

  const printLedger = () => {
    if (!party) return;
    // This HTML is written into a same-origin about:blank popup via
    // document.write — CRM party name/email + ledger doc fields (attacker-influenced via
    // counterparty/import data) MUST be escaped or an <img onerror> in a party name runs
    // in the app origin and can read the Supabase session token from localStorage.
    // A statement of account with a cross-currency balance is worse than no statement — this one
    // leaves the building (#351 D5).
    if (mixedCurrency) {
      toast({
        title: 'This ledger spans more than one currency',
        description: `Entries are in ${ledgerCurrencies.join(', ')}. A single running balance across currencies is not a real figure, so the Kartela cannot be printed. Narrow the date range to a single-currency period.`,
        variant: 'destructive',
      });
      return;
    }
    const esc = escapeHtml; // shared canonical escaper (was an identical local copy)
    const sideLabel = ledgerSide === 'customer' ? 'Πελάτης / Customer' : 'Προμηθευτής / Supplier';
    const rowsHtml = ledgerWithBalance.map((r) => `
      <tr>
        <td>${r.entry_date ? formatDate(r.entry_date) : ''}</td>
        <td>${esc(LEDGER_KIND_LABEL_EL[r.doc_kind] ?? LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind)}</td>
        <td>${esc(r.doc_number)}</td>
        <td class="r">${Number(r.debit) ? m(Number(r.debit)) : ''}</td>
        <td class="r">${Number(r.credit) ? m(Number(r.credit)) : ''}</td>
        <td class="r g">${m(r.progrDebit)}</td>
        <td class="r g">${m(r.progrCredit)}</td>
        <td class="r b">${m(r.balance)}</td>
      </tr>`).join('');
    /**
     * The closing line is an ACCOUNT BALANCE, not an accusation.
     *
     * It used to read "Χρεωστικό υπόλοιπο (οφείλει) / owes us" — the same number the neutral tiles
     * print, restated as a debt claim, on the one artefact that gets handed to the counterparty.
     * The direction word comes from `netPositionDirection`, the same helper the on-screen balance
     * uses, so the two cannot drift apart again. Greek keeps the accounting pair
     * (Χρεωστικό/Πιστωτικό υπόλοιπο) minus the οφείλει/οφείλουμε gloss, which was the accusatory
     * half.
     *
     * The sign convention is uniform across both sides: positive is due to us (a customer who has
     * not paid, or a supplier we have overpaid), negative sits in their favour.
     */
    const closingEl = ledgerClosing > 0 ? 'Χρεωστικό υπόλοιπο'
      : ledgerClosing < 0 ? 'Πιστωτικό υπόλοιπο' : 'Μηδενικό υπόλοιπο';
    const closingLabel = `${closingEl} / ${netPositionDirection(ledgerClosing)}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Καρτέλα — ${esc(party.display_name)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600&display=swap" rel="stylesheet">
      <style>body{font-family:'Open Sans',Arial,Helvetica,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 2px}
      .sub{color:#555;font-size:12px;margin-bottom:4px}.id{font-size:11px;color:#444;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:4px 6px}
      th{text-align:left;background:#f1f1f4}.r{text-align:right}.g{color:#666}.b{font-weight:600}
      tfoot td{font-weight:bold;border-top:2px solid #333;background:#fafafa}
      .open td{font-weight:600;color:#555;background:#fafafa}.close{margin-top:10px;font-size:13px;text-align:right}</style></head>
      <body><h1>Καρτέλα ${ledgerSide === 'customer' ? 'Πελάτη' : 'Προμηθευτή'}</h1>
      <div class="sub">Από ${formatDate(fromDate)} Έως ${formatDate(toDate)} · ${sideLabel}</div>
      <!-- The basis is printed, never assumed. A Καρτέλα that silently counts orders is not the
           AR/AP balance an accountant expects to reconcile, so the sheet has to say which one it is. -->
      <div class="sub">${includeOrders
        ? 'Βάση: παραστατικά + παραγγελίες χωρίς τιμολόγιο / documents + un-invoiced orders'
        : 'Βάση: μόνο παραστατικά / documents only'}</div>
      <div class="id">${esc(party.display_name)}${party.email ? ' · ' + esc(party.email) : ''} · printed ${formatDate(new Date())}</div>
      <table>
      <thead><tr><th>Ημ/νία</th><th>Τύπος</th><th>Παραστατικό</th><th class="r">Χρέωση</th><th class="r">Πίστωση</th><th class="r">Προοδ. Χρέωση</th><th class="r">Προοδ. Πίστωση</th><th class="r">Υπόλοιπο</th></tr></thead>
      <tbody>
      <tr class="open"><td colspan="7">Προηγούμενα Σύνολα / Opening balance</td><td class="r">${m(opening)}</td></tr>
      ${rowsHtml || '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px">Καμία κίνηση στην περίοδο.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">Σύνολα</td><td class="r">${m(totalDebit)}</td><td class="r">${m(totalCredit)}</td><td class="r">${m(totalDebit)}</td><td class="r">${m(totalCredit)}</td><td class="r">${m(ledgerClosing)}</td></tr></tfoot>
      </table>
      <div class="close">Υπόλοιπο λογαριασμού / Account balance · ${closingLabel}: <strong>${m(Math.abs(ledgerClosing))}</strong></div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the ledger.', variant: 'destructive' }); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!party) { setInvoices([]); setBills([]); setPayments([]); setOrderPos(null); setCredit(0); setProfitability(null); setProfitPosition(null); return; }
    void (async () => {
      try {
        setLoading(true);
        const [res, bal, orders, profit, profitPos] = await Promise.all([
          financeService.getPartyDetail({
            workspaceId: party.workspace_id, partyType: party.party_type, partyId: party.party_id,
          }),
          // Unallocated money-in, so this drill-down reads the same net position as the CRM
          // Account tab (which shows it as "On account").
          financeService.getCustomerBalance(party.workspace_id, {
            companyId: party.party_type === 'company' ? party.party_id : null,
            contactId: party.party_type === 'contact' ? party.party_id : null,
          }).catch(() => null),
          // Same assembly the CRM Account tab uses, so the two surfaces report one position.
          ordersService.partyOrderPosition({
            workspaceId: party.workspace_id,
            companyId: party.party_type === 'company' ? party.party_id : null,
            contactId: party.party_type === 'contact' ? party.party_id : null,
          }).catch(() => null),
          // Margin earned on this party. Finance is where somebody goes to ASK what a customer is
          // worth, and this drill-down was the one party surface that did not answer — the CRM
          // Account tab has shown it since it shipped, so the two read as different features.
          financeService.getCustomerProfitability(party.workspace_id, {
            companyId: party.party_type === 'company' ? party.party_id : null,
            contactId: party.party_type === 'contact' ? party.party_id : null,
          }).catch(() => null),
          // What is still takeable off their orders. A failed read stays null — no figure and no
          // button — rather than becoming a confident "nothing left".
          financeService.getPartyProfitPosition(party.workspace_id, {
            companyId: party.party_type === 'company' ? party.party_id : null,
            contactId: party.party_type === 'contact' ? party.party_id : null,
          }).catch(() => null),
        ]);
        setInvoices(res.invoices); setBills(res.bills); setPayments(res.payments);
        setOrderPos(orders);
        setProfitability(profit);
        setProfitPosition(profitPos);
        setCredit(Number(bal?.customer_credit ?? 0));
      } catch (err: any) {
        toast({ title: 'Failed to load detail', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [party, toast, reloadKey]);

  // Both action hooks are called HERE, not inside the dropdown: Radix unmounts menu content on
  // close, which would take the Connect-email modal and the in-flight research state with it.
  const statement = usePartyStatementActions({
    partyType: party?.party_type ?? 'company',
    partyId: party?.party_id ?? '',
    email: party?.email,
    side: ledgerSide,
    from: fromDate,
    to: toDate,
  });
  // Company parties only — `party_id` is a `crm_contacts.id` for contact parties and the registry
  // functions write onto `crm_companies`. The empty id is never reached: the menu entry that
  // calls `run` renders only when `party_type === 'company'`.
  const research = useCompanyResearch({
    companyId: party?.party_type === 'company' ? party.party_id : '',
    workspaceId: party?.workspace_id,
  });

  const busyStatement = statement.busy !== null;
  /** A research run in flight belongs to the party that started it, not whoever is on screen now. */
  const researchHere = researchParty === party?.party_id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="font-display text-xl">
                {party ? <Link to={crmHref} className="hover:underline" title="Open the CRM record">{party.display_name}</Link> : ''}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                {party?.is_customer && <span className="text-emerald-600 dark:text-emerald-400">Customer</span>}
                {party?.is_customer && party?.is_supplier && <span>·</span>}
                {party?.is_supplier && <span className="text-sky-600 dark:text-sky-400">Supplier</span>}
                {(party?.is_customer || party?.is_supplier) && <span>·</span>}
                {party?.email
                  ? <a href={`mailto:${party.email}`} className="text-primary hover:underline">{party.email}</a>
                  : <span>No email on file</span>}
                {party?.contact_group && <><span>·</span><span>{SEGMENT_LABELS[party.contact_group] ?? party.contact_group}</span></>}
              </DialogDescription>
            </div>

            {party && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    {busyStatement || (researchHere && research.busy) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Actions <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Account statement</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={busyStatement || !statementsEnabled}
                    onSelect={() => { void statement.emailStatement(); }}
                    title={statementsEnabled ? undefined : 'Statements disabled in Settings'}
                  >
                    <Mail className="mr-2 h-3.5 w-3.5" /> Email statement
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busyStatement || !statementsEnabled}
                    onSelect={() => { void statement.downloadStatement(); }}
                    title={statementsEnabled ? undefined : 'Statements disabled in Settings'}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={busyStatement} onSelect={() => { void statement.shareStatement(false); }}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> {statement.copied ? 'Link copied' : 'Copy share link'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busyStatement}
                    onSelect={() => { void statement.shareStatement(true); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <RotateCcw className="mr-2 h-3.5 w-3.5" /> Revoke &amp; re-issue link
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Ledger</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={printLedger}>
                    <Printer className="mr-2 h-3.5 w-3.5" /> Print ledger
                  </DropdownMenuItem>
                  {credit > 0 && (
                    <DropdownMenuItem onSelect={() => setReleaseOpen(true)}>
                      <Coins className="mr-2 h-3.5 w-3.5" /> Release credit ({formatMoney(credit)})
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Record</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to={crmHref}><ExternalLink className="mr-2 h-3.5 w-3.5" /> View in CRM</Link>
                  </DropdownMenuItem>
                  {party.party_type === 'company' && (
                    <DropdownMenuItem
                      disabled={researchHere && research.busy}
                      onSelect={() => { setResearchParty(party.party_id); void research.run(); }}
                      title="Refresh from ΑΑΔΕ + ΓΕΜΗ registries and re-run business research (website, phone, socials)"
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" /> {researchHere && research.busy ? 'Researching…' : 'Refresh research'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* The research chain reports its legs, including the SKIPPED ones — keep that text on
              the surface that started it, not only in a toast that has already gone. */}
          {researchHere && (research.busy || research.summary) && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {research.busy ? (research.status ?? 'Researching…') : research.summary}
            </p>
          )}
        </DialogHeader>

        {!party ? null : (
          <div className="space-y-4">
            {/* The money position stays ABOVE the tabs. It is three tiles, not a tab's worth of
                content, and behind one it meant every list opened without the balance it is
                supposed to be read against. */}
            <PartyAccountSummary
              customer={showCustomer
                ? { invoiced: Number(party.invoiced_total || 0), paid: Number(party.receivable_paid_total || 0), outstanding: Number(party.receivable_outstanding || 0) }
                : null}
              supplier={showSupplier
                ? { billed: Number(party.billed_total || 0), paid: Number(party.payable_paid_total || 0), outstanding: Number(party.payable_outstanding || 0) }
                : null}
              aging={aging ? { not_due: Number(aging.not_due), due_0_30: Number(aging.due_0_30), due_31_90: Number(aging.due_31_90), due_90_plus: Number(aging.due_90_plus) } : null}
              // The fourth term of the account balance — un-invoiced order cash — and the two
              // tiles that name it. Passing null here (which this surface did) does not merely
              // hide the tiles: it drops the term from the balance, so a party whose only money is
              // on orders reported a €0 position across the board.
              orders={orderPos?.stats ?? null}
              credit={credit}
              creditReleasable={party.credit_releasable}
              onReleaseCredit={() => setReleaseOpen(true)}
              profitability={profitability}
              profitPosition={profitPosition}
              onAllocateProfit={() => setAllocateOpen(true)}
            />

            {/* Renders itself away when nothing has been released, so it costs a party who has
                never had any exactly one query and no screen space. */}
            <CreditReleasesCard
              workspaceId={party.workspace_id}
              party={{
                companyId: party.party_type === 'company' ? party.party_id : null,
                contactId: party.party_type === 'contact' ? party.party_id : null,
              }}
              refreshKey={reloadKey}
              onChanged={reload}
            />

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                {showCustomer && (
                  <TabsTrigger value="invoices" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <FileText className="h-4 w-4" /> Invoices{loading ? '' : ` (${invoices.length})`}
                  </TabsTrigger>
                )}
                {showSupplier && (
                  <TabsTrigger value="bills" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <Receipt className="h-4 w-4" /> Bills{loading ? '' : ` (${bills.length})`}
                  </TabsTrigger>
                )}
                {/* Not gated on role: orders run in BOTH directions, and this is the only tab that
                    can account for money taken before anyone issued a document. */}
                <TabsTrigger value="orders" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <ShoppingCart className="h-4 w-4" /> Orders{loading ? '' : ` (${orderPos?.rows.length ?? 0})`}
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Banknote className="h-4 w-4" /> Payments{loading ? '' : ` (${payments.length})`}
                </TabsTrigger>
                <TabsTrigger value="ledger" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <BookOpen className="h-4 w-4" /> Ledger
                </TabsTrigger>
              </TabsList>

              <TabsContent value="invoices" className="mt-0">
                <DocTable
                  title={<><FileText className="h-4 w-4" /> Invoices</>}
                  subtitle="Issued to this customer — the number opens the invoice."
                  loading={loading}
                  empty="No invoices."
                  colCount={7}
                  head={<>
                    <th className="px-4 py-2 text-left">Number</th>
                    <th className="px-4 py-2 text-left">Issued</th>
                    <th className="px-4 py-2 text-left">Due</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Settled</th>
                    <th className="px-4 py-2 text-right">Outstanding</th>
                  </>}
                  rows={invoices.length}
                  page={invPage}
                  onPageChange={setInvPage}
                  label="invoices"
                >
                  {paginate(invoices, invPage).map((i) => (
                    <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link to={`${financeBase}/invoices/${i.id}`} className="font-mono text-xs text-primary hover:underline">
                          {i.internal_number || i.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs">{i.issued_at ? formatDate(i.issued_at) : '—'}</td>
                      <td className="px-4 py-2 text-xs">{i.due_at ? formatDate(i.due_at) : '—'}</td>
                      <td className={`px-4 py-2 text-xs ${statusTone(i.status)}`}>{humanizeLabel(i.status)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(i.total), i.currency)}</td>
                      {/* Cash AND credit notes settle an invoice — showing `amount_paid` alone makes
                          a fully credit-noted invoice read as unpaid next to a zero balance. */}
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {formatMoney(Number(i.amount_paid || 0) + Number(i.amount_credited || 0), i.currency)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${Number(i.amount_due) > 0 ? 'font-medium text-destructive' : ''}`}>
                        {formatMoney(Number(i.amount_due), i.currency)}
                      </td>
                    </tr>
                  ))}
                </DocTable>
              </TabsContent>

              <TabsContent value="bills" className="mt-0">
                <DocTable
                  title={<><Receipt className="h-4 w-4" /> Supplier bills</>}
                  subtitle="Received from this supplier — the number opens what has settled it."
                  loading={loading}
                  empty="No supplier bills."
                  colCount={7}
                  head={<>
                    <th className="px-4 py-2 text-left">Bill #</th>
                    <th className="px-4 py-2 text-left">Issued</th>
                    <th className="px-4 py-2 text-left">Due</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Paid</th>
                    <th className="px-4 py-2 text-right">Outstanding</th>
                  </>}
                  rows={bills.length}
                  page={billPage}
                  onPageChange={setBillPage}
                  label="bills"
                >
                  {paginate(bills, billPage).map((b) => (
                    <tr key={b.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => setOpenBillId(b.id)}
                          className="rounded font-mono text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {b.supplier_bill_number || b.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-xs">{b.issued_at ? formatDate(b.issued_at) : '—'}</td>
                      <td className="px-4 py-2 text-xs">{b.due_at ? formatDate(b.due_at) : '—'}</td>
                      <td className={`px-4 py-2 text-xs ${statusTone(b.status)}`}>{humanizeLabel(b.status)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(b.total), b.currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(Number(b.amount_paid || 0), b.currency)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${Number(b.amount_due) > 0 ? 'font-medium' : ''}`}>
                        {formatMoney(Number(b.amount_due), b.currency)}
                      </td>
                    </tr>
                  ))}
                </DocTable>
              </TabsContent>

              <TabsContent value="orders" className="mt-0">
                <DocTable
                  title={<><ShoppingCart className="h-4 w-4" /> Orders</>}
                  subtitle="What was ordered and what has settled against it. An order is not a legal document — until it is invoiced its money appears in no invoice figure."
                  loading={loading}
                  empty="No orders."
                  colCount={7}
                  head={<>
                    <th className="px-4 py-2 text-left">Order #</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Settled</th>
                    <th className="px-4 py-2 text-right">Outstanding</th>
                  </>}
                  rows={orderPos?.rows.length ?? 0}
                  page={orderPage}
                  onPageChange={setOrderPage}
                  label="orders"
                >
                  {paginate(orderPos?.rows ?? [], orderPage).map((o) => (
                    <tr key={o.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link to={`${financeBase}/orders/${o.id}`} className="font-mono text-xs text-primary hover:underline">
                          {o.order_number || o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs">{formatDate(o.created_at)}</td>
                      <td className="px-4 py-2 text-xs">{o.order_type === 'purchase' ? 'Purchase' : 'Sales'}</td>
                      <td className="px-4 py-2 text-xs">
                        <span className={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</span>
                        {/* The whole point of this tab. "Not invoiced" is why the money on this row
                            is missing from Invoiced / Paid / Outstanding above — say it on the row
                            rather than leaving the reader to work out which figures exclude it. */}
                        <span className="text-muted-foreground">
                          {' · '}{o.invoiced ? 'Invoiced' : 'Not invoiced'}{' · '}{ORDER_PAYMENT_LABEL[o.payment_status_derived]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(o.total), o.currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(o.settled, o.currency)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${o.outstanding > 0 ? 'font-medium' : ''}`}>
                        {formatMoney(o.outstanding, o.currency)}
                      </td>
                    </tr>
                  ))}
                </DocTable>
              </TabsContent>

              <TabsContent value="payments" className="mt-0">
                <DocTable
                  title={<><Banknote className="h-4 w-4" /> Payments</>}
                  subtitle="Money that actually moved, both directions — and what each payment was applied to."
                  loading={loading}
                  empty="No payments recorded."
                  colCount={6}
                  head={<>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Direction</th>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Applied to</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </>}
                  rows={payments.length}
                  page={payPage}
                  onPageChange={setPayPage}
                  label="payments"
                >
                  {paginate(payments, payPage).map((p) => (
                    <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{formatDate(p.paid_at)}</td>
                      <td className={`px-4 py-2 text-xs ${directionTone(p.direction)}`}>{p.direction === 'in' ? 'Received' : 'Paid out'}</td>
                      <td className="px-4 py-2 text-xs">{p.method ? humanizeLabel(p.method) : '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{p.reference || '—'}</td>
                      {/* What this cash settled. Without it a deposit taken on an order was an
                          amount with no subject: it moves no invoice figure, so the page showed
                          money in and €0 everywhere else with nothing to connect them. */}
                      <td className="px-4 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {(p.settled ?? []).map((s) => (
                            <span key={`${s.kind}:${s.id}`}>
                              {s.kind === 'invoice' ? (
                                <Link to={`${financeBase}/invoices/${s.id}`} className="text-primary hover:underline">{s.label}</Link>
                              ) : s.kind === 'order' ? (
                                <Link to={`${financeBase}/orders/${s.id}`} className="text-primary hover:underline">{s.label}</Link>
                              ) : (
                                <button type="button" onClick={() => setOpenBillId(s.id)}
                                  className="rounded text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  {s.label}
                                </button>
                              )}
                              <span className="text-muted-foreground"> {formatMoney(s.amount, p.currency)}</span>
                            </span>
                          ))}
                          {/* DERIVED by `get_payment_remainders` and carried on the row — never
                              re-summed from the allocations here. */}
                          {Number(p.unallocated ?? 0) > 0.005 && (
                            <span className="text-amber-500" title="Not settled against anything yet — it sits on account.">
                              On account {formatMoney(Number(p.unallocated), p.currency)}
                            </span>
                          )}
                          {(p.settled ?? []).length === 0 && Number(p.unallocated ?? 0) <= 0.005 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${directionTone(p.direction)}`}>{formatMoney(Number(p.amount), p.currency)}</td>
                    </tr>
                  ))}
                </DocTable>
              </TabsContent>

              <TabsContent value="ledger" className="mt-0">
                {/* Running ledger (καρτέλα) — Print lives in the Actions menu with everything else. */}
                <Card>
                  <CardHeader className="border-b border-border/60 px-4 py-2.5 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Ledger (Καρτέλα)</CardTitle>
                      {/* What this list contains is not self-evident, and the omission is the part
                          that confuses: cash on an un-invoiced order shows up here as a credit
                          with nothing on the debit side, reading as "we owe them". Say which
                          documents it holds and where the missing half lives. */}
                      <p className="text-[11px] text-muted-foreground">
                        Every movement in the period with a running balance — invoices, credit notes and payments, plus
                        orders nobody has invoiced yet when that box is ticked. Positive is due to us; negative sits in
                        their favour.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Which basis the balance is on. Untick for the documents-only Καρτέλα that
                          reconciles with the aging buckets and the emailed statement. */}
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        title="Show orders that have not been invoiced yet as ledger entries — a sales order as a debit, a purchase order as a credit. Once an order is invoiced its INVOICE is the entry, so it is never counted twice. Untick for the documents-only balance that the emailed statement and the aging buckets report.">
                        <input type="checkbox" checked={includeOrders}
                          onChange={(e) => setIncludeOrders(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border/60 accent-primary" />
                        Include un-invoiced orders
                      </label>
                      <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)}
                        className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs" />
                      <span className="text-xs text-muted-foreground">→</span>
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)}
                        className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs" />
                      {party.is_customer && party.is_supplier && (
                        <Select value={ledgerSide} onValueChange={(v: any) => setLedgerSide(v)}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="supplier">Supplier</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {ledgerLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border/60">
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-left">Document</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Credit</th>
                            <th className="px-3 py-2 text-right">Cumulative debit</th>
                            <th className="px-3 py-2 text-right">Cumulative credit</th>
                            <th className="px-3 py-2 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Carry-forward only belongs above the FIRST entry of the period. */}
                          {ledgerPage === 1 && (
                            <tr className="border-b border-border/30 bg-muted/30">
                              <td colSpan={7} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Opening balance</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{md(opening)}</td>
                            </tr>
                          )}
                          {ledgerWithBalance.length === 0 ? (
                            <tr><td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">No activity in this period.</td></tr>
                          ) : paginate(ledgerWithBalance, ledgerPage).map((r, idx) => {
                            const href = ledgerHref(r);
                            const billId = ledgerBillId(r);
                            const docLabel = r.doc_number || '—';
                            return (
                            // Key on the ABSOLUTE row index — a per-page index collides across
                            // pages and lets React reuse the previous page's rows.
                            <tr key={(ledgerPage - 1) * TABLE_PAGE_SIZE + idx} className="border-b border-border/30">
                              <td className="px-3 py-1.5">{r.entry_date ? formatDate(r.entry_date) : '—'}</td>
                              <td className="px-3 py-1.5">{LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind}</td>
                              <td className="px-3 py-1.5 font-mono">
                                {href ? (
                                  <Link to={href} className="text-primary hover:underline">{docLabel}</Link>
                                ) : billId ? (
                                  <button type="button" onClick={() => setOpenBillId(billId)}
                                    className="rounded text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    {docLabel}
                                  </button>
                                ) : docLabel}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.debit) ? mr(Number(r.debit), r.currency) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.credit) ? mr(Number(r.credit), r.currency) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{md(r.progrDebit)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{md(r.progrCredit)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{md(r.balance)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border">
                            <td colSpan={3} className="px-3 py-2 text-xs font-semibold">Totals</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{md(totalDebit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{md(totalCredit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{md(totalDebit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{md(totalCredit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{md(ledgerClosing)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                    )}
                    {/*
                      The period's closing position, NAMED — the same callout the printed Καρτέλα
                      ends with, which until now existed only on the print. The Totals row above
                      finishes with a bare signed number, so −€3,000.00 only read as "in their
                      favour" if you already knew the sign convention.

                      The direction word comes from `netPositionDirection`, shared with the account
                      tiles and the print, so all three phrase one position identically — and none
                      of them can drift back to "owes us" without the guard test failing. English
                      only here: the print stays bilingual because a Καρτέλα is read by an
                      accountant, but the app is English-default.
                    */}
                    {!ledgerLoading && (
                      <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 border-t border-border/60 px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          {mixedCurrency ? 'Account balance' : <>Account balance &middot; {netPositionDirection(ledgerClosing)}</>}
                          {' · '}{includeOrders ? 'incl. un-invoiced orders' : 'documents only'}
                        </span>
                        <span className={`text-base font-semibold tabular-nums ${closingTone}`}>
                          {md(Math.abs(ledgerClosing))}
                        </span>
                      </div>
                    )}
                    {/* Totals above are period-wide, not per page — Print still emits every row. */}
                    {!ledgerLoading && (
                      <TablePagination page={ledgerPage} total={ledgerWithBalance.length} onPageChange={setLedgerPage} label="entries" />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Stop holding their leftover money and keep it as income. Same action, same dialog, as
            the CRM Account tab — this drill-down shows the same balance. Mounted outside the tabs
            so switching tab mid-flow cannot unmount it. */}
        {party && (
          <ReleaseCreditDialog
            workspaceId={party.workspace_id}
            open={releaseOpen}
            onOpenChange={setReleaseOpen}
            party={{
              companyId: party.party_type === 'company' ? party.party_id : null,
              contactId: party.party_type === 'contact' ? party.party_id : null,
              name: party.display_name,
            }}
            available={credit}
            onDone={reload}
          />
        )}

        {party && (
          <AllocatePartyProfitDialog
            workspaceId={party.workspace_id}
            open={allocateOpen}
            onOpenChange={setAllocateOpen}
            party={{
              companyId: party.party_type === 'company' ? party.party_id : null,
              contactId: party.party_type === 'contact' ? party.party_id : null,
              name: party.display_name,
            }}
            onDone={reload}
          />
        )}

        {/* A supplier bill has no page of its own; this is the surface Payables opens, so the
            bill number leads to the same place from either list. */}
        {party && (
          <ExpensePaymentsDialog
            workspaceId={party.workspace_id}
            expenseId={openBillId}
            open={openBillId !== null}
            onOpenChange={(v) => { if (!v) setOpenBillId(null); }}
            onChanged={reload}
          />
        )}

        {statement.connectEmailGate}
      </DialogContent>
    </Dialog>
  );
};

/**
 * One document list inside the drill-down: a titled Card wrapping a table, its own pagination,
 * and the two states a list can be in that are NOT "here are the rows" — still loading, and
 * genuinely empty. Callers supply the header cells and the rows; everything else was three
 * near-identical copies before.
 */
const DocTable: React.FC<{
  title: React.ReactNode;
  subtitle: string;
  loading: boolean;
  empty: string;
  colCount: number;
  head: React.ReactNode;
  rows: number;
  page: number;
  onPageChange: (p: number) => void;
  label: string;
  children: React.ReactNode;
}> = ({ title, subtitle, loading, empty, colCount, head, rows, page, onPageChange, label, children }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-4 py-2.5">
      <CardTitle className="flex items-center gap-2">{title}</CardTitle>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
    </CardHeader>
    <CardContent className="p-0">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">{head}</tr>
            </thead>
            <tbody>
              {rows === 0
                ? <tr><td colSpan={colCount} className="px-4 py-10 text-center text-xs text-muted-foreground">{empty}</td></tr>
                : children}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows > 0 && <TablePagination page={page} total={rows} onPageChange={onPageChange} label={label} />}
    </CardContent>
  </Card>
);
