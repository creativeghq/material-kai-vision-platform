import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
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
} from '@/modules/finance/services/financeService';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { NewSupplierBillDialog } from '@/modules/finance/components/NewSupplierBillDialog';

const AGE_BUCKETS: AgeBucket[] = ['current', '0-30', '31-60', '61-90', '90+'];

const FinancePage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ar, setAr] = useState<AgingRow[]>([]);
  const [ap, setAp] = useState<AgingRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);

  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newBillOpen, setNewBillOpen] = useState(false);

  useEffect(() => { void resolveWorkspace(); }, []);
  useEffect(() => { if (workspaceId) void loadAll(workspaceId); }, [workspaceId]);

  const resolveWorkspace = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    setWorkspaceId(member?.workspace_id ?? null);
  };

  const loadAll = async (wsId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [arRows, apRows, queue, pnlRows, cashRows, invoices] = await Promise.all([
        financeService.getArAging(wsId),
        financeService.getApAging(wsId),
        financeService.getFollowUpQueue(wsId),
        financeService.getMonthlyPnl(wsId, 12),
        financeService.getCashFlowForecast(wsId, 90),
        financeService.listInvoices({ workspaceId: wsId, limit: 25 }),
      ]);
      setAr(arRows);
      setAp(apRows);
      setFollowUps(queue);
      setPnl(pnlRows);
      setCashFlow(cashRows);
      setRecentInvoices(invoices);
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
    const avgDsoProxy = ar.length > 0
      ? Math.round(ar.reduce((acc, r) => acc + (r.days_overdue || 0), 0) / ar.length) + 30
      : 0;
    return { arOutstanding, apOutstanding, overdueTotal, monthRevenue, monthMargin, monthMarginPct, avgDsoProxy };
  }, [ar, ap, pnl]);

  const arBuckets = useMemo(() => bucketize(ar), [ar]);
  const apBuckets = useMemo(() => bucketize(ap), [ap]);

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

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <PieChart className="h-4 w-4 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="ar" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ArrowDownCircle className="h-4 w-4 mr-2" /> Receivables ({ar.length})
            </TabsTrigger>
            <TabsTrigger value="ap" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ArrowUpCircle className="h-4 w-4 mr-2" /> Payables ({ap.length})
            </TabsTrigger>
            <TabsTrigger value="followups" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bell className="h-4 w-4 mr-2" /> Follow-ups ({followUps.length})
            </TabsTrigger>
          </TabsList>

          {/* ─────────── DASHBOARD ─────────── */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                label="DSO (rough)"
                value={`${kpis.avgDsoProxy}d`}
                subtext={`${followUps.length} quote(s) need follow-up`}
              />
            </div>

            {/* AR / AP buckets side-by-side */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BucketSummary title="Receivables by age" buckets={arBuckets} viewLink="ar" />
              <BucketSummary title="Payables by age" buckets={apBuckets} viewLink="ap" />
            </div>

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
                  <Button size="sm" onClick={() => setNewInvoiceOpen(true)}><Plus className="h-3 w-3 mr-1" /> New</Button>
                </CardHeader>
                <CardContent className="p-0">
                  {recentInvoices.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet. Click <strong>New</strong> to create one, or accept a quote and use <em>Issue invoice</em>.</div>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {recentInvoices.slice(0, 6).map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <Link to={`/admin/finance/invoices/${i.id}`} className="text-sm font-mono text-primary hover:underline">
                              {i.internal_number}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {i.issued_at ? `Issued ${new Date(i.issued_at).toLocaleDateString()}` : 'Draft'}
                              {i.due_at && ` · Due ${i.due_at}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={i.status === 'overdue' ? 'destructive' : i.status === 'paid' ? 'default' : 'outline'} className="text-[10px]">{i.status}</Badge>
                            <div className="mt-1 text-sm font-medium">{formatMoney(i.amount_due, i.currency)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─────────── RECEIVABLES ─────────── */}
          <TabsContent value="ar" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Receivables — all open invoices</h3>
                <p className="text-xs text-muted-foreground">Invoices issued, partially paid, or overdue. To invoice an accepted quote, use the Issue invoice button on the quote page.</p>
              </div>
              <Button onClick={() => setNewInvoiceOpen(true)}><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {AGE_BUCKETS.map((b) => (
                <Card key={b} className="dashboard-card border-0">
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">{ageBucketLabel(b)}</div>
                    <div className="text-lg font-semibold">{formatMoney(arBuckets[b].total)}</div>
                    <div className="text-[10px] text-muted-foreground">{arBuckets[b].count} invoice(s)</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Number</th>
                      <th className="px-4 py-2 text-left">Bucket</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Due</th>
                      <th className="px-4 py-2 text-right">Due date</th>
                      <th className="px-4 py-2 text-right">Days overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ar.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No open invoices.</td></tr>
                    )}
                    {ar.map((r) => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/admin/finance/invoices/${r.id}`)}>
                        <td className="px-4 py-2 font-mono text-xs">{r.internal_number}</td>
                        <td className="px-4 py-2">
                          <Badge variant={r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'destructive' : 'outline'}>{ageBucketLabel(r.age_bucket)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.total)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due)}</td>
                        <td className="px-4 py-2 text-right">{r.due_at ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─────────── PAYABLES ─────────── */}
          <TabsContent value="ap" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Payables — supplier bills</h3>
                <p className="text-xs text-muted-foreground">Open and overdue bills from suppliers. Suppliers must be marked <code>is_supplier</code> in CRM.</p>
              </div>
              <Button onClick={() => setNewBillOpen(true)}><Plus className="h-4 w-4 mr-1" /> New supplier bill</Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {AGE_BUCKETS.map((b) => (
                <Card key={b} className="dashboard-card border-0">
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">{ageBucketLabel(b)}</div>
                    <div className="text-lg font-semibold">{formatMoney(apBuckets[b].total)}</div>
                    <div className="text-[10px] text-muted-foreground">{apBuckets[b].count} bill(s)</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-4 py-2 text-left">Bill #</th>
                      <th className="px-4 py-2 text-left">Bucket</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Due</th>
                      <th className="px-4 py-2 text-right">Due date</th>
                      <th className="px-4 py-2 text-right">Days overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ap.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No open supplier bills.</td></tr>
                    )}
                    {ap.map((r) => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs">{r.supplier_bill_number ?? '—'}</td>
                        <td className="px-4 py-2">
                          <Badge variant={r.age_bucket === '90+' || r.age_bucket === '61-90' ? 'destructive' : 'outline'}>{ageBucketLabel(r.age_bucket)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.total)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due)}</td>
                        <td className="px-4 py-2 text-right">{r.due_at ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
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
        </Tabs>
      </div>

      <NewInvoiceDialog
        workspaceId={workspaceId}
        open={newInvoiceOpen}
        onOpenChange={setNewInvoiceOpen}
        onCreated={(invoiceId) => { setNewInvoiceOpen(false); navigate(`/admin/finance/invoices/${invoiceId}`); }}
      />
      <NewSupplierBillDialog
        workspaceId={workspaceId}
        open={newBillOpen}
        onOpenChange={setNewBillOpen}
        onCreated={async () => { setNewBillOpen(false); if (workspaceId) await loadAll(workspaceId); }}
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

const BucketSummary: React.FC<{
  title: string;
  buckets: Record<AgeBucket, { count: number; total: number }>;
  viewLink: 'ar' | 'ap';
}> = ({ title, buckets, viewLink }) => (
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

export default FinancePage;
