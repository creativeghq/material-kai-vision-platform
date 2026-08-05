import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  AlertCircle,
  Plus,
  Loader2,
  Receipt,
  Activity,
  PieChart,
  LineChart,
  Bell,
  CalendarClock,
  BarChart3,
  Users,
  Package,
  Settings as SettingsIcon,
  Banknote as BanknoteIcon,
  Plane,
  Award,
  Boxes,
  Landmark,
  Send as SendIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { BankFeedTab } from '@/modules/finance/tabs/BankFeedTab';
import { PayViaRevolutDialog } from '@/modules/banking-revolut/components/PayViaRevolutDialog';
import { callRevolutApi } from '@/modules/banking-revolut/services/revolutConfigService';
import { CardsExpensesCard } from '@/modules/banking-revolut/components/CardsExpensesCard';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters, optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { buildAgingFilters, AGE_BUCKET_KEY } from '@/modules/finance/components/agingFilters';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import {
  financeService,
  formatMoney,
  formatPct,
  ageBucketLabel,
  type AgingRow,
  type FollowUpRow,
  type PnlRow,
  type CashFlowRow,
  type Invoice,
  type AgeBucket,
  type SalesPerCustomerRow,
  type SalesPerProductRow,
  type TopOutstandingRow,
  type BankAccountBalance,
} from '@/modules/finance/services/financeService';
import { statusTone } from '@/modules/finance/utils/statusTone';
import {
  ordersService,
  ORDER_STATUS_LABEL,
  ORDER_PAYMENT_LABEL,
  type OrderListRow,
} from '@/modules/finance/services/ordersService';
import { OrderAgingInlineEditor } from '@/modules/finance/components/OrderAgingInlineEditor';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { NewSupplierCreditNoteDialog } from '@/modules/finance/components/NewSupplierCreditNoteDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { ExpensePaymentsDialog } from '@/modules/finance/components/ExpensePaymentsDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { PlanningTab } from '@/modules/finance/tabs/PlanningTab';
import { ReportsTab } from '@/modules/finance/tabs/ReportsTab';
import { TimeBillingTab } from '@/modules/finance/tabs/TimeBillingTab';
import { PartiesTab } from '@/modules/finance/tabs/PartiesTab';
import { SettingsTab } from '@/modules/finance/tabs/SettingsTab';
import TripExpensesPanel from '@/modules/finance/components/TripExpensesPanel';
import { SourcingBoardPanel } from '@/modules/finance/components/SourcingBoardPanel';
import { CompanyAssetsPanel } from '@/components/business/assets/CompanyAssetsPanel';
import type { FinanceSettings } from '@/modules/finance/services/financeService';
import { InvoiceActionsMenu } from '@/modules/finance/components/InvoiceActionsMenu';
import DocumentsView from '@/modules/finance/pages/DocumentsPage';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import SupplierPortalPage from '@/pages/SupplierPortalPage';
import { FileText, FileMinus, Banknote, Truck, FileSignature, PackageCheck, ShoppingCart, PackageSearch } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';

const DOC_TABS: { value: string; type: any; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'doc_orders', type: 'orders', label: 'Orders', icon: ShoppingCart },
  { value: 'doc_invoices', type: 'invoices', label: 'Invoices', icon: FileText },
  { value: 'doc_receipts', type: 'receipts', label: 'Receipts', icon: Receipt },
  { value: 'doc_credit_notes', type: 'credit_notes', label: 'Credit Notes', icon: FileMinus },
  { value: 'doc_payments', type: 'payments', label: 'Payments', icon: Banknote },
  { value: 'doc_expenses', type: 'expenses', label: 'Expenses', icon: ArrowUpCircle },
  // Dispatch board lives in the Warehouse module (it's a loading/fulfilment surface, not a
  // finance document). Reachable from the WH shortcut at the top of this sidebar.
  { value: 'doc_delivery', type: 'delivery_notes', label: 'Delivery Notes', icon: Truck },
  { value: 'doc_cheques', type: 'cheques', label: 'Cheques', icon: FileSignature },
];

// Sidebar group label rendered as a centered title flanked by hairlines: ──── Tools ────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex w-full items-center gap-2 px-3 pt-3 pb-1">
    <span className="h-px flex-1 bg-foreground/50" aria-hidden="true" />
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
    <span className="h-px flex-1 bg-foreground/50" aria-hidden="true" />
  </div>
);

const AGE_BUCKETS: AgeBucket[] = ['current', '0-30', '31-60', '61-90', '90+'];

const DASH_PERIOD_LABEL: Record<'this_month' | 'last_month' | 'last_quarter' | 'ytd', string> = {
  this_month: 'This month', last_month: 'Last month', last_quarter: 'Last 3 months', ytd: 'Year to date',
};

/** {from,to} ISO dates for a dashboard period selector. */
function dashRange(p: 'this_month' | 'last_month' | 'last_quarter' | 'ytd'): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'last_month') {
    return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  if (p === 'last_quarter') {
    const start = new Date(today); start.setMonth(start.getMonth() - 3);
    return { from: fmt(start), to: fmt(today) };
  }
  if (p === 'ytd') {
    return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
  }
  return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
}

