import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
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
import {
  ordersService,
  ORDER_STATUS_LABEL,
  ORDER_PAYMENT_LABEL,
  type OrderListRow,
} from '@/modules/finance/services/ordersService';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { NewSupplierBillDialog } from '@/modules/finance/components/NewSupplierBillDialog';
import { NewSupplierCreditNoteDialog } from '@/modules/finance/components/NewSupplierCreditNoteDialog';
import { PlanningTab } from '@/modules/finance/tabs/PlanningTab';
import { ReportsTab } from '@/modules/finance/tabs/ReportsTab';
import { TimeBillingTab } from '@/modules/finance/tabs/TimeBillingTab';
import { PartiesTab } from '@/modules/finance/tabs/PartiesTab';
import { SettingsTab } from '@/modules/finance/tabs/SettingsTab';
import TripExpensesPanel from '@/modules/finance/components/TripExpensesPanel';
import { SourcingBoardPanel } from '@/modules/finance/components/SourcingBoardPanel';
import { MarketplaceEarningsTab } from '@/modules/finance/components/MarketplaceEarningsTab';
import type { FinanceSettings } from '@/modules/finance/services/financeService';
import { CommissionSummaryCard } from '@/components/business/marketplace/CommissionSummaryCard';
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
  { value: 'doc_credit_notes', type: 'credit_notes', label: 'Credit notes', icon: FileMinus },
  { value: 'doc_payments', type: 'payments', label: 'Payments', icon: Banknote },
  { value: 'doc_expenses', type: 'expenses', label: 'Expenses', icon: ArrowUpCircle },
  { value: 'doc_dispatch', type: 'dispatch', label: 'Dispatch board', icon: PackageCheck },
  { value: 'doc_delivery', type: 'delivery_notes', label: 'Delivery notes', icon: Truck },
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
  // oldest-membership query so Finance follows the workspace switcher (#194).
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { isAccountant } = usePermissions(); // read-only role hides write actions
  const workspaceId = activeWorkspaceId;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ar, setAr] = useState<AgingRow[]>([]);
  const [ap, setAp] = useState<AgingRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [cashPosition, setCashPosition] = useState(0); // money in bank = Σ payments in − out
  const [bankBalances, setBankBalances] = useState<BankAccountBalance[]>([]);
  // Money received but not yet invoiced (deposits / on-account) — cash held, not yet revenue.
  const [deposits, setDeposits] = useState<Awaited<ReturnType<typeof financeService.getDepositsOnAccount>>>({ total: 0, currency: 'EUR', rows: [] });

  // Dashboard sales insights (period-scoped — reuse the Reports RPCs at a glance).
  type DashPeriod = 'this_month' | 'last_month' | 'last_quarter' | 'ytd';
  const [dashPeriod, setDashPeriod] = useState<DashPeriod>('this_month');
  const [topCustomers, setTopCustomers] = useState<SalesPerCustomerRow[]>([]);
  const [topProducts, setTopProducts] = useState<SalesPerProductRow[]>([]);
  const [topOutstanding, setTopOutstanding] = useState<TopOutstandingRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderListRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newBillOpen, setNewBillOpen] = useState(false);
  const [scnOpen, setScnOpen] = useState(false);
  const [scnBillId, setScnBillId] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);

  // AR/AP list filters (party search + category + age bucket), one set per side.
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [arQuery, setArQuery] = useState(''); const [arCat, setArCat] = useState('all'); const [arBucket, setArBucket] = useState<string>('all');
  const [apQuery, setApQuery] = useState(''); const [apCat, setApCat] = useState('all'); const [apBucket, setApBucket] = useState<string>('all');

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
      try {
        const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId: wsId });
        const toAgingRow = (o: typeof uninvoiced[number]): AgingRow => ({
          id: o.id,
          workspace_id: wsId,
          total: o.total,
          amount_paid: o.settled,
          amount_due: o.outstanding,
          due_at: null,
          issued_at: o.created_at,
          status: o.status,
          age_bucket: 'no_due_date',
          days_overdue: 0,
          entry_kind: 'order',
          description: `Order ${o.order_number ?? o.id.slice(0, 8)}`,
          party_name: o.party_name,
        });
        arWithOrders = [...arWithOrders, ...uninvoiced.filter((o) => o.order_type === 'sales').map(toAgingRow)];
        apWithOrders = [...apWithOrders, ...uninvoiced.filter((o) => o.order_type === 'purchase').map(toAgingRow)];
      } catch { /* orders overlay is best-effort — invoices/bills still render */ }
      setAr(arWithOrders);
      setAp(apWithOrders);
      setCategories(cats);
      setFollowUps(queue);
      setPnl(pnlRows);
      setCashFlow(cashRows);
      setRecentInvoices(invoices);
      // Cash in bank — actual money in/out across all payments (not planned).
      const { data: pays } = await supabase.from('payments').select('direction, amount').eq('workspace_id', wsId);
      setCashPosition((pays ?? []).reduce((a: number, p: any) => a + (p.direction === 'in' ? Number(p.amount) : -Number(p.amount)), 0));
      // Per-account balances (where the money actually sits).
      setBankBalances(await financeService.getBankAccountBalances(wsId).catch(() => [] as BankAccountBalance[]));
      // Deposits / on-account — cash received that isn't a document (revenue) yet.
      setDeposits(await financeService.getDepositsOnAccount(wsId).catch(() => ({ total: 0, currency: 'EUR', rows: [] })));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load finance data');
      toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ---- Derived metrics
  const kpis = useMemo(() => {
    const arOutstanding = ar.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const apOutstanding = ap.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const overdue = ar.filter((r) => r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date');
    const overdueTotal = overdue.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const lastMonth = pnl.length > 0 ? pnl[pnl.length - 1] : null;
    const monthRevenue = Number(lastMonth?.revenue_net ?? 0);
    const monthMargin = Number(lastMonth?.gross_margin ?? 0);
    const monthMarginPct = lastMonth?.gross_margin_pct ?? null;
    // Invoiced AR only ages (uninvoiced orders have no due date) → DSO is over invoiced receivables.
    const invoicedAr = ar.filter((r) => r.entry_kind !== 'order').reduce((acc, r) => acc + (r.amount_due || 0), 0);
    // True DSO = AR ÷ trailing-12-mo revenue × 365. Null when there's no revenue to divide by.
    const annualRevenue = pnl.reduce((acc, p) => acc + Number(p.revenue_net ?? 0), 0);
    const dso = annualRevenue > 0 ? Math.round((invoicedAr / annualRevenue) * 365) : null;
    return { arOutstanding, apOutstanding, overdueTotal, monthRevenue, monthMargin, monthMarginPct, dso };
  }, [ar, ap, pnl]);

  // Uninvoiced-order money (expected) shown alongside the invoiced aging buckets, per side.
  const arExpected = useMemo(() => ar.filter((r) => r.entry_kind === 'order').reduce((a, r) => a + (r.amount_due || 0), 0), [ar]);
  const apExpected = useMemo(() => ap.filter((r) => r.entry_kind === 'order').reduce((a, r) => a + (r.amount_due || 0), 0), [ap]);

  const arBuckets = useMemo(() => bucketize(ar), [ar]);
  const apBuckets = useMemo(() => bucketize(ap), [ap]);

  const applyAgingFilters = (rows: AgingRow[], q: string, cat: string, bucket: string) => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucket !== 'all' && r.age_bucket !== bucket) return false;
      if (cat === 'none' ? r.category_id : cat !== 'all' && r.category_id !== cat) return false;
      if (term) {
        const hay = [r.party_name, r.internal_number, r.supplier_bill_number, r.description, r.category_name]
          .map((x) => String(x ?? '').toLowerCase());
        if (!hay.some((h) => h.includes(term))) return false;
      }
      return true;
    });
  };
  const arFiltered = useMemo(() => applyAgingFilters(ar, arQuery, arCat, arBucket), [ar, arQuery, arCat, arBucket]);
  const apFiltered = useMemo(() => applyAgingFilters(ap, apQuery, apCat, apBucket), [ap, apQuery, apCat, apBucket]);
  const incomeCats = useMemo(() => categories.filter((c) => c.kind === 'income' || c.kind === 'both'), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense' || c.kind === 'both'), [categories]);

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
            {!isAccountant && (
              <Link
                to="/pos"
                className="flex w-full items-center justify-start rounded-md px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Receipt className="h-4 w-4 mr-2" /> Point of Sale
              </Link>
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
              <Plane className="h-4 w-4 mr-2" /> Expense cards
            </TabsTrigger>
            {!isAccountant && (
              <TabsTrigger value="time" className="w-full justify-start">
                <Clock className="h-4 w-4 mr-2" /> Time &amp; billing
              </TabsTrigger>
            )}
            <TabsTrigger value="reports" className="w-full justify-start">
              <BarChart3 className="h-4 w-4 mr-2" /> Reports
            </TabsTrigger>
            <TabsTrigger value="parties" className="w-full justify-start">
              <Users className="h-4 w-4 mr-2" /> Customers &amp; Suppliers
            </TabsTrigger>
            <TabsTrigger value="followups" className="w-full justify-start">
              <Bell className="h-4 w-4 mr-2" /> Follow-ups ({followUps.length})
            </TabsTrigger>
            {!isAccountant && (
              <TabsTrigger value="marketplace" className="w-full justify-start">
                <TrendingUp className="h-4 w-4 mr-2" /> Marketplace
              </TabsTrigger>
            )}
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
                value={formatMoney(kpis.arOutstanding)}
                accent={kpis.overdueTotal > 0 ? 'destructive' : 'default'}
                subtext={kpis.overdueTotal > 0 ? `${formatMoney(kpis.overdueTotal)} overdue` : 'All on schedule'}
              />
              <KpiCard
                icon={ArrowUpCircle}
                label="AP outstanding"
                value={formatMoney(kpis.apOutstanding)}
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

            {/* Marketplace commission earned (downline catalog sales) — renders only when non-zero */}
            <CommissionSummaryCard />

            {/* AR / AP buckets side-by-side */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BucketSummary title="Receivables by age" buckets={arBuckets} viewLink="ar" expected={arExpected} />
              <BucketSummary title="Payables by age" buckets={apBuckets} viewLink="ap" expected={apExpected} />
            </div>

            {/* Money received but not yet a document — deposits / on-account. Cash we hold that
                isn't revenue yet (not in P&L / AR). Reconcile each → issue its receipt/invoice. */}
            {deposits.total > 0 && (
              <Card>
                <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><BanknoteIcon className="h-4 w-4" /> Received, not yet invoiced — deposits / on-account</CardTitle>
                  <span className="text-sm font-semibold text-amber-600">{formatMoney(deposits.total, deposits.currency)}</span>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="px-5 pt-3 text-xs text-muted-foreground">Cash you've received that isn't a receipt/invoice yet — it's held as a customer deposit (not revenue, not in AR). Issue a document to recognise it.</p>
                  <ul className="divide-y divide-border/40 mt-2">
                    {deposits.rows.slice(0, 8).map((d) => (
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
                  <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" /> Next follow-ups</CardTitle>
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
                              {r.days_since_activity ?? '—'}d idle · <Badge variant="outline" className="ml-1 text-[10px]">{r.status}</Badge>
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
                  <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> Recent invoices</CardTitle>
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
                                <Badge variant={i.status === 'overdue' ? 'destructive' : i.status === 'paid' ? 'default' : 'outline'} className="text-[10px]">{i.status}</Badge>
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Receivables — money customers owe us</h3>
                <p className="text-xs text-muted-foreground">Open invoices plus confirmed orders not yet invoiced. To invoice an accepted quote, use Issue invoice on the quote page.</p>
              </div>
              {!isAccountant && (
                <div className="flex items-center gap-2">
                  <Button onClick={() => setNewInvoiceOpen(true)}><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
                </div>
              )}
            </div>

            <BucketCards buckets={arBuckets} active={arBucket} onPick={setArBucket} noun="receivable(s)" />
            <AgingFilterBar
              query={arQuery} setQuery={setArQuery} cat={arCat} setCat={setArCat}
              bucket={arBucket} setBucket={setArBucket} categories={incomeCats}
              searchPlaceholder="Search customer / number…"
            />

            <Card>
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
                      <th className="px-4 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {arFiltered.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">{ar.length === 0 ? 'No open receivables.' : 'No receivables match the filters.'}</td></tr>
                    )}
                    {arFiltered.map((r) => {
                      const isOrder = r.entry_kind === 'order';
                      return (
                      <tr
                        key={r.id}
                        className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                        onClick={isOrder ? () => onTabChange('doc_orders') : () => navigate(`${financeBase}/invoices/${r.id}`)}
                      >
                        <td className="px-4 py-2">
                          {isOrder ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs">{r.description}</span>
                              <Badge variant="secondary" className="text-[10px]">Order · not invoiced</Badge>
                            </span>
                          ) : (
                            <span className="font-mono text-xs">{r.internal_number}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">{r.party_name ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{r.category_name ?? '—'}</td>
                        <td className="px-4 py-2">
                          <Badge variant={r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'destructive' : 'outline'}>{ageBucketLabel(r.age_bucket)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.total)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due)}</td>
                        <td className="px-4 py-2 text-right">{r.due_at ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {isOrder ? (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onTabChange('doc_orders')}>
                              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Open order
                            </Button>
                          ) : (
                            <InvoiceActionsMenu invoiceId={r.id} financeBase={financeBase} onChanged={() => loadAll(workspaceId)} />
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─────────── PAYABLES ─────────── */}
          <TabsContent value="ap" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Payables — money we owe</h3>
                <p className="text-xs text-muted-foreground">Open supplier bills plus confirmed purchase orders not yet billed. Suppliers must be marked <code>is_supplier</code> in CRM.</p>
              </div>
              <div className="flex items-center gap-2">
                {!isAccountant && <Button variant="outline" onClick={() => { setScnBillId(undefined); setScnOpen(true); }}><FileMinus className="h-4 w-4 mr-1" /> Supplier credit note</Button>}
                {!isAccountant && <Button onClick={() => setNewBillOpen(true)}><Plus className="h-4 w-4 mr-1" /> New supplier bill</Button>}
              </div>
            </div>

            <BucketCards buckets={apBuckets} active={apBucket} onPick={setApBucket} noun="bill(s)" />
            <AgingFilterBar
              query={apQuery} setQuery={setApQuery} cat={apCat} setCat={setApCat}
              bucket={apBucket} setBucket={setApBucket} categories={expenseCats}
              searchPlaceholder="Search supplier / bill #…"
            />

            <Card>
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
                      {!isAccountant && <th className="px-4 py-2 w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {apFiltered.length === 0 && (
                      <tr><td colSpan={isAccountant ? 9 : 10} className="px-4 py-8 text-center text-muted-foreground">{ap.length === 0 ? 'No open payables.' : 'No payables match the filters.'}</td></tr>
                    )}
                    {apFiltered.map((r) => {
                      const isOrder = r.entry_kind === 'order';
                      return (
                      <tr
                        key={r.id}
                        className={`border-b border-border/30 hover:bg-muted/30 ${isOrder ? 'cursor-pointer' : ''}`}
                        onClick={isOrder ? () => onTabChange('doc_orders') : undefined}
                      >
                        <td className="px-4 py-2">
                          {isOrder ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs">{r.description}</span>
                              <Badge variant="secondary" className="text-[10px]">Order · not invoiced</Badge>
                            </span>
                          ) : (
                            <span className="font-mono text-xs">{r.supplier_bill_number ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">{r.party_name ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{r.category_name ?? '—'}</td>
                        <td className="px-4 py-2">
                          <Badge variant={r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'destructive' : 'outline'}>{ageBucketLabel(r.age_bucket)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.total)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due)}</td>
                        <td className="px-4 py-2 text-right">{r.due_at ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                        {!isAccountant && (
                          <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            {isOrder ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onTabChange('doc_orders')}>
                                <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Open order
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setScnBillId(r.id); setScnOpen(true); }} title="Record a supplier credit note against this bill">
                                <FileMinus className="h-3.5 w-3.5 mr-1" /> Credit
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─────────── SUPPLIER PORTAL (inbound POs to your claimed identity) ─────────── */}
          <TabsContent value="supplier_portal" className="space-y-4">
            <SupplierPortalPage />
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

          {/* ─────────── SETTINGS ─────────── */}
          <TabsContent value="marketplace" className="space-y-4">
            <MarketplaceEarningsTab />
          </TabsContent>

          {/* Warehouse/inventory moved out of Finance into its own paid Stock module. Keep a pointer
              for anyone following an old ?tab=warehouse deep link. */}
          <TabsContent value="warehouse" className="space-y-4">
            <div className="dashboard-card p-8 text-center">
              <Package className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">Inventory now lives in Stock</div>
              <p className="text-sm text-muted-foreground mb-4">Warehouse stock, movements, transfers and stocktake moved to the dedicated Stock module.</p>
              <a href="/stock" className="text-sm text-primary hover:underline">Open Stock →</a>
            </div>
          </TabsContent>

          <TabsContent value="sourcing" className="space-y-4">
            <SourcingBoardPanel workspaceId={workspaceId} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SettingsTab workspaceId={workspaceId} onSettingsChanged={setSettings} />
          </TabsContent>

          {/* ─────────── FOLLOW-UPS ─────────── */}
          <TabsContent value="followups" className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3">
                <CardTitle className="text-sm">Quotes needing a nudge</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {followUps.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No follow-ups outstanding.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="px-4 py-2 text-left">Quote</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Value</th>
                        <th className="px-4 py-2 text-right">Days idle</th>
                        <th className="px-4 py-2 text-right">Next scheduled</th>
                        <th className="px-4 py-2 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {followUps.map((r) => (
                        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <Link to={`/quotes/${r.id}`} className="text-primary hover:underline">{r.quote_number ?? r.name ?? r.id.slice(0, 8)}</Link>
                          </td>
                          <td className="px-4 py-2"><Badge variant="outline">{r.status}</Badge></td>
                          <td className="px-4 py-2 text-right">{formatMoney(r.grand_total ?? 0, r.currency ?? 'EUR')}</td>
                          <td className="px-4 py-2 text-right">{r.days_since_activity ?? '—'}d</td>
                          <td className="px-4 py-2 text-right">{r.next_scheduled_follow_up ? new Date(r.next_scheduled_follow_up).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-2 text-right"><Link to={`/quotes/${r.id}`}><Button size="sm" variant="outline">Open</Button></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
      <NewSupplierBillDialog
        workspaceId={workspaceId}
        open={newBillOpen}
        onOpenChange={setNewBillOpen}
        onCreated={async () => { setNewBillOpen(false); if (workspaceId) await loadAll(workspaceId); }}
      />
      <NewSupplierCreditNoteDialog
        workspaceId={workspaceId}
        open={scnOpen}
        onOpenChange={setScnOpen}
        supplierBillId={scnBillId}
        onCreated={async () => { setScnOpen(false); if (workspaceId) await loadAll(workspaceId); }}
      />
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

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
    out[r.age_bucket].count += 1;
    out[r.age_bucket].total += r.amount_due || 0;
  }
  return out;
}

/** Search + category filter bar for the AR/AP list views. */
const AgingFilterBar: React.FC<{
  query: string; setQuery: (v: string) => void;
  cat: string; setCat: (v: string) => void;
  bucket: string; setBucket: (v: string) => void;
  categories: FinanceCategory[];
  searchPlaceholder: string;
}> = ({ query, setQuery, cat, setCat, bucket, setBucket, categories, searchPlaceholder }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="h-8 w-60 text-xs" />
    <Select value={cat} onValueChange={setCat}>
      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All categories</SelectItem>
        <SelectItem value="none">Uncategorized</SelectItem>
        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
    {bucket !== 'all' && (
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setBucket('all')}>
        Bucket: {ageBucketLabel(bucket as AgeBucket)} ✕
      </Button>
    )}
  </div>
);

/** Clickable age-bucket cards — clicking toggles the active bucket filter. */
const BucketCards: React.FC<{
  buckets: Record<AgeBucket, { count: number; total: number }>;
  active: string; onPick: (b: string) => void; noun: string;
}> = ({ buckets, active, onPick, noun }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
    {AGE_BUCKETS.map((b) => (
      <button key={b} type="button" onClick={() => onPick(active === b ? 'all' : b)} className="text-left">
        <Card className={`dashboard-card border-0 transition ${active === b ? 'ring-2 ring-primary' : 'hover:bg-muted/30'}`}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">{ageBucketLabel(b)}</div>
            <div className="text-lg font-semibold">{formatMoney(buckets[b].total)}</div>
            <div className="text-[10px] text-muted-foreground">{buckets[b].count} {noun}</div>
          </CardContent>
        </Card>
      </button>
    ))}
  </div>
);

const BucketSummary: React.FC<{
  title: string;
  buckets: Record<AgeBucket, { count: number; total: number }>;
  viewLink: 'ar' | 'ap';
  /** Money from confirmed-but-uninvoiced orders (no due date, so it can't age) — shown as a
   *  separate "expected" line so committed revenue/spend isn't invisible here. */
  expected?: number;
}> = ({ title, buckets, viewLink, expected = 0 }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
      <CardTitle className="text-sm">{title}</CardTitle>
      <Button size="sm" variant="ghost" onClick={() => document.querySelector<HTMLButtonElement>(`[data-value=${viewLink}]`)?.click()}>View all</Button>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <tbody>
          {AGE_BUCKETS.map((b) => (
            <tr key={b} className="border-b border-border/30">
              <td className="px-4 py-2 text-xs text-muted-foreground">{ageBucketLabel(b)}</td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">{buckets[b].count}</td>
              <td className={`px-4 py-2 text-right font-medium ${b === '90+' || b === '61-90' ? 'text-destructive' : ''}`}>{formatMoney(buckets[b].total)}</td>
            </tr>
          ))}
          {expected > 0 && (
            <tr className="border-b border-border/30 bg-muted/20">
              <td className="px-4 py-2 text-xs text-muted-foreground" title="Confirmed orders not yet invoiced — no due date, so not aged above">Expected (uninvoiced orders)</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right font-medium text-amber-600">{formatMoney(expected)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

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
        <CardTitle className="text-sm flex items-center gap-2"><LineChart className="h-4 w-4" /> Cash flow (next 90 days)</CardTitle>
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
      <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Monthly P&amp;L (last 12 months)</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
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
        <CardTitle className="text-sm flex items-center gap-2"><BanknoteIcon className="h-4 w-4" /> Cash by account</CardTitle>
        <Button size="sm" variant="ghost" onClick={onManage}>{active.length === 0 ? 'Add accounts' : 'Manage'}</Button>
      </CardHeader>
      <CardContent className="p-0">
        {active.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No bank or cash accounts yet. Add them in Settings → Bank accounts to track where your money sits, then pick an account whenever you record a payment.
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
        <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue trend</CardTitle>
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
      <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle>
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
  const payVariant = (s: string) => (s === 'paid' ? 'default' : s === 'partial' ? 'secondary' : 'outline');
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
                  <Badge variant="outline" className="text-[10px]">{ORDER_STATUS_LABEL[o.status]}</Badge>
                  <Badge variant={payVariant(o.payment_status)} className="text-[10px]">{ORDER_PAYMENT_LABEL[o.payment_status]}</Badge>
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