const FinancePage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Same page is mounted at /admin/finance (operator) and /finance (business owner).
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  // Operate on the ACTIVE workspace (WorkspaceContext) — replaces the old
  // oldest-membership query so Finance follows the workspace switcher.
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { isAccountant } = usePermissions(); // read-only role hides write actions
  const workspaceId = activeWorkspaceId;
  const [payRevolutBillId, setPayRevolutBillId] = useState<string | null>(null);
  // Tab is URL-driven so other surfaces (e.g. the CRM Account tab) can deep-link
  // straight to a view — /finance?tab=parties&party=company:<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const autoOpenParty = searchParams.get('party');
  const onTabChange = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    if (v !== 'parties') p.delete('party');
    setSearchParams(p, { replace: true });
  };
  /** Open ONE order on its own page. This used to switch to the Orders tab and pop a modal over
   *  the list, which is not "the details of that order" — no URL, nothing to bookmark or send. */
  const openOrder = (orderId: string) => navigate(`${financeBase}/orders/${orderId}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Seed the standard income/expense category set once per workspace when finance is first
  // used with an empty list (so "Add expense" etc. have Rent/Utilities/… out of the box).
  const seededWorkspaces = useRef<Set<string>>(new Set());

  const [ar, setAr] = useState<AgingRow[]>([]);
  const [ap, setAp] = useState<AgingRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [cashPosition, setCashPosition] = useState(0); // money in bank = Σ payments in − out
  const [cashIn, setCashIn] = useState(0);   // Σ payments in  — money actually received
  const [cashOut, setCashOut] = useState(0); // Σ payments out — money actually paid
  const [bankBalances, setBankBalances] = useState<BankAccountBalance[]>([]);
  // Money received but not yet invoiced (deposits / on-account) — cash held, not yet revenue.
  const [deposits, setDeposits] = useState<Awaited<ReturnType<typeof financeService.getDepositsOnAccount>>>({ total: 0, currency: 'EUR', totals: [], rows: [] });
  // True when the uninvoiced-orders overlay failed to load, which makes every AR/AP figure on
  // this page an UNDER-report rather than a smaller true number. Surfaced, not swallowed.
  const [overlayFailed, setOverlayFailed] = useState(false);

  // Dashboard sales insights (period-scoped — reuse the Reports RPCs at a glance).
  type DashPeriod = 'this_month' | 'last_month' | 'last_quarter' | 'ytd';
  const [dashPeriod, setDashPeriod] = useState<DashPeriod>('this_month');
  const [topCustomers, setTopCustomers] = useState<SalesPerCustomerRow[]>([]);
  const [topProducts, setTopProducts] = useState<SalesPerProductRow[]>([]);
  const [topOutstanding, setTopOutstanding] = useState<TopOutstandingRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderListRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);

  // App Launcher deep-link: /finance?new=invoice opens the New Invoice modal.
  useEffect(() => {
    if (isAccountant) return; // read-only role cannot create
    if (searchParams.get('new') === 'invoice') {
      setNewInvoiceOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams, isAccountant]);
  const [scnOpen, setScnOpen] = useState(false);
  const [scnBillId, setScnBillId] = useState<string | undefined>(undefined);
  /** Expense being paid from Payables — settled through the shared Record Payment dialog. */
  const [payExpenseId, setPayExpenseId] = useState<string | null>(null);
  /** Expense whose payment history is open (from the Bill # link in Payables). */
  const [paymentsExpenseId, setPaymentsExpenseId] = useState<string | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);

  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    void financeService.getSettings(workspaceId).then(setSettings).catch(() => { /* ignore */ });
  }, [workspaceId]);

  useEffect(() => { if (workspaceId) void loadAll(workspaceId); }, [workspaceId]);
  // No workspace once context settled → stop the spinner so the empty-state renders.
  useEffect(() => { if (!wsLoading && !workspaceId) setLoading(false); }, [wsLoading, workspaceId]);

  // Dashboard insights — re-fetch when the workspace or period changes, independent
  // of the heavy loadAll() so flipping the period is cheap.
  useEffect(() => { if (workspaceId) void loadInsights(workspaceId, dashPeriod); }, [workspaceId, dashPeriod]);

  // Reconcile a deposit → turn the order it was taken on into a receipt/invoice draft.
  const issueFromOrder = async (orderId: string) => {
    try {
      const { data, error } = await supabase.rpc('generate_invoice_from_order', { p_order: orderId });
      if (error) throw error;
      toast({ title: 'Draft document created', description: 'Review it, then issue & transmit to myDATA.' });
      if (workspaceId) void loadAll(workspaceId);
      if (data) navigate(`${financeBase}/invoices/${data}`);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  const loadInsights = async (wsId: string, period: DashPeriod) => {
    try {
      setInsightsLoading(true);
      const { from, to } = dashRange(period);
      const [custs, prods, outstanding, orders] = await Promise.all([
        financeService.reportSalesPerCustomer(wsId, from, to).catch(() => [] as SalesPerCustomerRow[]),
        financeService.reportSalesPerProduct(wsId, from, to).catch(() => [] as SalesPerProductRow[]),
        financeService.reportTopCustomerOutstanding(wsId).catch(() => [] as TopOutstandingRow[]),
        ordersService.list({ workspaceId: wsId, orderType: 'sales' }).catch(() => [] as OrderListRow[]),
      ]);
      setTopCustomers(custs);
      setTopProducts(prods);
      setTopOutstanding(outstanding);
      setRecentOrders(orders);
    } catch { /* insights are best-effort — the core dashboard still renders */ }
    finally { setInsightsLoading(false); }
  };

  const loadAll = async (wsId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [arRows, apRows, queue, pnlRows, cashRows, invoices, cats] = await Promise.all([
        financeService.getArAging(wsId),
        financeService.getApAging(wsId),
        financeService.getFollowUpQueue(wsId),
        financeService.getMonthlyPnl(wsId, 12),
        financeService.getCashFlowForecast(wsId, 90),
        financeService.listInvoices({ workspaceId: wsId, limit: 25 }),
        financeCategoriesService.list(wsId).catch(() => [] as FinanceCategory[]),
      ]);
      // Cash + documents only: receivables/payables are issued invoices / supplier bills, plus
      // confirmed-but-not-yet-invoiced orders (real order-derived money). Manual "virtual" AR/AP
      // entries are intentionally excluded everywhere now.
      let arWithOrders = arRows.filter((r) => r.entry_kind !== 'manual');
      let apWithOrders = apRows.filter((r) => r.entry_kind !== 'manual');
      setOverlayFailed(false);
      try {
        const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId: wsId });
        // An un-invoiced order has no invoice due date, so it ages against `due_date` — the
        // operator's expected payment date when set, else order date + the workspace's default
        // payment terms (see ordersService.listUninvoicedOutstanding). Only an order whose date
        // can't be derived at all stays 'no_due_date'. Buckets mirror vw_ar_aging exactly.
        // The invoice aging view computes `CURRENT_DATE - due_at` in the DB session timezone
        // (UTC on Supabase). We MUST match that reference or an order and an invoice with the same
        // date can disagree by a day near midnight — so both "today" and the due date are compared
        // as UTC calendar days (date-only), not local time.
        const nowUtc = new Date();
        const todayUtcMs = Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate());
        const agingFromExpected = (expected: string | null): { age_bucket: AgeBucket; days_overdue: number } => {
          if (!expected) return { age_bucket: 'no_due_date', days_overdue: 0 };
          const [y, m, d] = expected.split('-').map(Number);
          if (!y || !m || !d) return { age_bucket: 'no_due_date', days_overdue: 0 };
          const days = Math.floor((todayUtcMs - Date.UTC(y, m - 1, d)) / 86_400_000);
          const bucket: AgeBucket = days <= 0 ? 'current' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
          return { age_bucket: bucket, days_overdue: Math.max(days, 0) };
        };
        const toAgingRow = (o: typeof uninvoiced[number]): AgingRow => ({
          id: o.id,
          workspace_id: wsId,
          total: o.total,
          amount_paid: o.settled,
          amount_due: o.outstanding,
          // The ORDER's currency, not the workspace base. A synthesised row that guesses EUR is
          // exactly how a USD order's outstanding got summed into the euro bucket totals.
          currency: o.currency,
          // `due_at` stays the operator-set date (often null) so the inline editor below opens
          // empty and never persists a date nobody typed; the derived one drives aging + display.
          due_at: o.expected_payment_date,
          effective_due_at: o.due_date,
          due_from_terms: o.due_from_terms,
          issued_at: o.created_at,
          status: o.status,
          ...agingFromExpected(o.due_date),
          entry_kind: 'order',
          // Bare number only — the row already says "Order, not invoiced" next to it, so the
          // word "Order" in front of the number just read as "Order ORD-2026-0001".
          description: o.order_number ?? o.id.slice(0, 8),
          party_name: o.party_name,
          category_id: o.category_id,
          category_name: o.category_name,
        });
        arWithOrders = [...arWithOrders, ...uninvoiced.filter((o) => o.order_type === 'sales').map(toAgingRow)];
        apWithOrders = [...apWithOrders, ...uninvoiced.filter((o) => o.order_type === 'purchase').map(toAgingRow)];
      } catch (overlayErr) {
        // Best-effort, but NOT invisible. When this fails, confirmed-but-uninvoiced orders vanish
        // from BOTH the AR and AP lists and every total above them quietly reports a smaller
        // number — an under-report that looks exactly like "there is less outstanding", which is
        // the one reading an operator must never be handed by accident.
        setOverlayFailed(true);
        console.error('[FinancePage] uninvoiced-orders overlay failed — AR/AP under-report:', overlayErr);
      }
      // Customer money held on account (unallocated inbound payments) lives in the receivables
      // list so the operator sees it next to what that customer owes — but it carries POSITIVE
      // amounts and is aggregated separately (creditHeld), never summed into "owed" totals as a
      // negative row. Per operator (2026-08-04): negative numbers on this page are banned; a
      // credit is presented as "money we hold for the customer", and the netting happens in
      // labelled aggregate lines, not in row signs.
      const depositsData = await financeService.getDepositsOnAccount(wsId).catch(() => ({ total: 0, currency: 'EUR', totals: [], rows: [] }));
      setDeposits(depositsData);
      const creditRows: AgingRow[] = depositsData.rows.map((d) => ({
        id: d.payment_id,
        workspace_id: wsId,
        total: d.unallocated,
        amount_paid: 0,
        amount_due: d.unallocated, // positive — aggregates key off entry_kind, not the sign
        // The DEPOSIT's currency. A credit may only net against same-currency receivables —
        // netting a USD deposit against a EUR invoice is not a discount, it is a wrong number.
        currency: d.currency,
        due_at: null,
        issued_at: d.paid_at,
        status: 'credit',
        age_bucket: 'no_due_date' as AgeBucket,
        days_overdue: 0,
        entry_kind: 'credit' as const,
        description: d.credit_number ? `Credit ${d.credit_number}` : 'Credit on account',
        party_name: d.party_name,
        category_id: null,
        category_name: null,
        order_id: d.order_id,
        order_number: d.order_number,
        credit_number: d.credit_number,
      }));
      arWithOrders = [...arWithOrders, ...creditRows];
      // Sort each side by how overdue it is (most overdue first) so aging orders interleave with
      // invoices instead of always sitting below them. 'no_due_date' (unaged) sinks to the bottom.
      const byOverdue = (a: AgingRow, b: AgingRow) => (b.days_overdue || 0) - (a.days_overdue || 0);
      arWithOrders.sort(byOverdue);
      apWithOrders.sort(byOverdue);
      setAr(arWithOrders);
      setAp(apWithOrders);
      // First finance use with no categories → seed the standard set (idempotent, once per ws).
      let categoryList = cats;
      if (categoryList.length === 0 && !isAccountant && !seededWorkspaces.current.has(wsId)) {
        seededWorkspaces.current.add(wsId);
        try {
          const added = await financeCategoriesService.importDefaults(wsId);
          if (added > 0) categoryList = await financeCategoriesService.list(wsId).catch(() => categoryList);
        } catch { /* best-effort — non-blocking */ }
      }
      setCategories(categoryList);
      setFollowUps(queue);
      setPnl(pnlRows);
      setCashFlow(cashRows);
      setRecentInvoices(invoices);
      // Cash in bank — actual money in/out across all payments (not planned).
      const { data: pays } = await supabase.from('payments').select('direction, amount').eq('workspace_id', wsId);
      const moneyIn = (pays ?? []).reduce((a: number, p: any) => a + (p.direction === 'in' ? Number(p.amount) : 0), 0);
      const moneyOut = (pays ?? []).reduce((a: number, p: any) => a + (p.direction === 'out' ? Number(p.amount) : 0), 0);
      setCashIn(Math.round(moneyIn * 100) / 100);
      setCashOut(Math.round(moneyOut * 100) / 100);
      setCashPosition(Math.round((moneyIn - moneyOut) * 100) / 100);
      // Per-account balances (where the money actually sits).
      setBankBalances(await financeService.getBankAccountBalances(wsId).catch(() => [] as BankAccountBalance[]));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load finance data');
      toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ---- Derived metrics
  const kpis = useMemo(() => {
    // Owed and held are reported as two separate POSITIVE numbers, never netted into one figure
    // that can go negative on screen. Credit rows are excluded from every "owed" sum.
    const arOutstanding = ar.reduce((acc, r) => acc + (r.entry_kind === 'credit' ? 0 : (r.amount_due || 0)), 0);
    const creditHeld = ar.reduce((acc, r) => acc + (r.entry_kind === 'credit' ? (r.amount_due || 0) : 0), 0);
    const apOutstanding = ap.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const overdue = ar.filter((r) => r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date');
    const overdueTotal = overdue.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const lastMonth = pnl.length > 0 ? pnl[pnl.length - 1] : null;
    const monthRevenue = Number(lastMonth?.revenue_net ?? 0);
    const monthMargin = Number(lastMonth?.gross_margin ?? 0);
    const monthMarginPct = lastMonth?.gross_margin_pct ?? null;
    // Invoiced AR only ages (uninvoiced orders have no due date) → DSO is over invoiced receivables.
    // Credit rows (money on account) are not invoices, so they stay out of the DSO base.
    const invoicedAr = ar.filter((r) => r.entry_kind !== 'order' && r.entry_kind !== 'credit').reduce((acc, r) => acc + (r.amount_due || 0), 0);
    // True DSO = AR ÷ trailing-12-mo revenue × 365. Null when there's no revenue to divide by.
    const annualRevenue = pnl.reduce((acc, p) => acc + Number(p.revenue_net ?? 0), 0);
    const dso = annualRevenue > 0 ? Math.round((invoicedAr / annualRevenue) * 365) : null;
    return { arOutstanding, creditHeld, apOutstanding, overdueTotal, monthRevenue, monthMargin, monthMarginPct, dso };
  }, [ar, ap, pnl]);

  // Uninvoiced-order money that still can't age, shown as a separate "expected" line under the
  // buckets. Orders WITH a due date (operator-set or terms-derived) age into the buckets above —
  // counting them here too would double them in the summary's net line.
  const unagedOrders = (rows: AgingRow[]) =>
    rows.filter((r) => r.entry_kind === 'order' && r.age_bucket === 'no_due_date').reduce((a, r) => a + (r.amount_due || 0), 0);
  const arExpected = useMemo(() => unagedOrders(ar), [ar]);
  const apExpected = useMemo(() => unagedOrders(ap), [ap]);

  const arBuckets = useMemo(() => bucketize(ar), [ar]);
  const apBuckets = useMemo(() => bucketize(ap), [ap]);
  // What the bucket/KPI aggregates above are actually denominated in. Every total here sums
  // amount_due across rows, which only means something when the rows share a currency.
  const arMoney = useMemo(() => aggregateCurrency(ar), [ar]);
  const apMoney = useMemo(() => aggregateCurrency(ap), [ap]);

  // What we actually made on what we sold, over the loaded P&L window. Revenue is what was sold
  // (issued invoices + confirmed sales orders not yet invoiced), NOT cash received — a paid order
  // and a still-owed one both count once, when sold. Cash movement is the "Money received" card.
  const profit = useMemo(() => {
    const revenue = pnl.reduce((a, p) => a + Number(p.revenue_net ?? 0), 0);
    const cogs = pnl.reduce((a, p) => a + Number(p.cogs ?? 0), 0);
    const margin = pnl.reduce((a, p) => a + Number(p.gross_margin ?? 0), 0);
    return { revenue, cogs, margin, pct: revenue > 0 ? Math.round((1000 * margin) / revenue) / 10 : null };
  }, [pnl]);

  const incomeCats = useMemo(() => categories.filter((c) => c.kind === 'income' || c.kind === 'both'), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense' || c.kind === 'both'), [categories]);

  // AR/AP list filters — one declaration per side, both on the shared filter model. The age
  // bucket lives in the same values bag the BucketCards row writes, so card and modal agree.
  const arGroups = useMemo(() => buildAgingFilters('ar', { rows: ar, categories: incomeCats }), [ar, incomeCats]);
  const apGroups = useMemo(() => buildAgingFilters('ap', { rows: ap, categories: expenseCats }), [ap, expenseCats]);
  const {
    values: arValues, setValues: setArValues, filtered: arFiltered, previewCount: arPreview,
  } = useFilters<AgingRow>(ar, arGroups);
  const {
    values: apValues, setValues: setApValues, filtered: apFiltered, previewCount: apPreview,
  } = useFilters<AgingRow>(ap, apGroups);

  // Follow-ups (quotes needing a nudge) — unbounded list, so give it search / status / value / idle.
  const followUpGroups = useMemo<FilterGroupDef[]>(() => {
    const maxVal = followUps.reduce((m, r) => Math.max(m, Number(r.grand_total) || 0), 0);
    const maxIdle = followUps.reduce((m, r) => Math.max(m, Number(r.days_since_activity) || 0), 0);
    return [{
      key: 'general', label: 'General', icon: Bell,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Quote number / name…', accessor: (r: FollowUpRow) => [r.quote_number, r.name] },
        { key: 'status', type: 'multi', label: 'Status', options: optionsFromRows(followUps, (r) => r.status), accessor: (r: FollowUpRow) => r.status },
        { key: 'value', type: 'range', label: 'Value', min: 0, max: Math.max(Math.ceil(maxVal / 10) * 10, 10), accessor: (r: FollowUpRow) => r.grand_total },
        { key: 'idle', type: 'range', label: 'Days idle', min: 0, max: Math.max(maxIdle, 10), accessor: (r: FollowUpRow) => r.days_since_activity },
      ],
    }];
  }, [followUps]);
  const { values: fuValues, setValues: setFuValues, filtered: followUpsView, previewCount: fuPreview } =
    useFilters<FollowUpRow>(followUps, followUpGroups);

  // Clicking a bucket card toggles the SAME field the modal edits — never a parallel piece of state.
  const arBucket = (arValues[AGE_BUCKET_KEY] as string) ?? 'all';
  const apBucket = (apValues[AGE_BUCKET_KEY] as string) ?? 'all';
  const pickArBucket = (b: string) => setArValues({ ...arValues, [AGE_BUCKET_KEY]: b === 'all' ? undefined : b });
  const pickApBucket = (b: string) => setApValues({ ...apValues, [AGE_BUCKET_KEY]: b === 'all' ? undefined : b });

  // Client-side pagination — one page state per list (AR / AP / follow-ups / deposits).
  const [arPage, setArPage] = useState(1);
  const [apPage, setApPage] = useState(1);
  const [followUpsPage, setFollowUpsPage] = useState(1);
  const [depositsPage, setDepositsPage] = useState(1);
  useEffect(() => { setArPage(1); }, [arValues]);
  useEffect(() => { setApPage(1); }, [apValues]);
  // Recording a payment / issuing a document drops rows out from under the current page.
  useEffect(() => { setArPage((p) => clampPage(p, arFiltered.length)); }, [arFiltered.length]);
  useEffect(() => { setApPage((p) => clampPage(p, apFiltered.length)); }, [apFiltered.length]);
  useEffect(() => { setFollowUpsPage((p) => clampPage(p, followUpsView.length)); }, [followUpsView.length]);
  useEffect(() => { setFollowUpsPage(1); }, [fuValues]);
  useEffect(() => { setDepositsPage((p) => clampPage(p, deposits.rows.length)); }, [deposits.rows.length]);

  if (loading && !workspaceId) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader title="Finance" description="Revenue, receivables, payables, and follow-up queue." badge="Finance" />
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader title="Finance" description="Revenue, receivables, payables, and follow-up queue." badge="Finance" />
        <div className="p-6">
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No active workspace found for your account.</CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Finance" description="Revenue, profit, receivables, payables, and follow-up queue." badge="Finance" />

      <div className="p-3 sm:p-6 space-y-6">
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={onTabChange} orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TabsList className="finance-tabs-list flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
            {/* Shortcuts out of Finance into the two operational surfaces — icon-only so they
                read as jump-offs, not as tabs of this page. */}
            {!isAccountant && (
              <div className="flex w-full items-center gap-1">
                <Link
                  to="/pos"
                  title="Point of Sale"
                  aria-label="Point of Sale"
                  className="flex h-9 flex-1 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                >
                  <Receipt className="h-4 w-4" />
                </Link>
                <Link
                  to="/warehouse"
                  title="Warehouse — stock, dispatch board & loading"
                  aria-label="Warehouse"
                  className="flex h-9 flex-1 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                >
                  <PackageCheck className="h-4 w-4" />
                </Link>
              </div>
            )}
            <TabsTrigger value="dashboard" className="w-full justify-start">
              <PieChart className="h-4 w-4 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="ar" className="w-full justify-start">
              <ArrowDownCircle className="h-4 w-4 mr-2" /> Receivables ({ar.length})
            </TabsTrigger>
            <TabsTrigger value="ap" className="w-full justify-start">
              <ArrowUpCircle className="h-4 w-4 mr-2" /> Payables ({ap.length})
            </TabsTrigger>
            <TabsTrigger value="bank_feed" className="w-full justify-start">
              <Landmark className="h-4 w-4 mr-2" /> Bank feed
            </TabsTrigger>
            {!isAccountant && (
              <TabsTrigger value="supplier_portal" className="w-full justify-start">
                <Truck className="h-4 w-4 mr-2" /> Supplier Portal
              </TabsTrigger>
            )}

            <SectionLabel>Documents</SectionLabel>
            {DOC_TABS.map((d) => (
              <TabsTrigger key={d.value} value={d.value} className="w-full justify-start">
                <d.icon className="h-4 w-4 mr-2" /> {d.label}
              </TabsTrigger>
            ))}
            <SectionLabel>Tools</SectionLabel>

            <TabsTrigger value="planning" className="w-full justify-start">
              <CalendarClock className="h-4 w-4 mr-2" /> Planning
            </TabsTrigger>
            <TabsTrigger value="trip_cards" className="w-full justify-start">
              <Plane className="h-4 w-4 mr-2" /> Expense Cards
            </TabsTrigger>
            <TabsTrigger value="assets" className="w-full justify-start">
              <Boxes className="h-4 w-4 mr-2" /> Assets
            </TabsTrigger>
            {!isAccountant && (
              <TabsTrigger value="time" className="w-full justify-start">
                <Clock className="h-4 w-4 mr-2" /> Time &amp; Billing
              </TabsTrigger>
            )}
            <TabsTrigger value="reports" className="w-full justify-start">
              <BarChart3 className="h-4 w-4 mr-2" /> Reports
            </TabsTrigger>
            <TabsTrigger value="parties" className="w-full justify-start">
              <Users className="h-4 w-4 mr-2" /> Customers &amp; Suppliers
            </TabsTrigger>
            <TabsTrigger value="followups" className="w-full justify-start">
              <Bell className="h-4 w-4 mr-2" /> Follow-Ups ({followUps.length})
            </TabsTrigger>
            {!isAccountant && (
              <TabsTrigger value="sourcing" className="w-full justify-start">
                <PackageSearch className="h-4 w-4 mr-2" /> Sourcing
              </TabsTrigger>
            )}
            {!isAccountant && (
              <TabsTrigger value="settings" className="w-full justify-start">
                <SettingsIcon className="h-4 w-4 mr-2" /> Settings
              </TabsTrigger>
            )}
          </TabsList>

          <div className="min-w-0 flex-1 space-y-4">
          {/* ─────────── DASHBOARD ─────────── */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard
                icon={BanknoteIcon}
                label="Cash in bank"
                value={formatMoney(cashPosition)}
                accent={cashPosition < 0 ? 'destructive' : 'default'}
                subtext={deposits.total > 0 ? `incl. ${formatMoney(deposits.total)} not yet invoiced` : 'Payments in − out'}
              />
              <KpiCard
                icon={ArrowDownCircle}
                label="AR outstanding"
                value={formatMoney(kpis.arOutstanding, arMoney.currency)}
                accent={kpis.overdueTotal > 0 ? 'destructive' : 'default'}
                // GROSS owed. Credit we hold is a separate positive fact, never netted into this
                // figure — a negative headline here reads as "we owe" and was banned by the operator.
                subtext={kpis.overdueTotal > 0
                  ? `${formatMoney(kpis.overdueTotal, arMoney.currency)} overdue`
                  : (kpis.creditHeld > 0 ? `holding ${formatMoney(kpis.creditHeld, arMoney.currency)} customer credit` : 'All on schedule')}
              />
              <KpiCard
                icon={ArrowUpCircle}
                label="AP outstanding"
                value={formatMoney(kpis.apOutstanding, apMoney.currency)}
                subtext={`${ap.length} open bills`}
              />
              <KpiCard
                icon={TrendingUp}
                label="This month revenue (net)"
                value={formatMoney(kpis.monthRevenue)}
                subtext={kpis.monthMarginPct != null ? `${formatMoney(kpis.monthMargin)} margin · ${formatPct(kpis.monthMarginPct)}` : '—'}
              />
              <KpiCard
                icon={Clock}
                label="DSO"
                value={kpis.dso != null ? `${kpis.dso}d` : '—'}
                subtext={kpis.dso != null ? `${followUps.length} quote(s) need follow-up` : 'No revenue yet'}
              />
            </div>

            {/* Where the money sits — live balance per bank/cash account. */}
            <BankBalancesCard rows={bankBalances} onManage={() => onTabChange('settings')} />

            {/* Revenue trend + period-over-period growth signal (reuses the 12-mo P&L). */}
            <RevenueTrendCard rows={pnl} />

            {/* AR / AP buckets side-by-side */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BucketSummary title="Receivables by age" buckets={arBuckets} viewLink="ar" expected={arExpected} credit={deposits.total} money={arMoney} />
              <BucketSummary title="Payables by age" buckets={apBuckets} viewLink="ap" expected={apExpected} money={apMoney} />
            </div>

            {/* Money received but not yet a document — deposits / on-account. Cash we hold that
                isn't revenue yet (not in P&L / AR). Reconcile each → issue its receipt/invoice. */}
            {deposits.total > 0 && (
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><BanknoteIcon className="h-4 w-4" /> Received, not yet invoiced — deposits / on-account</CardTitle>
                  <span className="text-sm font-semibold text-amber-600">{formatMoney(deposits.total, deposits.currency)}</span>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="px-5 pt-3 text-xs text-muted-foreground">Cash you've received that isn't a receipt/invoice yet — it's held as a customer deposit (not revenue, not in AR). Issue a document to recognise it.</p>
                  <ul className="divide-y divide-border/40 mt-2">
                    {paginate(deposits.rows, depositsPage).map((d) => (
                      <li key={d.payment_id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm">
                            {d.party_name ?? 'Unattributed'}
                            {d.order_number && <span className="text-xs text-muted-foreground"> · Order {d.order_number}</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{new Date(d.paid_at).toLocaleDateString()}{d.reference ? ` · ${d.reference}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium tabular-nums">{formatMoney(d.unallocated, d.currency)}</span>
                          {!isAccountant && d.order_id && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => issueFromOrder(d.order_id!)}>
                              <Receipt className="h-3.5 w-3.5 mr-1" /> Issue document
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <TablePagination page={depositsPage} total={deposits.rows.length} onPageChange={setDepositsPage} label="deposits" />
                </CardContent>
              </Card>
            )}

            {/* Cash flow + P&L stacked */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CashFlowCard rows={cashFlow} />
              <PnlCard rows={pnl} />
            </div>

            {/* Next follow-ups + Recent invoices */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Next follow-ups</CardTitle>
                  {followUps.length > 5 && <Button size="sm" variant="ghost" onClick={() => document.querySelector<HTMLButtonElement>('[data-value=followups]')?.click()}>View all</Button>}
                </CardHeader>
                <CardContent className="p-0">
                  {followUps.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No follow-ups outstanding — nothing to chase right now.</div>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {followUps.slice(0, 5).map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <Link to={`/quotes/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                              {r.quote_number ?? r.name ?? r.id.slice(0, 8)}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {r.days_since_activity ?? '—'}d idle · <span className={`ml-1 text-[10px] capitalize ${statusTone(r.status)}`}>{r.status}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{formatMoney(r.grand_total ?? 0, r.currency ?? 'EUR')}</div>
                            {r.next_scheduled_follow_up && (
                              <div className="text-[10px] text-muted-foreground">Scheduled {new Date(r.next_scheduled_follow_up).toLocaleDateString()}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Recent invoices</CardTitle>
                  {!isAccountant && <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-3 w-3 mr-1" /> New</Button>}
                </CardHeader>
                <CardContent className="p-0">
                  {recentInvoices.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet. Click <strong>New</strong> to create one, or accept a quote and use <em>Issue invoice</em>.</div>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {recentInvoices.slice(0, 6).map((i) => {
                        const mD = (i as any).fiscal_status === 'accepted' || (i as any).fiscal_status === 'offline';
                        return (
                        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <Link to={`${financeBase}/invoices/${i.id}`} className="text-sm font-mono text-primary hover:underline">
                              {i.internal_number}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {i.issued_at ? `Issued ${new Date(i.issued_at).toLocaleDateString()}` : 'Draft'}
                              {i.due_at && ` · Due ${i.due_at}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {mD && <span title="Transmitted to myDATA" className="text-emerald-500 text-xs">mD ✓</span>}
                                <span className={`text-[10px] capitalize ${statusTone(i.status)}`}>{i.status}</span>
                              </div>
                              <div className="mt-1 text-sm font-medium">{formatMoney(i.amount_due, i.currency)}</div>
                            </div>
                            <InvoiceActionsMenu
                              invoiceId={i.id}
                              financeBase={financeBase}
                              status={i.status}
                              fiscalStatus={(i as any).fiscal_status ?? null}
                              fiscalMark={(i as any).fiscal_mark ?? null}
                              onChanged={() => loadAll(workspaceId)}
                            />
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ─── Sales insights (period-scoped) — top customers, best sellers, orders ─── */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Sales insights</h3>
              <div className="flex items-center gap-2">
                {insightsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Select value={dashPeriod} onValueChange={(v) => setDashPeriod(v as typeof dashPeriod)}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['this_month', 'last_month', 'last_quarter', 'ytd'] as const).map((p) => (
                      <SelectItem key={p} value={p}>{DASH_PERIOD_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TopCustomersCard rows={topCustomers} onViewAll={() => onTabChange('reports')} />
              <TopProductsCard rows={topProducts} onViewAll={() => onTabChange('reports')} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RecentOrdersCard rows={recentOrders} onViewAll={() => onTabChange('doc_orders')} />
              <TopOutstandingCard rows={topOutstanding} onViewAll={() => onTabChange('ar')} />
            </div>
          </TabsContent>

          {/* ─────────── RECEIVABLES ─────────── */}
          <TabsContent value="ar" className="space-y-4">
            {/* The buckets below answer "who owes us and how late". These three answer the money
                question operators actually open this tab with: what came in, what is still out,
                and what we made on it. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MoneySummaryCard
                label="Money received"
                value={formatMoney(cashIn)}
                sub={`${formatMoney(cashOut)} paid out · ${formatMoney(cashPosition)} net in bank`}
              />
              <MoneySummaryCard
                label="Still owed to us"
                value={formatMoney(kpis.arOutstanding, arMoney.currency)}
                sub={kpis.creditHeld > 0
                  ? `we hold ${formatMoney(kpis.creditHeld, arMoney.currency)} of customer credit for their next orders`
                  : 'across all open receivables'}
              />
              <MoneySummaryCard
                label="Gross profit"
                value={formatMoney(profit.margin)}
                sub={profit.pct !== null
                  ? `${formatMoney(profit.revenue)} sold − ${formatMoney(profit.cogs)} cost · ${profit.pct}%`
                  : 'nothing sold yet'}
                accent={profit.margin < 0 ? 'destructive' : 'default'}
              />
            </div>

            {(overlayFailed || arMoney.mixed) && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
                {overlayFailed && (
                  <div>
                    Confirmed orders that are not yet invoiced could not be loaded, so the totals
                    below are <strong>lower than the real position</strong>. Reload to try again.
                  </div>
                )}
                {arMoney.mixed && (
                  <div>
                    These rows span more than one currency. Totals are shown in {arMoney.currency} and
                    are <strong>not converted</strong> — read the per-row amounts, not the sums.
                  </div>
                )}
              </div>
            )}
            <BucketCards buckets={arBuckets} active={arBucket} onPick={pickArBucket} noun="receivable(s)" money={arMoney} />

            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Receivables
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <FilterBar
                    groups={arGroups} values={arValues} onChange={setArValues}
                    previewCount={arPreview}
                    searchPlaceholder="Search customer / number…"
                    title="Filter receivables"
                  />
                  {!isAccountant && (
                    <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Number</th>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-left">Category</th>
                      <th className="px-4 py-2 text-left">Bucket</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Due</th>
                      <th className="px-4 py-2 text-right">Due date</th>
                      <th className="px-4 py-2 text-right">Days overdue</th>
                      <th className="px-4 py-2 w-10"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {arFiltered.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">{ar.length === 0 ? 'No open receivables.' : 'No receivables match the filters.'}</td></tr>
                    )}
                    {paginate(arFiltered, arPage).map((r) => {
                      const isOrder = r.entry_kind === 'order';
                      const isCredit = r.entry_kind === 'credit';
                      // Every receivable belongs to a user — clicking it opens that document:
                      // an order → the specific order; a credit → the order it came from (if any);
                      // an invoice → the invoice page.
                      const onRowClick = isOrder
                        ? () => openOrder(r.id)
                        : isCredit
                          ? (r.order_id ? () => openOrder(r.order_id!) : undefined)
                          : () => navigate(`${financeBase}/invoices/${r.id}`);
                      return (
                      <tr
                        key={r.id}
                        className={`border-b border-border/30 hover:bg-muted/30 ${onRowClick ? 'cursor-pointer' : ''}`}
                        // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                        // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                        // row is invalid ARIA and yields a focus stop with no name.
                        onClick={onRowClick}
                      >
                        <td className="px-4 py-2">
                          {isOrder ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs">{r.description}</span>
                              <span className="text-[10px] text-muted-foreground">· Order, not invoiced</span>
                            </span>
                          ) : isCredit ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs">{r.credit_number ?? r.description}</span>
                              <span className="text-[10px] text-muted-foreground" title="The customer paid more than their orders — we hold the extra for their next order or a refund">· Customer credit (overpayment)</span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs">{r.internal_number}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">{r.party_name ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground" onClick={(e) => isOrder && e.stopPropagation()}>
                          {isOrder ? (
                            <OrderAgingInlineEditor orderId={r.id} categoryId={r.category_id ?? null} categoryName={r.category_name ?? null} expectedDate={r.due_at} categories={incomeCats} onSaved={() => loadAll(workspaceId)}>
                              {r.category_name ?? <span className="text-primary">Set category</span>}
                            </OrderAgingInlineEditor>
                          ) : (r.category_name ?? '—')}
                        </td>
                        <td className="px-4 py-2">
                          {isCredit
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : <span className={`text-xs ${r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>{ageBucketLabel(r.age_bucket)}</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{isCredit ? '—' : formatMoney(r.total, r.currency)}</td>
                        <td className="px-4 py-2 text-right">{isCredit ? '—' : formatMoney(r.amount_paid, r.currency)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {isCredit
                            ? <span className="text-emerald-600 dark:text-emerald-400" title="Not owed to us — money we hold for this customer">{formatMoney(r.amount_due, r.currency)} credit</span>
                            : formatMoney(r.amount_due, r.currency)}
                        </td>
                        <td className="px-4 py-2 text-right" onClick={(e) => isOrder && e.stopPropagation()}>
                          {isOrder ? (
                            <OrderAgingInlineEditor orderId={r.id} categoryId={r.category_id ?? null} categoryName={r.category_name ?? null} expectedDate={r.due_at} categories={incomeCats} onSaved={() => loadAll(workspaceId)}>
                              {r.due_at ?? (r.effective_due_at
                                ? <span className="text-muted-foreground" title="No date set — aging against the workspace's default payment terms. Click to set an explicit date.">{r.effective_due_at} · terms</span>
                                : <span className="text-primary">Set date</span>)}
                            </OrderAgingInlineEditor>
                          ) : (r.due_at ?? '—')}
                        </td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {isOrder ? (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openOrder(r.id)}>
                              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Open order
                            </Button>
                          ) : isCredit ? (
                            r.order_id ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openOrder(r.order_id!)}>
                                <ShoppingCart className="h-3.5 w-3.5 mr-1" /> {r.order_number ?? 'Open order'}
                              </Button>
                            ) : <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <InvoiceActionsMenu invoiceId={r.id} financeBase={financeBase} onChanged={() => loadAll(workspaceId)} />
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <TablePagination page={arPage} total={arFiltered.length} onPageChange={setArPage} label="receivables" />
              </CardContent>
            </Card>
            {/* Customer credit (money held on account) lives in the receivables list above as a
                positively-signed row labelled "Customer credit (overpayment)" — aggregates key
                off entry_kind === 'credit', never off a negative amount. See loadAll's creditRows. */}
          </TabsContent>

          {/* ─────────── PAYABLES ─────────── */}
          <TabsContent value="bank_feed" className="space-y-4">
            {workspaceId && <BankFeedTab workspaceId={workspaceId} />}
          </TabsContent>

          {workspaceId && (
            <PayViaRevolutDialog workspaceId={workspaceId} billId={payRevolutBillId} onClose={() => setPayRevolutBillId(null)} />
          )}

          <TabsContent value="ap" className="space-y-4">
            {(overlayFailed || apMoney.mixed) && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
                {overlayFailed && (
                  <div>
                    Confirmed orders that are not yet invoiced could not be loaded, so the totals
                    below are <strong>lower than the real position</strong>. Reload to try again.
                  </div>
                )}
                {apMoney.mixed && (
                  <div>
                    These rows span more than one currency. Totals are shown in {apMoney.currency} and
                    are <strong>not converted</strong> — read the per-row amounts, not the sums.
                  </div>
                )}
              </div>
            )}
            <BucketCards buckets={apBuckets} active={apBucket} onPick={pickApBucket} noun="bill(s)" money={apMoney} />

            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-4 w-4" /> Payables
                  <span className="text-[10px] font-normal text-muted-foreground">· money we owe</span>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <FilterBar
                    groups={apGroups} values={apValues} onChange={setApValues}
                    previewCount={apPreview}
                    searchPlaceholder="Search supplier / bill #…"
                    title="Filter payables"
                  />
                  {!isAccountant && (
                    <Button size="sm" variant="outline" title="One Revolut draft covering every due bill whose supplier has a verified counterparty — a single in-app approval pays the run"
                      onClick={async () => {
                        try {
                          const acc = await callRevolutApi<{ accounts: Array<{ id: string; currency: string }> }>('accounts', workspaceId!);
                          const eur = acc.accounts.find((a) => a.currency === 'EUR') ?? acc.accounts[0];
                          if (!eur) { toast({ title: 'Connect Revolut first (Profile → Keys)', variant: 'destructive' }); return; }
                          const out = await callRevolutApi<{ drafted: number; skipped: Array<{ bill: string }>; note?: string }>('pay-due-bills', workspaceId!, { source_revolut_account_id: eur.id });
                          toast({ title: out.drafted > 0 ? `${out.drafted} bill(s) drafted — approve in the Revolut app` : 'Nothing to draft', description: out.skipped.length ? `Skipped: ${out.skipped.map((x) => x.bill).join(', ')} (no verified counterparty).` : out.note });
                        } catch (e) { toast({ title: 'Bill run failed', description: (e as Error).message, variant: 'destructive' }); }
                      }}>
                      <SendIcon className="h-4 w-4 mr-1" /> Draft all due
                    </Button>
                  )}
                  {!isAccountant && <Button size="sm" variant="outline" onClick={() => { setScnBillId(undefined); setScnOpen(true); }}><FileMinus className="h-4 w-4 mr-1" /> Supplier credit note</Button>}
                  {!isAccountant && <Button size="sm" onClick={() => setNewExpenseOpen(true)}><ArrowUpCircle className="h-4 w-4 mr-1" /> Add expense</Button>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Bill #</th>
                      <th className="px-4 py-2 text-left">Supplier</th>
                      <th className="px-4 py-2 text-left">Category</th>
                      <th className="px-4 py-2 text-left">Bucket</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Due</th>
                      <th className="px-4 py-2 text-right">Due date</th>
                      <th className="px-4 py-2 text-right">Days overdue</th>
                      {!isAccountant && <th className="px-4 py-2 w-24"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {apFiltered.length === 0 && (
                      <tr><td colSpan={isAccountant ? 9 : 10} className="px-4 py-8 text-center text-muted-foreground">{ap.length === 0 ? 'No open payables.' : 'No payables match the filters.'}</td></tr>
                    )}
                    {paginate(apFiltered, apPage).map((r) => {
                      const isOrder = r.entry_kind === 'order';
                      return (
                      <tr
                        key={r.id}
                        className={`border-b border-border/30 hover:bg-muted/30 ${isOrder ? 'cursor-pointer' : ''}`}
                        // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                        // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                        // row is invalid ARIA and yields a focus stop with no name.
                        onClick={isOrder ? () => openOrder(r.id) : undefined}
                      >
                        <td className="px-4 py-2">
                          {isOrder ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs">{r.description}</span>
                              <span className="text-[10px] text-muted-foreground">· Order, not invoiced</span>
                            </span>
                          ) : isAccountant ? (
                            <span className="font-mono text-xs">{r.supplier_bill_number ?? '—'}</span>
                          ) : (
                            // Opens the expense's payment history — what's been paid against it,
                            // and the way to attach a payment that was recorded earlier.
                            <button
                              type="button"
                              className="font-mono text-xs text-primary hover:underline"
                              title="Payments on this expense"
                              onClick={(e) => { e.stopPropagation(); setPaymentsExpenseId(r.id); }}
                            >
                              {r.supplier_bill_number ?? '—'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">{r.party_name ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground" onClick={(e) => isOrder && e.stopPropagation()}>
                          {isOrder ? (
                            <OrderAgingInlineEditor orderId={r.id} categoryId={r.category_id ?? null} categoryName={r.category_name ?? null} expectedDate={r.due_at} categories={expenseCats} onSaved={() => loadAll(workspaceId)}>
                              {r.category_name ?? <span className="text-primary">Set category</span>}
                            </OrderAgingInlineEditor>
                          ) : (r.category_name ?? '—')}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs ${r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>{ageBucketLabel(r.age_bucket)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.total, r.currency)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid, r.currency)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due, r.currency)}</td>
                        <td className="px-4 py-2 text-right" onClick={(e) => isOrder && e.stopPropagation()}>
                          {isOrder ? (
                            <OrderAgingInlineEditor orderId={r.id} categoryId={r.category_id ?? null} categoryName={r.category_name ?? null} expectedDate={r.due_at} categories={expenseCats} onSaved={() => loadAll(workspaceId)}>
                              {r.due_at ?? (r.effective_due_at
                                ? <span className="text-muted-foreground" title="No date set — aging against the workspace's default payment terms. Click to set an explicit date.">{r.effective_due_at} · terms</span>
                                : <span className="text-primary">Set date</span>)}
                            </OrderAgingInlineEditor>
                          ) : (r.due_at ?? '—')}
                        </td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                        {!isAccountant && (
                          <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            {isOrder ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openOrder(r.id)}>
                                <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Open order
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayExpenseId(r.id)} title="Record a payment against this bill (settles it)">
                                  <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayRevolutBillId(r.id)} title="Send this payment from your Revolut account — draft by default, approved in the Revolut app; the bank feed settles the bill when it executes">
                                  <SendIcon className="h-3.5 w-3.5 mr-1" /> Send
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setScnBillId(r.id); setScnOpen(true); }} title="Record a supplier credit note against this bill">
                                  <FileMinus className="h-3.5 w-3.5 mr-1" /> Credit
                                </Button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <TablePagination page={apPage} total={apFiltered.length} onPageChange={setApPage} label="payables" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─────────── SUPPLIER PORTAL (inbound POs to your claimed identity) ─────────── */}
          <TabsContent value="supplier_portal" className="space-y-4">
            <SupplierPortalPage embedded />
          </TabsContent>

          {/* ─────────── DOCUMENTS (folded in) ─────────── */}
          {DOC_TABS.map((d) => (
            <TabsContent key={d.value} value={d.value} className="space-y-4">
              {d.type === 'orders' ? <OrdersPanel workspaceId={workspaceId} /> : <DocumentsView embeddedType={d.type} />}
            </TabsContent>
          ))}

          {/* ─────────── PLANNING ─────────── */}
          <TabsContent value="planning" className="space-y-4">
            <PlanningTab workspaceId={workspaceId} />
          </TabsContent>

          {/* ─────────── EXPENSE CARDS (finance review) ─────────── */}
          <TabsContent value="trip_cards" className="space-y-4">
            {/* Revolut team cards live NEXT TO their statements: issue/freeze/limit cards
                here, and the imported card expenses land in the reports below. */}
            {!isAccountant && workspaceId && <CardsExpensesCard workspaceId={workspaceId} />}
            <TripExpensesPanel workspaceId={workspaceId} canReview={!isAccountant} />
          </TabsContent>

          {/* ─────────── TIME & BILLING ─────────── */}
          <TabsContent value="time" className="space-y-4">
            <TimeBillingTab workspaceId={workspaceId} />
          </TabsContent>

          {/* ─────────── REPORTS ─────────── */}
          <TabsContent value="reports" className="space-y-4">
            <ReportsTab workspaceId={workspaceId} />
          </TabsContent>

          {/* ─────────── PARTIES ─────────── */}
          <TabsContent value="parties" className="space-y-4">
            <PartiesTab workspaceId={workspaceId} statementsEnabled={settings?.statements_enabled ?? false} autoOpenParty={autoOpenParty} financeBase={financeBase} />
          </TabsContent>

          {/* Dispatch board moved to the Warehouse module. Pointer for old ?tab=doc_dispatch links. */}
          <TabsContent value="doc_dispatch" className="space-y-4">
            <div className="dashboard-card p-8 text-center">
              <PackageCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">Dispatch board now lives in Warehouse</div>
              <p className="text-sm text-muted-foreground mb-4">Loading, dispatch and fulfilment moved to the dedicated Warehouse module.</p>
              <a href="/warehouse" className="text-sm text-primary hover:underline">Open Warehouse →</a>
            </div>
          </TabsContent>

          {/* Warehouse/inventory moved out of Finance into its own paid Stock module. Keep a pointer
              for anyone following an old ?tab=warehouse deep link. */}
          <TabsContent value="warehouse" className="space-y-4">
            <div className="dashboard-card p-8 text-center">
              <Package className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">Inventory now lives in Warehouse</div>
              <p className="text-sm text-muted-foreground mb-4">Warehouse stock, movements, transfers and stocktake moved to the dedicated Warehouse module.</p>
              <a href="/warehouse" className="text-sm text-primary hover:underline">Open Warehouse →</a>
            </div>
          </TabsContent>

          <TabsContent value="sourcing" className="space-y-4">
            <SourcingBoardPanel workspaceId={workspaceId} />
          </TabsContent>

          <TabsContent value="assets" className="space-y-4">
            <CompanyAssetsPanel workspaceId={workspaceId} canManage={!isAccountant} context="finance" />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SettingsTab workspaceId={workspaceId} onSettingsChanged={setSettings} />
          </TabsContent>

          {/* ─────────── FOLLOW-UPS ─────────── */}
          <TabsContent value="followups" className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                <CardTitle>Quotes Needing a Nudge</CardTitle>
                {followUps.length > 0 && (
                  <FilterBar groups={followUpGroups} values={fuValues} onChange={setFuValues} previewCount={fuPreview} title="Filter follow-ups" />
                )}
              </CardHeader>
              <CardContent className="p-0">
                {followUps.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No follow-ups outstanding.</div>
                ) : followUpsView.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No follow-ups match the filter.</div>
                ) : (
                  <>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="px-4 py-2 text-left">Quote</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Value</th>
                        <th className="px-4 py-2 text-right">Days idle</th>
                        <th className="px-4 py-2 text-right">Next scheduled</th>
                        <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginate(followUpsView, followUpsPage).map((r) => (
                        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <Link to={`/quotes/${r.id}`} className="text-primary hover:underline">{r.quote_number ?? r.name ?? r.id.slice(0, 8)}</Link>
                          </td>
                          <td className="px-4 py-2"><span className={`text-xs ${statusTone(r.status)}`}>{r.status}</span></td>
                          <td className="px-4 py-2 text-right">{formatMoney(r.grand_total ?? 0, r.currency ?? 'EUR')}</td>
                          <td className="px-4 py-2 text-right">{r.days_since_activity ?? '—'}d</td>
                          <td className="px-4 py-2 text-right">{r.next_scheduled_follow_up ? new Date(r.next_scheduled_follow_up).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-2 text-right"><Link to={`/quotes/${r.id}`}><Button size="sm" variant="outline">Open</Button></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePagination page={followUpsPage} total={followUpsView.length} onPageChange={setFollowUpsPage} label="quotes" />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </div>

      <NewInvoiceDialog
        workspaceId={workspaceId}
        open={newInvoiceOpen}
        onOpenChange={setNewInvoiceOpen}
        onCreated={(invoiceId) => { setNewInvoiceOpen(false); navigate(`${financeBase}/invoices/${invoiceId}`); }}
      />
      <NewExpenseDialog
        workspaceId={workspaceId}
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        onCreated={async () => { setNewExpenseOpen(false); if (workspaceId) await loadAll(workspaceId); }}
      />
      <NewSupplierCreditNoteDialog
        workspaceId={workspaceId}
        open={scnOpen}
        onOpenChange={setScnOpen}
        supplierBillId={scnBillId}
        onCreated={async () => { setScnOpen(false); if (workspaceId) await loadAll(workspaceId); }}
      />
      {payExpenseId && (
        <RecordPaymentDialog
          workspaceId={workspaceId}
          presetExpenseId={payExpenseId}
          open
          onOpenChange={(v) => { if (!v) setPayExpenseId(null); }}
          onSaved={async () => { setPayExpenseId(null); if (workspaceId) await loadAll(workspaceId); }}
        />
      )}
      <ExpensePaymentsDialog
        workspaceId={workspaceId}
        expenseId={paymentsExpenseId}
        open={!!paymentsExpenseId}
        onOpenChange={(v) => { if (!v) setPaymentsExpenseId(null); }}
        onChanged={async () => { if (workspaceId) await loadAll(workspaceId); }}
      />
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

/** Flat money figure for the Receivables header strip — same visual weight as a bucket card so
 *  the two rows read as one block. */
const MoneySummaryCard: React.FC<{
  label: string; value: string; sub: string; accent?: 'default' | 'destructive';
}> = ({ label, value, sub, accent }) => (
  <Card className="dashboard-card border-0">
    <CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </CardContent>
  </Card>
);

const KpiCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  accent?: 'default' | 'destructive';
}> = ({ icon: Icon, label, value, subtext, accent }) => (
  <Card className="dashboard-card border-0">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
    </CardContent>
  </Card>
);

/**
 * Which currency an aggregate over these rows is actually denominated in.
 *
 * Bucket totals, the DSO base and the AR/AP KPI cards all sum `amount_due` across every row, so
 * they are only meaningful when the rows share a currency. Fall back to formatMoney's EUR
 * default and a USD invoice's 1,000 is added to the euro total and shown with a euro symbol.
 *
 * Summing genuinely mixed rows is not something a symbol can fix, so this reports the dominant
 * currency AND whether the set is mixed; the callers label the total honestly and warn when it
 * cannot be trusted. Converting to a base currency needs stored FX rates per document, which is
 * a larger change.
 */
function aggregateCurrency(rows: AgingRow[]): { currency: string; mixed: boolean } {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const c = r.currency || 'EUR';
    totals.set(c, (totals.get(c) ?? 0) + Math.abs(r.amount_due || 0));
  }
  if (totals.size === 0) return { currency: 'EUR', mixed: false };
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return { currency: sorted[0][0], mixed: totals.size > 1 };
}

function bucketize(rows: AgingRow[]): Record<AgeBucket, { count: number; total: number }> {
  const out = {
    current: { count: 0, total: 0 },
    '0-30': { count: 0, total: 0 },
    '31-60': { count: 0, total: 0 },
    '61-90': { count: 0, total: 0 },
    '90+': { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    no_due_date: { count: 0, total: 0 },
  } as Record<AgeBucket, { count: number; total: number }>;
  for (const r of rows) {
    // Credit held for a customer is not a receivable that ages — it has no due date and it is
    // not money owed to us. Summing it here is how the "No due date" card once showed −€920.
    if (r.entry_kind === 'credit') continue;
    out[r.age_bucket].count += 1;
    out[r.age_bucket].total += r.amount_due || 0;
  }
  return out;
}

/** Clickable age-bucket cards — clicking toggles the active bucket filter. */
const BucketCards: React.FC<{
  buckets: Record<AgeBucket, { count: number; total: number }>;
  active: string; onPick: (b: string) => void; noun: string;
  /** Currency these totals are denominated in, and whether the underlying rows are mixed. */
  money: { currency: string; mixed: boolean };
}> = ({ buckets, active, onPick, noun, money }) => {
  // Include 'no_due_date' whenever it carries money/rows — otherwise a workspace whose
  // receivables/payables are all uninvoiced orders or on-account credit (neither of which
  // ages) would show five €0 cards while the table below is full. Only rendered when it has
  // content so dated books keep the clean five-card row.
  const cards: AgeBucket[] = buckets.no_due_date.count > 0 ? [...AGE_BUCKETS, 'no_due_date'] : AGE_BUCKETS;
  return (
    <div className={`grid grid-cols-2 gap-3 ${cards.length > 5 ? 'md:grid-cols-3 lg:grid-cols-6' : 'md:grid-cols-5'}`}>
      {cards.map((b) => (
        <button key={b} type="button" onClick={() => onPick(active === b ? 'all' : b)} className="text-left">
          <Card className={`dashboard-card border-0 transition ${active === b ? 'ring-2 ring-primary' : 'hover:bg-muted/30'}`}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{b === 'no_due_date' ? 'No due date / expected' : ageBucketLabel(b)}</div>
              <div className="text-lg font-semibold">{formatMoney(buckets[b].total, money.currency)}</div>
              <div className="text-[10px] text-muted-foreground">
                {buckets[b].count} {noun}{money.mixed ? ' · mixed currencies' : ''}
              </div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
};

const BucketSummary: React.FC<{
  title: string;
  buckets: Record<AgeBucket, { count: number; total: number }>;
  viewLink: 'ar' | 'ap';
  /** Money from confirmed-but-uninvoiced orders (no due date, so it can't age) — shown as a
   *  separate "expected" line so committed revenue/spend isn't invisible here. */
  expected?: number;
  /** On-account customer credit (positive = money held). Subtracted below so the summary shows
   *  the true NET position. AR only — payables have no credit. */
  credit?: number;
  /** Currency these totals are denominated in, and whether the underlying rows are mixed. */
  money: { currency: string; mixed: boolean };
}> = ({ title, buckets, viewLink, expected = 0, credit = 0, money }) => {
  // Aged rows (invoices/bills) + uninvoiced orders − credit held = the net position, matching the
  // AR/AP-outstanding KPI. Shown as a footer so the dashboard summary is a complete picture.
  const aged = AGE_BUCKETS.reduce((s, b) => s + buckets[b].total, 0);
  const net = Math.round((aged + expected - credit) * 100) / 100;
  return (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
      <CardTitle>{title}</CardTitle>
      <Button size="sm" variant="ghost" onClick={() => document.querySelector<HTMLButtonElement>(`[data-value=${viewLink}]`)?.click()}>View all</Button>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <tbody>
          {AGE_BUCKETS.map((b) => (
            <tr key={b} className="border-b border-border/30">
              <td className="px-4 py-2 text-xs text-muted-foreground">{ageBucketLabel(b)}</td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">{buckets[b].count}</td>
              <td className={`px-4 py-2 text-right font-medium ${b === '90+' || b === '61-90' ? 'text-destructive' : ''}`}>{formatMoney(buckets[b].total, money.currency)}</td>
            </tr>
          ))}
          {expected > 0 && (
            <tr className="border-b border-border/30 bg-muted/20">
              <td className="px-4 py-2 text-xs text-muted-foreground" title="Confirmed orders not yet invoiced — no due date, so not aged above">Expected (uninvoiced orders)</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right font-medium text-amber-600">{formatMoney(expected, money.currency)}</td>
            </tr>
          )}
          {credit > 0 && (
            <tr className="border-b border-border/30 bg-muted/20">
              <td className="px-4 py-2 text-xs text-muted-foreground" title="Customer money we hold (overpayments) — covers what they owe before any new money is due">Customer credit we hold</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">{formatMoney(credit, money.currency)}</td>
            </tr>
          )}
          {/* Never a negative headline: when credit held exceeds what is owed, say that in words
              and show the surplus as a positive number. */}
          {net >= 0 ? (
            <tr className="bg-muted/40">
              <td className="px-4 py-2 text-xs font-semibold">{viewLink === 'ar' ? 'Owed to us after credit' : 'Net payable'}</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right font-semibold">{formatMoney(net, money.currency)}</td>
            </tr>
          ) : (
            <tr className="bg-muted/40">
              <td className="px-4 py-2 text-xs font-semibold" title="All receivables are covered; this much customer money is left over for their next orders or refunds">Credit left after covering all owed</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(-net, money.currency)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </CardContent>
  </Card>
  );
};

const CashFlowCard: React.FC<{ rows: CashFlowRow[] }> = ({ rows }) => {
  const grouped = useMemo(() => {
    const acc = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const key = r.expected_date.slice(0, 7);
      const cell = acc.get(key) ?? { in: 0, out: 0 };
      if (r.direction === 'in') cell.in += Number(r.amount ?? 0);
      else cell.out += Number(r.amount ?? 0);
      acc.set(key, cell);
    }
    return Array.from(acc.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><LineChart className="h-4 w-4" /> Cash flow (next 90 days)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2 text-left">Month</th>
              <th className="px-4 py-2 text-right text-emerald-500">In</th>
              <th className="px-4 py-2 text-right text-red-400">Out</th>
              <th className="px-4 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No dated invoices or bills in the next 90 days.</td></tr>
            )}
            {grouped.map(([month, cell]) => (
              <tr key={month} className="border-b border-border/30">
                <td className="px-4 py-2">{month}</td>
                <td className="px-4 py-2 text-right text-emerald-500">{formatMoney(cell.in)}</td>
                <td className="px-4 py-2 text-right text-red-400">{formatMoney(cell.out)}</td>
                <td className={`px-4 py-2 text-right font-medium ${cell.in - cell.out < 0 ? 'text-destructive' : ''}`}>{formatMoney(cell.in - cell.out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const PnlCard: React.FC<{ rows: PnlRow[] }> = ({ rows }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3">
      <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Monthly P&amp;L (last 12 months)</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {/* The ONLY element measured as clipping on the platform at 375px: 418px of table inside
          a 365px content box, with Layout's `overflow-x-hidden` on <main> suppressing both the
          scrollbar and the swipe — so 53px was simply unreachable. `%` vanished entirely and
          `Margin` was cut, meaning a phone user opened Monthly P&L and could not see the margin
          they came for. Note the issue's claim that "every other wide table on this page already
          has this wrapper" does NOT hold for this file — this is its only overflow-x-auto. The 12
          scrollers measured on /finance come from the child panels in src/modules/finance.
          (audit #299 finding 1) */}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Month</th>
            <th className="px-4 py-2 text-right">Revenue</th>
            <th className="px-4 py-2 text-right">COGS</th>
            <th className="px-4 py-2 text-right">Margin</th>
            <th className="px-4 py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No invoices issued yet — nothing to roll up.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.period_month} className="border-b border-border/30">
              <td className="px-4 py-2">{new Date(r.period_month).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</td>
              <td className="px-4 py-2 text-right">{formatMoney(r.revenue_net)}</td>
              <td className="px-4 py-2 text-right">{formatMoney(r.cogs)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(r.gross_margin)}</td>
              <td className="px-4 py-2 text-right">{formatPct(r.gross_margin_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </CardContent>
  </Card>
);

/** Live balance per bank/cash account — "where do we have what money". */
const BankBalancesCard: React.FC<{ rows: BankAccountBalance[]; onManage?: () => void }> = ({ rows, onManage }) => {
  const active = useMemo(() => rows.filter((r) => r.is_active), [rows]);
  const totalsByCurrency = useMemo(() => active.reduce((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + Number(r.current_balance || 0);
    return acc;
  }, {} as Record<string, number>), [active]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><BanknoteIcon className="h-4 w-4" /> Cash by account</CardTitle>
        <Button size="sm" variant="ghost" onClick={onManage}>{active.length === 0 ? 'Add accounts' : 'Manage'}</Button>
      </CardHeader>
      <CardContent className="p-0">
        {active.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No accounts yet. Add them in Settings → Accounts to track where your money sits, then pick an account whenever you record a payment.
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((r) => (
                <div key={r.bank_account_id} className="rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{r.name}</span>
                    {r.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                  </div>
                  <div className={`mt-1 text-lg font-semibold tabular-nums ${Number(r.current_balance) < 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.current_balance), r.currency)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">+{formatMoney(Number(r.total_in), r.currency)} in · −{formatMoney(Number(r.total_out), r.currency)} out</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 border-t border-border/60 px-4 py-2 text-xs">
              {Object.entries(totalsByCurrency).map(([cur, total]) => (
                <span key={cur} className="text-muted-foreground">Total {cur}: <span className="font-semibold text-foreground">{formatMoney(total, cur)}</span></span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Revenue trend (last 12 months) + period-over-period growth. Reuses the monthly
 * P&L rows already loaded for the dashboard, so it adds no extra query. Pure CSS
 * bars — no chart dependency, matching the codebase's build-it-ourselves pattern.
 */
const RevenueTrendCard: React.FC<{ rows: PnlRow[] }> = ({ rows }) => {
  const months = useMemo(() => rows.slice(-12), [rows]);
  const stats = useMemo(() => {
    if (months.length === 0) return null;
    const last = months[months.length - 1];
    const prev = months.length > 1 ? months[months.length - 2] : null;
    const lastRev = Number(last.revenue_net ?? 0);
    const prevRev = prev ? Number(prev.revenue_net ?? 0) : null;
    const momPct = prevRev != null && prevRev > 0 ? ((lastRev - prevRev) / prevRev) * 100 : null;
    // Same calendar month a year ago (13th-from-last needs 13 rows) — only when present.
    const yearAgo = months.length >= 13 ? Number(months[months.length - 13].revenue_net ?? 0) : null;
    const yoyPct = yearAgo != null && yearAgo > 0 ? ((lastRev - yearAgo) / yearAgo) * 100 : null;
    const max = Math.max(1, ...months.map((m) => Number(m.revenue_net ?? 0)));
    return { last, lastRev, momPct, yoyPct, max };
  }, [months]);

  const Delta: React.FC<{ pct: number | null; label: string }> = ({ pct, label }) => {
    if (pct == null) return null;
    const up = pct >= 0;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${up ? 'bg-emerald-500/15 text-emerald-500' : 'bg-destructive/15 text-destructive'}`}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% <span className="text-muted-foreground">{label}</span>
      </span>
    );
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue trend</CardTitle>
        {stats && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{formatMoney(stats.lastRev)}</span>
            <Delta pct={stats.momPct} label="vs last mo" />
            <Delta pct={stats.yoyPct} label="vs last yr" />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-5">
        {!stats ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No invoices issued yet — nothing to trend.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {months.map((m, i) => {
              const rev = Number(m.revenue_net ?? 0);
              const isLast = i === months.length - 1;
              const label = new Date(m.period_month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
              return (
                <div key={m.period_month} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className={`w-full rounded-t ${isLast ? 'bg-primary' : 'bg-primary/35 group-hover:bg-primary/60'} transition-colors`}
                    style={{ height: `${Math.max(2, (rev / stats.max) * 100)}%` }}
                    title={`${label}: ${formatMoney(rev)}`}
                  />
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center">{label.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Dashboard sales-insight cards ───────────────────────────────────────────

const InsightCard: React.FC<{
  title: string; icon: React.ComponentType<{ className?: string }>;
  onViewAll?: () => void; empty: string; isEmpty: boolean; children: React.ReactNode;
}> = ({ title, icon: Icon, onViewAll, empty, isEmpty, children }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
      <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle>
      {onViewAll && <Button size="sm" variant="ghost" onClick={onViewAll}>View all</Button>}
    </CardHeader>
    <CardContent className="p-0">
      {isEmpty ? <div className="p-6 text-center text-sm text-muted-foreground">{empty}</div> : children}
    </CardContent>
  </Card>
);

/** Highest-revenue customers in the selected period. */
const TopCustomersCard: React.FC<{ rows: SalesPerCustomerRow[]; onViewAll?: () => void }> = ({ rows, onViewAll }) => {
  const top = useMemo(() => [...rows].sort((a, b) => Number(b.revenue_net || 0) - Number(a.revenue_net || 0)).slice(0, 6), [rows]);
  const max = top.length ? Number(top[0].revenue_net || 0) : 0;
  return (
    <InsightCard title="Top customers" icon={Award} onViewAll={onViewAll} isEmpty={top.length === 0} empty="No sales in this period yet.">
      <ul className="divide-y divide-border/40">
        {top.map((r, i) => (
          <li key={`${r.party_type}-${r.party_id}`} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                <span className="truncate text-sm font-medium">{r.display_name || '—'}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium">{formatMoney(Number(r.revenue_net || 0))}</div>
                <div className="text-[10px] text-muted-foreground">{r.invoice_count ?? 0} inv · {formatMoney(Number(r.gross_margin || 0))} margin</div>
              </div>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-muted">
              <div className="h-1 rounded-full bg-primary" style={{ width: `${max > 0 ? Math.max(4, (Number(r.revenue_net || 0) / max) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
};

/** Best-selling products in the selected period (the "shopping" detail). */
const TopProductsCard: React.FC<{ rows: SalesPerProductRow[]; onViewAll?: () => void }> = ({ rows, onViewAll }) => {
  const top = useMemo(() => [...rows].sort((a, b) => Number(b.revenue_net || 0) - Number(a.revenue_net || 0)).slice(0, 6), [rows]);
  return (
    <InsightCard title="Best sellers" icon={Boxes} onViewAll={onViewAll} isEmpty={top.length === 0} empty="No products sold in this period yet.">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Product</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r, i) => (
            <tr key={r.product_id ?? `${r.product_name}-${i}`} className="border-b border-border/30">
              <td className="px-4 py-2">
                <div className="truncate text-sm">{r.product_name || '—'}</div>
                {r.sku && <div className="text-[10px] text-muted-foreground font-mono">{r.sku}</div>}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{Number(r.total_quantity ?? 0)}</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(Number(r.revenue_net || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </InsightCard>
  );
};

/** Most recent sales orders with fulfilment + payment status. */
const RecentOrdersCard: React.FC<{ rows: OrderListRow[]; onViewAll?: () => void }> = ({ rows, onViewAll }) => {
  const recent = useMemo(() => rows.slice(0, 6), [rows]);
  return (
    <InsightCard title="Recent orders" icon={ShoppingCart} onViewAll={onViewAll} isEmpty={recent.length === 0} empty="No sales orders yet.">
      <ul className="divide-y divide-border/40">
        {recent.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{o.party_name ?? 'Walk-in'}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{o.order_number ?? o.id.slice(0, 8)}</span> · {new Date(o.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] ${statusTone(o.status)}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                  <span className={`text-[10px] ${statusTone(o.payment_status)}`}>{ORDER_PAYMENT_LABEL[o.payment_status]}</span>
                </div>
                <div className="text-sm font-medium">{formatMoney(Number(o.total || 0), o.currency)}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
};

/** Customers who owe the most right now (snapshot, not period-scoped). */
const TopOutstandingCard: React.FC<{ rows: TopOutstandingRow[]; onViewAll?: () => void }> = ({ rows, onViewAll }) => {
  const top = useMemo(() => [...rows].sort((a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0)).slice(0, 6), [rows]);
  return (
    <InsightCard title="Who owes the most" icon={ArrowDownCircle} onViewAll={onViewAll} isEmpty={top.length === 0} empty="No outstanding balances — all clear.">
      <ul className="divide-y divide-border/40">
        {top.map((r) => (
          <li key={`${r.party_type}-${r.party_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.display_name || '—'}</div>
              <div className="text-xs text-muted-foreground">
                {r.open_invoice_count ?? 0} open · {r.max_days_overdue > 0 ? `${r.max_days_overdue}d overdue` : 'on schedule'}
              </div>
            </div>
            <div className={`text-sm font-medium shrink-0 ${r.max_days_overdue > 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.outstanding || 0))}</div>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
};

export default FinancePage;
